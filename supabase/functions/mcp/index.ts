import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createSupabaseClient, createAdminClient } from "../_shared/supabase.ts";
import { corsHeaders } from "../_shared/cors.ts";

// MCP Protocol Types
interface MCPRequest {
  jsonrpc: "2.0";
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
}

interface MCPResponse {
  jsonrpc: "2.0";
  id: string | number;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

interface MCPNotification {
  jsonrpc: "2.0";
  method: string;
  params?: Record<string, unknown>;
}

// Tool definitions
const tools = [
  {
    name: "list_skills",
    description: "List all skills available to the user across all their registries. Optionally filter by registry.",
    inputSchema: {
      type: "object",
      properties: {
        registry: { type: "string", description: "Optional registry slug to filter by" },
        tags: { type: "array", items: { type: "string" }, description: "Optional tag filter" },
        compat: { type: "array", items: { type: "string" }, description: "Optional compatibility filter" },
      },
    },
  },
  {
    name: "get_skill",
    description: "Get the full content of a specific skill. Returns the complete SKILL.md markdown.",
    inputSchema: {
      type: "object",
      properties: {
        registry: { type: "string", description: "Registry slug" },
        slug: { type: "string", description: "Skill slug" },
        version: { type: "string", description: "Optional specific version. Defaults to latest." },
      },
      required: ["registry", "slug"],
    },
  },
  {
    name: "search_skills",
    description: "Search for skills by name, description, or tags across all accessible registries.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query" },
        tags: { type: "array", items: { type: "string" } },
        compat: { type: "array", items: { type: "string" } },
      },
      required: ["query"],
    },
  },
  {
    name: "create_skill",
    description: "Create a new skill in a registry. Requires contributor or admin role.",
    inputSchema: {
      type: "object",
      properties: {
        registry: { type: "string", description: "Registry slug to create in" },
        slug: { type: "string", description: "URL-safe skill identifier" },
        name: { type: "string", description: "Human-readable skill name" },
        description: { type: "string" },
        content: { type: "string", description: "Full SKILL.md markdown content" },
        tags: { type: "array", items: { type: "string" } },
        compat: { type: "array", items: { type: "string" } },
      },
      required: ["registry", "slug", "name", "content"],
    },
  },
  {
    name: "update_skill",
    description: "Publish a new version of an existing skill. Requires write access.",
    inputSchema: {
      type: "object",
      properties: {
        registry: { type: "string" },
        slug: { type: "string" },
        content: { type: "string", description: "Updated SKILL.md markdown content" },
        version: { type: "string", description: "New version number (semver)" },
        changelog: { type: "string", description: "Description of changes" },
      },
      required: ["registry", "slug", "content", "version"],
    },
  },
  {
    name: "list_registries",
    description: "List all registries the user has access to.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "report_skill_issue",
    description: "Report an issue with a skill, such as incorrect instructions or errors encountered during use.",
    inputSchema: {
      type: "object",
      properties: {
        registry: { type: "string" },
        slug: { type: "string" },
        issue: { type: "string", description: "Description of the issue" },
        context: { type: "string", description: "What the agent was trying to do when the issue occurred" },
      },
      required: ["registry", "slug", "issue"],
    },
  },
];

// Session storage (in-memory for MVP - would use Redis/DB in production)
const sessions = new Map<string, { userId: string; supabase: ReturnType<typeof createSupabaseClient> }>();

// Generate session ID
function generateSessionId(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, "0")).join("");
}

// Tool handlers
async function handleToolCall(
  toolName: string,
  args: Record<string, unknown>,
  supabase: ReturnType<typeof createSupabaseClient>,
  userId: string
): Promise<unknown> {
  switch (toolName) {
    case "list_registries": {
      const { data: memberships } = await supabase
        .from("registry_members")
        .select(`
          role,
          registry:registries (
            slug,
            name,
            type
          )
        `)
        .eq("user_id", userId);

      return memberships?.map((m: any) => ({
        slug: m.registry?.slug,
        name: m.registry?.name,
        type: m.registry?.type,
        role: m.role,
      })) || [];
    }

    case "list_skills": {
      const { registry, tags, compat } = args as {
        registry?: string;
        tags?: string[];
        compat?: string[];
      };

      // Get registries user has access to
      let registryIds: string[] = [];

      if (registry) {
        const { data: reg } = await supabase
          .from("registries")
          .select("id")
          .eq("slug", registry)
          .single();

        if (reg) {
          registryIds = [reg.id];
        }
      } else {
        const { data: memberships } = await supabase
          .from("registry_members")
          .select("registry_id")
          .eq("user_id", userId);

        registryIds = memberships?.map((m) => m.registry_id) || [];
      }

      if (registryIds.length === 0) {
        return [];
      }

      let query = supabase
        .from("skills")
        .select(`
          slug,
          name,
          description,
          tags,
          compat,
          registry:registries (slug),
          latest_version:skill_versions!inner (version)
        `)
        .in("registry_id", registryIds)
        .eq("skill_versions.is_latest", true);

      if (tags?.length) {
        query = query.overlaps("tags", tags);
      }
      if (compat?.length) {
        query = query.overlaps("compat", compat);
      }

      const { data: skills } = await query;

      return skills?.map((s: any) => ({
        registry: s.registry?.slug,
        slug: s.slug,
        name: s.name,
        description: s.description,
        version: s.latest_version?.[0]?.version,
        tags: s.tags,
        compat: s.compat,
      })) || [];
    }

    case "get_skill": {
      const { registry, slug, version } = args as {
        registry: string;
        slug: string;
        version?: string;
      };

      // Get registry
      const { data: reg } = await supabase
        .from("registries")
        .select("id")
        .eq("slug", registry)
        .single();

      if (!reg) {
        throw new Error(`Registry '${registry}' not found`);
      }

      // Get skill
      const { data: skill } = await supabase
        .from("skills")
        .select("id, name")
        .eq("registry_id", reg.id)
        .eq("slug", slug)
        .single();

      if (!skill) {
        throw new Error(`Skill '${slug}' not found in registry '${registry}'`);
      }

      // Get version
      let versionQuery = supabase
        .from("skill_versions")
        .select("version, content")
        .eq("skill_id", skill.id);

      if (version) {
        versionQuery = versionQuery.eq("version", version);
      } else {
        versionQuery = versionQuery.eq("is_latest", true);
      }

      const { data: ver } = await versionQuery.single();

      if (!ver) {
        throw new Error(`Version not found for skill '${slug}'`);
      }

      return {
        registry,
        slug,
        name: skill.name,
        version: ver.version,
        content: ver.content,
      };
    }

    case "search_skills": {
      const { query, tags, compat } = args as {
        query: string;
        tags?: string[];
        compat?: string[];
      };

      // Get registries user has access to
      const { data: memberships } = await supabase
        .from("registry_members")
        .select("registry_id")
        .eq("user_id", userId);

      const registryIds = memberships?.map((m) => m.registry_id) || [];

      if (registryIds.length === 0) {
        return [];
      }

      let searchQuery = supabase
        .from("skills")
        .select(`
          slug,
          name,
          description,
          tags,
          compat,
          registry:registries (slug),
          latest_version:skill_versions!inner (version)
        `)
        .in("registry_id", registryIds)
        .eq("skill_versions.is_latest", true)
        .or(`name.ilike.%${query}%,description.ilike.%${query}%`);

      if (tags?.length) {
        searchQuery = searchQuery.overlaps("tags", tags);
      }
      if (compat?.length) {
        searchQuery = searchQuery.overlaps("compat", compat);
      }

      const { data: skills } = await searchQuery;

      return skills?.map((s: any) => ({
        registry: s.registry?.slug,
        slug: s.slug,
        name: s.name,
        description: s.description,
        version: s.latest_version?.[0]?.version,
        tags: s.tags,
        compat: s.compat,
      })) || [];
    }

    case "create_skill": {
      const { registry, slug, name, description, content, tags, compat } = args as {
        registry: string;
        slug: string;
        name: string;
        description?: string;
        content: string;
        tags?: string[];
        compat?: string[];
      };

      // Get registry
      const { data: reg } = await supabase
        .from("registries")
        .select("id")
        .eq("slug", registry)
        .single();

      if (!reg) {
        throw new Error(`Registry '${registry}' not found`);
      }

      // Create skill
      const { data: skill, error: skillError } = await supabase
        .from("skills")
        .insert({
          registry_id: reg.id,
          slug: slug.toLowerCase(),
          name,
          description,
          tags: tags || [],
          compat: compat || [],
          created_by: userId,
        })
        .select()
        .single();

      if (skillError) {
        throw new Error(skillError.message);
      }

      // Create initial version
      await supabase.from("skill_versions").insert({
        skill_id: skill.id,
        version: "1.0.0",
        content,
        published_by: userId,
        is_latest: true,
      });

      return { success: true, skill: { registry, slug, name, version: "1.0.0" } };
    }

    case "update_skill": {
      const { registry, slug, content, version, changelog } = args as {
        registry: string;
        slug: string;
        content: string;
        version: string;
        changelog?: string;
      };

      // Get registry
      const { data: reg } = await supabase
        .from("registries")
        .select("id")
        .eq("slug", registry)
        .single();

      if (!reg) {
        throw new Error(`Registry '${registry}' not found`);
      }

      // Get skill
      const { data: skill } = await supabase
        .from("skills")
        .select("id")
        .eq("registry_id", reg.id)
        .eq("slug", slug)
        .single();

      if (!skill) {
        throw new Error(`Skill '${slug}' not found in registry '${registry}'`);
      }

      // Create new version
      const { error: versionError } = await supabase.from("skill_versions").insert({
        skill_id: skill.id,
        version,
        content,
        changelog,
        published_by: userId,
        is_latest: true,
      });

      if (versionError) {
        throw new Error(versionError.message);
      }

      return { success: true, version };
    }

    case "report_skill_issue": {
      const { registry, slug, issue, context } = args as {
        registry: string;
        slug: string;
        issue: string;
        context?: string;
      };

      // Get registry
      const { data: reg } = await supabase
        .from("registries")
        .select("id")
        .eq("slug", registry)
        .single();

      if (!reg) {
        throw new Error(`Registry '${registry}' not found`);
      }

      // Get skill
      const { data: skill } = await supabase
        .from("skills")
        .select("id")
        .eq("registry_id", reg.id)
        .eq("slug", slug)
        .single();

      if (!skill) {
        throw new Error(`Skill '${slug}' not found in registry '${registry}'`);
      }

      // Create issue
      const adminClient = createAdminClient();
      await adminClient.from("skill_issues").insert({
        skill_id: skill.id,
        reported_by: userId,
        issue,
        context,
      });

      return { success: true, message: "Issue reported successfully" };
    }

    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}

// Handle MCP request
async function handleMCPRequest(
  request: MCPRequest,
  supabase: ReturnType<typeof createSupabaseClient> | null,
  userId: string | null
): Promise<MCPResponse> {
  const { id, method, params } = request;

  try {
    switch (method) {
      case "initialize":
        return {
          jsonrpc: "2.0",
          id,
          result: {
            protocolVersion: "2024-11-05",
            capabilities: {
              tools: {},
            },
            serverInfo: {
              name: "skills-platform",
              version: "1.0.0",
            },
          },
        };

      case "tools/list":
        return {
          jsonrpc: "2.0",
          id,
          result: { tools },
        };

      case "tools/call": {
        if (!supabase || !userId) {
          return {
            jsonrpc: "2.0",
            id,
            error: {
              code: -32600,
              message: "Not authenticated",
            },
          };
        }

        const toolName = (params as any)?.name;
        const toolArgs = (params as any)?.arguments || {};

        const result = await handleToolCall(toolName, toolArgs, supabase, userId);

        return {
          jsonrpc: "2.0",
          id,
          result: {
            content: [
              {
                type: "text",
                text: typeof result === "string" ? result : JSON.stringify(result, null, 2),
              },
            ],
          },
        };
      }

      default:
        return {
          jsonrpc: "2.0",
          id,
          error: {
            code: -32601,
            message: `Method not found: ${method}`,
          },
        };
    }
  } catch (err) {
    return {
      jsonrpc: "2.0",
      id,
      error: {
        code: -32603,
        message: err instanceof Error ? err.message : "Internal error",
      },
    };
  }
}

serve(async (req: Request) => {
  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        ...corsHeaders,
        "Access-Control-Allow-Headers": "authorization, content-type, x-session-id",
      },
    });
  }

  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/mcp/, "");

  // SSE endpoint for receiving messages
  if (req.method === "GET" && path === "/sse") {
    const sessionId = url.searchParams.get("session_id") || generateSessionId();

    // Set up SSE
    const stream = new ReadableStream({
      start(controller) {
        // Send session ID
        controller.enqueue(
          new TextEncoder().encode(`event: session\ndata: ${JSON.stringify({ session_id: sessionId })}\n\n`)
        );

        // Keep connection alive
        const keepAlive = setInterval(() => {
          try {
            controller.enqueue(new TextEncoder().encode(": keepalive\n\n"));
          } catch {
            clearInterval(keepAlive);
          }
        }, 30000);
      },
    });

    return new Response(stream, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  }

  // POST endpoint for sending messages
  if (req.method === "POST" && (path === "/message" || path === "")) {
    const sessionId = req.headers.get("x-session-id");
    const authHeader = req.headers.get("authorization");

    let supabase = null;
    let userId = null;

    // Try to authenticate
    if (authHeader) {
      try {
        supabase = createSupabaseClient(req);
        const { data: { user } } = await supabase.auth.getUser();
        userId = user?.id || null;
      } catch {
        // Continue without auth for initialization
      }
    }

    const body = await req.json();

    // Handle single request or batch
    if (Array.isArray(body)) {
      const responses = await Promise.all(
        body.map((request: MCPRequest) => handleMCPRequest(request, supabase, userId))
      );
      return new Response(JSON.stringify(responses), {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      });
    }

    const response = await handleMCPRequest(body, supabase, userId);
    return new Response(JSON.stringify(response), {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    });
  }

  return new Response(JSON.stringify({ error: "Not found" }), {
    status: 404,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
});
