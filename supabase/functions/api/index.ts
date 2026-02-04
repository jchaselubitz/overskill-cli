import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  createSupabaseClient,
  createAdminClient,
} from "../_shared/supabase.ts";
import { handleCors, jsonResponse, corsHeaders } from "../_shared/cors.ts";
import {
  unauthorizedError,
  forbiddenError,
  notFoundError,
  conflictError,
  validationError,
  internalError,
} from "../_shared/errors.ts";
import {
  isValidSlug,
  isValidUsername,
  isValidSemver,
  type RegisterRequest,
  type LoginRequest,
  type CreateRegistryRequest,
  type CreateSkillRequest,
  type UpdateSkillRequest,
  type CreateVersionRequest,
  type InviteMemberRequest,
  type UpdateMemberRequest,
  type SyncRequest,
} from "../_shared/types.ts";

// Router helper
interface RouteMatch {
  params: Record<string, string>;
}

function matchRoute(pattern: string, path: string): RouteMatch | null {
  const patternParts = pattern.split("/").filter(Boolean);
  const pathParts = path.split("/").filter(Boolean);

  if (patternParts.length !== pathParts.length) {
    return null;
  }

  const params: Record<string, string> = {};

  for (let i = 0; i < patternParts.length; i++) {
    const patternPart = patternParts[i];
    const pathPart = pathParts[i];

    if (patternPart.startsWith(":")) {
      params[patternPart.slice(1)] = pathPart;
    } else if (patternPart !== pathPart) {
      return null;
    }
  }

  return { params };
}

// Compute SHA256 hash of content
async function sha256(content: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

serve(async (req: Request) => {
  // Handle CORS preflight
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/api/, "");
  const method = req.method;

  try {
    // =========================================================================
    // AUTH ROUTES (no authentication required)
    // =========================================================================

    // POST /auth/register
    if (method === "POST" && path === "/auth/register") {
      const body: RegisterRequest = await req.json();

      if (!body.email || !body.password || !body.username) {
        return validationError("email, password, and username are required");
      }

      if (!isValidUsername(body.username.toLowerCase())) {
        return validationError(
          "Username must be 3-39 characters, lowercase alphanumeric with hyphens, no leading/trailing hyphens"
        );
      }

      const adminClient = createAdminClient();

      // Check username uniqueness
      const { data: existingProfile } = await adminClient
        .from("profiles")
        .select("id")
        .eq("username", body.username.toLowerCase())
        .single();

      if (existingProfile) {
        return conflictError("Username already taken");
      }

      // Create user
      const { data, error } = await adminClient.auth.signUp({
        email: body.email,
        password: body.password,
        options: {
          data: {
            username: body.username.toLowerCase(),
            display_name: body.display_name || body.username,
          },
        },
      });

      if (error) {
        return validationError(error.message);
      }

      return jsonResponse(
        {
          user: {
            id: data.user?.id,
            email: data.user?.email,
            username: body.username.toLowerCase(),
          },
          session: data.session
            ? {
                access_token: data.session.access_token,
                refresh_token: data.session.refresh_token,
              }
            : null,
        },
        201
      );
    }

    // POST /auth/login
    if (method === "POST" && path === "/auth/login") {
      const body: LoginRequest = await req.json();

      if (!body.email || !body.password) {
        return validationError("email and password are required");
      }

      const adminClient = createAdminClient();
      const { data, error } = await adminClient.auth.signInWithPassword({
        email: body.email,
        password: body.password,
      });

      if (error) {
        return unauthorizedError("Invalid email or password");
      }

      // Get profile for username
      const { data: profile } = await adminClient
        .from("profiles")
        .select("username")
        .eq("id", data.user.id)
        .single();

      return jsonResponse({
        user: {
          id: data.user.id,
          email: data.user.email,
          username: profile?.username,
        },
        session: {
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
        },
      });
    }

    // POST /auth/refresh
    if (method === "POST" && path === "/auth/refresh") {
      const body = await req.json();

      if (!body.refresh_token) {
        return validationError("refresh_token is required");
      }

      const adminClient = createAdminClient();
      const { data, error } = await adminClient.auth.refreshSession({
        refresh_token: body.refresh_token,
      });

      if (error) {
        return unauthorizedError("Invalid refresh token");
      }

      return jsonResponse({
        access_token: data.session?.access_token,
        refresh_token: data.session?.refresh_token,
      });
    }

    // =========================================================================
    // AUTHENTICATED ROUTES
    // =========================================================================

    // All routes below require authentication
    let supabase;
    try {
      supabase = createSupabaseClient(req);
    } catch {
      return unauthorizedError();
    }

    // Verify the user is authenticated
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return unauthorizedError();
    }

    // =========================================================================
    // REGISTRIES ROUTES
    // =========================================================================

    // GET /registries - List user's registries
    if (method === "GET" && path === "/registries") {
      const { data: memberships, error } = await supabase
        .from("registry_members")
        .select(
          `
          role,
          registry:registries (
            id,
            slug,
            name,
            description,
            type,
            publish_policy,
            created_at,
            updated_at
          )
        `
        )
        .eq("user_id", user.id);

      if (error) {
        return internalError(error.message);
      }

      const registries = memberships?.map((m: any) => ({
        ...m.registry,
        role: m.role,
      }));

      return jsonResponse({ registries });
    }

    // POST /registries - Create organization registry
    if (method === "POST" && path === "/registries") {
      const body: CreateRegistryRequest = await req.json();

      if (!body.slug || !body.name) {
        return validationError("slug and name are required");
      }

      if (!isValidSlug(body.slug.toLowerCase())) {
        return validationError(
          "Slug must be lowercase alphanumeric with hyphens, 2-50 chars"
        );
      }

      // Check slug uniqueness
      const adminClient = createAdminClient();
      const { data: existing } = await adminClient
        .from("registries")
        .select("id")
        .eq("slug", body.slug.toLowerCase())
        .single();

      if (existing) {
        return conflictError("Registry slug already exists");
      }

      // Create registry
      const { data: registry, error } = await adminClient
        .from("registries")
        .insert({
          slug: body.slug.toLowerCase(),
          name: body.name,
          description: body.description,
          type: body.type || "organization",
          publish_policy: body.publish_policy || "open",
          created_by: user.id,
        })
        .select()
        .single();

      if (error) {
        return internalError(error.message);
      }

      // Add creator as admin
      await adminClient.from("registry_members").insert({
        registry_id: registry.id,
        user_id: user.id,
        role: "admin",
      });

      return jsonResponse({ registry }, 201);
    }

    // GET /registries/:slug
    const registryMatch = matchRoute("/registries/:slug", path);
    if (method === "GET" && registryMatch) {
      const { slug } = registryMatch.params;

      const { data: registry, error } = await supabase
        .from("registries")
        .select("*")
        .eq("slug", slug)
        .single();

      if (error || !registry) {
        return notFoundError(`Registry '${slug}' not found`);
      }

      // Get user's role in this registry
      const { data: membership } = await supabase
        .from("registry_members")
        .select("role")
        .eq("registry_id", registry.id)
        .eq("user_id", user.id)
        .single();

      return jsonResponse({
        ...registry,
        role: membership?.role,
      });
    }

    // PUT /registries/:slug
    const updateRegistryMatch = matchRoute("/registries/:slug", path);
    if (method === "PUT" && updateRegistryMatch) {
      const { slug } = updateRegistryMatch.params;
      const body = await req.json();

      const { data: registry, error } = await supabase
        .from("registries")
        .update({
          name: body.name,
          description: body.description,
          publish_policy: body.publish_policy,
        })
        .eq("slug", slug)
        .select()
        .single();

      if (error) {
        if (error.code === "PGRST116") {
          return notFoundError(`Registry '${slug}' not found`);
        }
        return forbiddenError(
          "You don't have permission to update this registry"
        );
      }

      return jsonResponse({ registry });
    }

    // GET /registries/:slug/members
    const membersMatch = matchRoute("/registries/:slug/members", path);
    if (method === "GET" && membersMatch) {
      const { slug } = membersMatch.params;

      // Get registry
      const { data: registry, error: regError } = await supabase
        .from("registries")
        .select("id")
        .eq("slug", slug)
        .single();

      if (regError || !registry) {
        return notFoundError(`Registry '${slug}' not found`);
      }

      const { data: members, error } = await supabase
        .from("registry_members")
        .select(
          `
          role,
          created_at,
          user:profiles (
            id,
            username,
            display_name,
            avatar_url
          )
        `
        )
        .eq("registry_id", registry.id);

      if (error) {
        return internalError(error.message);
      }

      return jsonResponse({
        members: members?.map((m: any) => ({
          ...m.user,
          role: m.role,
          joined_at: m.created_at,
        })),
      });
    }

    // POST /registries/:slug/members/invite
    const inviteMatch = matchRoute("/registries/:slug/members/invite", path);
    if (method === "POST" && inviteMatch) {
      const { slug } = inviteMatch.params;
      const body: InviteMemberRequest = await req.json();

      if (!body.email || !body.role) {
        return validationError("email and role are required");
      }

      // Get registry (RLS ensures user has access)
      const { data: registry, error: regError } = await supabase
        .from("registries")
        .select("id")
        .eq("slug", slug)
        .single();

      if (regError || !registry) {
        return notFoundError(`Registry '${slug}' not found`);
      }

      // Check if user is admin
      const { data: membership } = await supabase
        .from("registry_members")
        .select("role")
        .eq("registry_id", registry.id)
        .eq("user_id", user.id)
        .single();

      if (membership?.role !== "admin") {
        return forbiddenError("Only admins can invite members");
      }

      const adminClient = createAdminClient();

      // Check if user with this email exists
      const { data: existingUsers } = await adminClient
        .from("profiles")
        .select("id")
        .eq(
          "id",
          adminClient.from("auth.users").select("id").eq("email", body.email)
        );

      // Check via auth API
      const { data: authData } = await adminClient.auth.admin.listUsers();
      const existingUser = authData?.users?.find((u) => u.email === body.email);

      if (existingUser) {
        // Check if already a member
        const { data: existingMember } = await adminClient
          .from("registry_members")
          .select("id")
          .eq("registry_id", registry.id)
          .eq("user_id", existingUser.id)
          .single();

        if (existingMember) {
          return conflictError("User is already a member of this registry");
        }

        // Add directly
        const { error: addError } = await adminClient
          .from("registry_members")
          .insert({
            registry_id: registry.id,
            user_id: existingUser.id,
            role: body.role,
          });

        if (addError) {
          return internalError(addError.message);
        }

        return jsonResponse({
          member: {
            user_id: existingUser.id,
            role: body.role,
          },
        });
      }

      // Create invitation
      const { data: invitation, error: invError } = await adminClient
        .from("invitations")
        .insert({
          registry_id: registry.id,
          email: body.email,
          role: body.role,
          invited_by: user.id,
        })
        .select()
        .single();

      if (invError) {
        if (invError.code === "23505") {
          return conflictError(
            "An invitation is already pending for this email"
          );
        }
        return internalError(invError.message);
      }

      return jsonResponse({ invitation }, 201);
    }

    // PUT /registries/:slug/members/:userId
    const updateMemberMatch = matchRoute(
      "/registries/:slug/members/:userId",
      path
    );
    if (method === "PUT" && updateMemberMatch) {
      const { slug, userId } = updateMemberMatch.params;
      const body: UpdateMemberRequest = await req.json();

      // Get registry
      const { data: registry, error: regError } = await supabase
        .from("registries")
        .select("id")
        .eq("slug", slug)
        .single();

      if (regError || !registry) {
        return notFoundError(`Registry '${slug}' not found`);
      }

      const { data: member, error } = await supabase
        .from("registry_members")
        .update({ role: body.role })
        .eq("registry_id", registry.id)
        .eq("user_id", userId)
        .select()
        .single();

      if (error) {
        return forbiddenError(
          "You don't have permission to update this member"
        );
      }

      return jsonResponse({ member });
    }

    // DELETE /registries/:slug/members/:userId
    const deleteMemberMatch = matchRoute(
      "/registries/:slug/members/:userId",
      path
    );
    if (method === "DELETE" && deleteMemberMatch) {
      const { slug, userId } = deleteMemberMatch.params;

      // Get registry
      const { data: registry, error: regError } = await supabase
        .from("registries")
        .select("id")
        .eq("slug", slug)
        .single();

      if (regError || !registry) {
        return notFoundError(`Registry '${slug}' not found`);
      }

      const { error } = await supabase
        .from("registry_members")
        .delete()
        .eq("registry_id", registry.id)
        .eq("user_id", userId);

      if (error) {
        return forbiddenError(
          "You don't have permission to remove this member"
        );
      }

      return jsonResponse({ success: true });
    }

    // POST /registries/:slug/invitations/:id/accept
    const acceptMatch = matchRoute(
      "/registries/:slug/invitations/:id/accept",
      path
    );
    if (method === "POST" && acceptMatch) {
      const { id } = acceptMatch.params;

      const adminClient = createAdminClient();

      // Get invitation
      const { data: invitation, error: invError } = await adminClient
        .from("invitations")
        .select("*")
        .eq("id", id)
        .single();

      if (invError || !invitation) {
        return notFoundError("Invitation not found");
      }

      // Verify email matches
      if (invitation.email !== user.email) {
        return forbiddenError("This invitation is not for your email address");
      }

      if (invitation.status !== "pending") {
        return validationError(`Invitation is already ${invitation.status}`);
      }

      if (new Date(invitation.expires_at) < new Date()) {
        await adminClient
          .from("invitations")
          .update({ status: "expired" })
          .eq("id", id);
        return validationError("Invitation has expired");
      }

      // Update invitation and add member
      await adminClient
        .from("invitations")
        .update({ status: "accepted" })
        .eq("id", id);

      const { data: member, error: memberError } = await adminClient
        .from("registry_members")
        .insert({
          registry_id: invitation.registry_id,
          user_id: user.id,
          role: invitation.role,
        })
        .select()
        .single();

      if (memberError) {
        return internalError(memberError.message);
      }

      return jsonResponse({ member });
    }

    // POST /registries/:slug/invitations/:id/decline
    const declineMatch = matchRoute(
      "/registries/:slug/invitations/:id/decline",
      path
    );
    if (method === "POST" && declineMatch) {
      const { id } = declineMatch.params;

      const { data: invitation, error: invError } = await supabase
        .from("invitations")
        .select("*")
        .eq("id", id)
        .single();

      if (invError || !invitation) {
        return notFoundError("Invitation not found");
      }

      if (invitation.email !== user.email) {
        return forbiddenError("This invitation is not for your email address");
      }

      const { error } = await supabase
        .from("invitations")
        .update({ status: "declined" })
        .eq("id", id);

      if (error) {
        return internalError(error.message);
      }

      return jsonResponse({ success: true });
    }

    // =========================================================================
    // SKILLS ROUTES
    // =========================================================================

    // GET /registries/:slug/skills
    const skillsMatch = matchRoute("/registries/:slug/skills", path);
    if (method === "GET" && skillsMatch) {
      const { slug } = skillsMatch.params;
      const tags = url.searchParams.get("tags")?.split(",").filter(Boolean);
      const compat = url.searchParams.get("compat")?.split(",").filter(Boolean);
      const search = url.searchParams.get("search");

      // Get registry
      const { data: registry, error: regError } = await supabase
        .from("registries")
        .select("id")
        .eq("slug", slug)
        .single();

      if (regError || !registry) {
        return notFoundError(`Registry '${slug}' not found`);
      }

      let query = supabase
        .from("skills")
        .select(
          `
          *,
          latest_version:skill_versions!inner (
            version,
            created_at
          ),
          creator:profiles!skills_created_by_fkey (
            username
          )
        `
        )
        .eq("registry_id", registry.id)
        .eq("skill_versions.is_latest", true);

      if (tags?.length) {
        query = query.overlaps("tags", tags);
      }

      if (compat?.length) {
        query = query.overlaps("compat", compat);
      }

      if (search) {
        query = query.or(
          `name.ilike.%${search}%,description.ilike.%${search}%`
        );
      }

      const { data: skills, error } = await query;

      if (error) {
        return internalError(error.message);
      }

      return jsonResponse({
        skills: skills?.map((s: any) => ({
          slug: s.slug,
          name: s.name,
          description: s.description,
          tags: s.tags,
          compat: s.compat,
          version: s.latest_version?.[0]?.version,
          created_by: s.creator?.username,
          updated_at: s.updated_at,
        })),
      });
    }

    // POST /registries/:slug/skills
    const createSkillMatch = matchRoute("/registries/:slug/skills", path);
    if (method === "POST" && createSkillMatch) {
      const { slug } = createSkillMatch.params;
      const body: CreateSkillRequest = await req.json();

      if (!body.slug || !body.name || !body.content) {
        return validationError("slug, name, and content are required");
      }

      if (!isValidSlug(body.slug.toLowerCase())) {
        return validationError(
          "Skill slug must be lowercase alphanumeric with hyphens, 2-50 chars"
        );
      }

      const version = body.version || "1.0.0";
      if (!isValidSemver(version)) {
        return validationError("Invalid version format (must be semver)");
      }

      // Get registry
      const { data: registry, error: regError } = await supabase
        .from("registries")
        .select("id")
        .eq("slug", slug)
        .single();

      if (regError || !registry) {
        return notFoundError(`Registry '${slug}' not found`);
      }

      // Create skill
      const { data: skill, error: skillError } = await supabase
        .from("skills")
        .insert({
          registry_id: registry.id,
          slug: body.slug.toLowerCase(),
          name: body.name,
          description: body.description,
          tags: body.tags || [],
          compat: body.compat || [],
          created_by: user.id,
        })
        .select()
        .single();

      if (skillError) {
        if (skillError.code === "23505") {
          return conflictError(
            `Skill '${body.slug}' already exists in registry '${slug}'`
          );
        }
        if (skillError.code === "42501") {
          return forbiddenError(
            "You don't have permission to create skills in this registry"
          );
        }
        return internalError(skillError.message);
      }

      // Create initial version
      const { error: versionError } = await supabase
        .from("skill_versions")
        .insert({
          skill_id: skill.id,
          version,
          content: body.content,
          published_by: user.id,
          is_latest: true,
        });

      if (versionError) {
        // Rollback skill creation
        await supabase.from("skills").delete().eq("id", skill.id);
        return internalError(versionError.message);
      }

      return jsonResponse({ skill, version }, 201);
    }

    // GET /registries/:slug/skills/:skillSlug
    const skillMatch = matchRoute("/registries/:slug/skills/:skillSlug", path);
    if (method === "GET" && skillMatch) {
      const { slug, skillSlug } = skillMatch.params;

      // Get registry
      const { data: registry, error: regError } = await supabase
        .from("registries")
        .select("id")
        .eq("slug", slug)
        .single();

      if (regError || !registry) {
        return notFoundError(`Registry '${slug}' not found`);
      }

      const { data: skill, error } = await supabase
        .from("skills")
        .select(
          `
          *,
          latest_version:skill_versions!inner (
            version,
            content,
            changelog,
            created_at
          ),
          creator:profiles!skills_created_by_fkey (
            username
          ),
          maintainers:skill_maintainers (
            user:profiles (
              username
            )
          )
        `
        )
        .eq("registry_id", registry.id)
        .eq("slug", skillSlug)
        .eq("skill_versions.is_latest", true)
        .single();

      if (error || !skill) {
        return notFoundError(
          `Skill '${skillSlug}' not found in registry '${slug}'`
        );
      }

      return jsonResponse({
        slug: skill.slug,
        name: skill.name,
        description: skill.description,
        tags: skill.tags,
        compat: skill.compat,
        version: skill.latest_version?.[0]?.version,
        content: skill.latest_version?.[0]?.content,
        created_by: skill.creator?.username,
        maintainers: [
          skill.creator?.username,
          ...(skill.maintainers?.map((m: any) => m.user?.username) || []),
        ].filter(Boolean),
        updated_at: skill.updated_at,
      });
    }

    // PUT /registries/:slug/skills/:skillSlug
    const updateSkillMatch = matchRoute(
      "/registries/:slug/skills/:skillSlug",
      path
    );
    if (method === "PUT" && updateSkillMatch) {
      const { slug, skillSlug } = updateSkillMatch.params;
      const body: UpdateSkillRequest = await req.json();

      // Get registry
      const { data: registry, error: regError } = await supabase
        .from("registries")
        .select("id")
        .eq("slug", slug)
        .single();

      if (regError || !registry) {
        return notFoundError(`Registry '${slug}' not found`);
      }

      const { data: skill, error } = await supabase
        .from("skills")
        .update({
          name: body.name,
          description: body.description,
          tags: body.tags,
          compat: body.compat,
        })
        .eq("registry_id", registry.id)
        .eq("slug", skillSlug)
        .select()
        .single();

      if (error) {
        if (error.code === "PGRST116") {
          return notFoundError(
            `Skill '${skillSlug}' not found in registry '${slug}'`
          );
        }
        return forbiddenError("You don't have permission to update this skill");
      }

      return jsonResponse({ skill });
    }

    // DELETE /registries/:slug/skills/:skillSlug
    const deleteSkillMatch = matchRoute(
      "/registries/:slug/skills/:skillSlug",
      path
    );
    if (method === "DELETE" && deleteSkillMatch) {
      const { slug, skillSlug } = deleteSkillMatch.params;

      // Get registry
      const { data: registry, error: regError } = await supabase
        .from("registries")
        .select("id")
        .eq("slug", slug)
        .single();

      if (regError || !registry) {
        return notFoundError(`Registry '${slug}' not found`);
      }

      const { error } = await supabase
        .from("skills")
        .delete()
        .eq("registry_id", registry.id)
        .eq("slug", skillSlug);

      if (error) {
        return forbiddenError("You don't have permission to delete this skill");
      }

      return jsonResponse({ success: true });
    }

    // GET /registries/:slug/skills/:skillSlug/versions
    const versionsMatch = matchRoute(
      "/registries/:slug/skills/:skillSlug/versions",
      path
    );
    if (method === "GET" && versionsMatch) {
      const { slug, skillSlug } = versionsMatch.params;

      // Get registry and skill
      const { data: registry, error: regError } = await supabase
        .from("registries")
        .select("id")
        .eq("slug", slug)
        .single();

      if (regError || !registry) {
        return notFoundError(`Registry '${slug}' not found`);
      }

      const { data: skill, error: skillError } = await supabase
        .from("skills")
        .select("id")
        .eq("registry_id", registry.id)
        .eq("slug", skillSlug)
        .single();

      if (skillError || !skill) {
        return notFoundError(
          `Skill '${skillSlug}' not found in registry '${slug}'`
        );
      }

      const { data: versions, error } = await supabase
        .from("skill_versions")
        .select(
          `
          version,
          changelog,
          is_latest,
          created_at,
          publisher:profiles!skill_versions_published_by_fkey (
            username
          )
        `
        )
        .eq("skill_id", skill.id)
        .order("created_at", { ascending: false });

      if (error) {
        return internalError(error.message);
      }

      return jsonResponse({
        versions: versions?.map((v: any) => ({
          version: v.version,
          changelog: v.changelog,
          is_latest: v.is_latest,
          published_by: v.publisher?.username,
          created_at: v.created_at,
        })),
      });
    }

    // POST /registries/:slug/skills/:skillSlug/versions
    const createVersionMatch = matchRoute(
      "/registries/:slug/skills/:skillSlug/versions",
      path
    );
    if (method === "POST" && createVersionMatch) {
      const { slug, skillSlug } = createVersionMatch.params;
      const body: CreateVersionRequest = await req.json();

      if (!body.version || !body.content) {
        return validationError("version and content are required");
      }

      if (!isValidSemver(body.version)) {
        return validationError("Invalid version format (must be semver)");
      }

      // Get registry and skill
      const { data: registry, error: regError } = await supabase
        .from("registries")
        .select("id")
        .eq("slug", slug)
        .single();

      if (regError || !registry) {
        return notFoundError(`Registry '${slug}' not found`);
      }

      const { data: skill, error: skillError } = await supabase
        .from("skills")
        .select("id")
        .eq("registry_id", registry.id)
        .eq("slug", skillSlug)
        .single();

      if (skillError || !skill) {
        return notFoundError(
          `Skill '${skillSlug}' not found in registry '${slug}'`
        );
      }

      // Create version
      const { data: version, error } = await supabase
        .from("skill_versions")
        .insert({
          skill_id: skill.id,
          version: body.version,
          content: body.content,
          changelog: body.changelog,
          published_by: user.id,
          is_latest: true,
        })
        .select()
        .single();

      if (error) {
        if (error.code === "23505") {
          return conflictError(
            `Version '${body.version}' already exists for skill '${skillSlug}'`
          );
        }
        if (error.code === "42501") {
          return forbiddenError(
            "You don't have permission to publish versions for this skill"
          );
        }
        return internalError(error.message);
      }

      // Update skill's updated_at
      await supabase
        .from("skills")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", skill.id);

      return jsonResponse(
        {
          version: version.version,
          changelog: version.changelog,
        },
        201
      );
    }

    // GET /registries/:slug/skills/:skillSlug/versions/:version
    const versionMatch = matchRoute(
      "/registries/:slug/skills/:skillSlug/versions/:version",
      path
    );
    if (method === "GET" && versionMatch) {
      const { slug, skillSlug, version: versionParam } = versionMatch.params;

      // Get registry and skill
      const { data: registry, error: regError } = await supabase
        .from("registries")
        .select("id")
        .eq("slug", slug)
        .single();

      if (regError || !registry) {
        return notFoundError(`Registry '${slug}' not found`);
      }

      const { data: skill, error: skillError } = await supabase
        .from("skills")
        .select("id")
        .eq("registry_id", registry.id)
        .eq("slug", skillSlug)
        .single();

      if (skillError || !skill) {
        return notFoundError(
          `Skill '${skillSlug}' not found in registry '${slug}'`
        );
      }

      const { data: version, error } = await supabase
        .from("skill_versions")
        .select(
          `
          version,
          content,
          changelog,
          is_latest,
          created_at,
          publisher:profiles!skill_versions_published_by_fkey (
            username
          )
        `
        )
        .eq("skill_id", skill.id)
        .eq("version", versionParam)
        .single();

      if (error || !version) {
        return notFoundError(
          `Version '${versionParam}' not found for skill '${skillSlug}'`
        );
      }

      return jsonResponse({
        version: version.version,
        content: version.content,
        changelog: version.changelog,
        is_latest: version.is_latest,
        published_by: version.publisher?.username,
        created_at: version.created_at,
      });
    }

    // =========================================================================
    // SEARCH ROUTE
    // =========================================================================

    // GET /search
    if (method === "GET" && path === "/search") {
      const q = url.searchParams.get("q");
      const tags = url.searchParams.get("tags")?.split(",").filter(Boolean);
      const compat = url.searchParams.get("compat")?.split(",").filter(Boolean);

      if (!q) {
        return validationError("Query parameter 'q' is required");
      }

      // Get all registries user has access to
      const { data: memberships } = await supabase
        .from("registry_members")
        .select("registry_id")
        .eq("user_id", user.id);

      const registryIds = memberships?.map((m) => m.registry_id) || [];

      if (registryIds.length === 0) {
        return jsonResponse({ results: [] });
      }

      let query = supabase
        .from("skills")
        .select(
          `
          *,
          registry:registries (
            slug
          ),
          latest_version:skill_versions!inner (
            version
          )
        `
        )
        .in("registry_id", registryIds)
        .eq("skill_versions.is_latest", true)
        .or(`name.ilike.%${q}%,description.ilike.%${q}%`);

      if (tags?.length) {
        query = query.overlaps("tags", tags);
      }

      if (compat?.length) {
        query = query.overlaps("compat", compat);
      }

      const { data: skills, error } = await query;

      if (error) {
        return internalError(error.message);
      }

      return jsonResponse({
        results: skills?.map((s: any) => ({
          registry: s.registry?.slug,
          slug: s.slug,
          name: s.name,
          description: s.description,
          tags: s.tags,
          compat: s.compat,
          version: s.latest_version?.[0]?.version,
        })),
      });
    }

    // =========================================================================
    // SYNC ROUTE
    // =========================================================================

    // POST /sync
    if (method === "POST" && path === "/sync") {
      const body: SyncRequest = await req.json();

      if (!body.skills || !Array.isArray(body.skills)) {
        return validationError("skills array is required");
      }

      const results: Array<{
        registry: string;
        slug: string;
        version: string;
        content: string;
        sha256: string;
      }> = [];

      const errors: Array<{
        registry: string;
        slug: string;
        error: string;
      }> = [];

      for (const skillReq of body.skills) {
        try {
          // Get registry
          const { data: registry, error: regError } = await supabase
            .from("registries")
            .select("id")
            .eq("slug", skillReq.registry)
            .single();

          if (regError || !registry) {
            errors.push({
              registry: skillReq.registry,
              slug: skillReq.slug,
              error: "not_found",
            });
            continue;
          }

          // Get skill
          const { data: skill, error: skillError } = await supabase
            .from("skills")
            .select("id")
            .eq("registry_id", registry.id)
            .eq("slug", skillReq.slug)
            .single();

          if (skillError || !skill) {
            errors.push({
              registry: skillReq.registry,
              slug: skillReq.slug,
              error: "not_found",
            });
            continue;
          }

          // Get version (latest or specific)
          let versionQuery = supabase
            .from("skill_versions")
            .select("version, content")
            .eq("skill_id", skill.id);

          if (skillReq.version) {
            // Handle version constraints
            if (
              skillReq.version.startsWith(">=") ||
              skillReq.version.startsWith("^") ||
              skillReq.version.startsWith("~")
            ) {
              // For MVP, just get latest - proper semver resolution would need more logic
              versionQuery = versionQuery.eq("is_latest", true);
            } else {
              // Exact version
              versionQuery = versionQuery.eq("version", skillReq.version);
            }
          } else {
            versionQuery = versionQuery.eq("is_latest", true);
          }

          const { data: version, error: versionError } =
            await versionQuery.single();

          if (versionError || !version) {
            errors.push({
              registry: skillReq.registry,
              slug: skillReq.slug,
              error: "version_not_found",
            });
            continue;
          }

          const hash = await sha256(version.content);

          results.push({
            registry: skillReq.registry,
            slug: skillReq.slug,
            version: version.version,
            content: version.content,
            sha256: hash,
          });
        } catch (err) {
          errors.push({
            registry: skillReq.registry,
            slug: skillReq.slug,
            error: "internal_error",
          });
        }
      }

      return jsonResponse({ skills: results, errors });
    }

    // =========================================================================
    // INVITATIONS (list pending for current user)
    // =========================================================================

    // GET /invitations
    if (method === "GET" && path === "/invitations") {
      const { data: invitations, error } = await supabase
        .from("invitations")
        .select(
          `
          *,
          registry:registries (
            slug,
            name
          ),
          inviter:profiles!invitations_invited_by_fkey (
            username
          )
        `
        )
        .eq("status", "pending");

      if (error) {
        return internalError(error.message);
      }

      return jsonResponse({
        invitations: invitations?.map((i: any) => ({
          id: i.id,
          registry_slug: i.registry?.slug,
          registry_name: i.registry?.name,
          role: i.role,
          invited_by: i.inviter?.username,
          expires_at: i.expires_at,
        })),
      });
    }

    // =========================================================================
    // 404 - Route not found
    // =========================================================================

    return notFoundError(`Route ${method} ${path} not found`);
  } catch (err) {
    console.error("API Error:", err);
    return internalError(err instanceof Error ? err.message : "Unknown error");
  }
});
