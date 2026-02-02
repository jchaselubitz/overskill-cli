# Skills Platform — MVP Specification

## Overview

Build a platform that lets developers store, version, share, and sync reusable "agent skills" (markdown instruction files) across multiple repositories and multiple AI coding agents (Claude Code, Cursor, Codex, etc.).

The MVP consists of:

1. **A CLI tool** (`skills`) — TypeScript, published to npm
2. **A meta-skill** — a built-in SKILL.md that teaches agents how to use the system
3. **A Supabase backend** — Postgres database, Edge Functions as the API, Supabase Auth for authentication and OAuth
4. **An MCP server** — hosted as a Supabase Edge Function, exposes skill tools to AI agents

All infrastructure runs on Supabase. No Vercel. No other hosting.

---

## 1. Architecture

### Tech Stack

| Layer | Technology |
|---|---|
| Database | Supabase Postgres with Row-Level Security (RLS) |
| Auth | Supabase Auth (email/password + OAuth provider for MCP clients) |
| API | Supabase Edge Functions (Deno/TypeScript) |
| MCP Server | Supabase Edge Function with SSE transport |
| CLI | TypeScript + `commander` + `ofetch`, published to npm |
| OAuth UI | Minimal HTML served by a Supabase Edge Function |

### Request Flow

```
CLI / MCP Client
       |
       v
Supabase Edge Functions (API layer)
       |
       v
Supabase Auth (JWT validation)
       |
       v
Supabase Postgres (data + RLS enforcement)
```

All clients (CLI, MCP server, future webapp) hit the same Edge Function API. The MCP server is itself an Edge Function that translates MCP tool calls into API calls.

---

## 2. Database Schema

All tables live in the `public` schema. Use Supabase's built-in `auth.users` for user identity.

### 2.1 `profiles`

Stores public user profile information linked to `auth.users`.

```sql
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Auto-create profile on signup via trigger
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, username, display_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1))
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
```

### 2.2 `registries`

A registry is a namespace that holds skills. Every user gets a personal registry. Organizations create shared registries.

```sql
CREATE TYPE registry_type AS ENUM ('personal', 'organization');
CREATE TYPE publish_policy AS ENUM ('open', 'require_approval');

CREATE TABLE registries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,  -- URL-safe identifier, e.g. "jake" or "kove-inc"
  name TEXT NOT NULL,
  description TEXT,
  type registry_type NOT NULL DEFAULT 'personal',
  publish_policy publish_policy NOT NULL DEFAULT 'open',
  created_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Auto-create personal registry on profile creation
CREATE OR REPLACE FUNCTION handle_new_profile()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO registries (slug, name, type, created_by)
  VALUES (NEW.username, NEW.username || '''s Skills', 'personal', NEW.id);

  -- Also add the user as admin of their own registry
  INSERT INTO registry_members (registry_id, user_id, role)
  VALUES (
    (SELECT id FROM registries WHERE slug = NEW.username AND created_by = NEW.id),
    NEW.id,
    'admin'
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_profile_created
  AFTER INSERT ON profiles
  FOR EACH ROW EXECUTE FUNCTION handle_new_profile();
```

### 2.3 `registry_members`

Maps users to registries with role-based access.

```sql
CREATE TYPE member_role AS ENUM ('member', 'contributor', 'admin');

CREATE TABLE registry_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  registry_id UUID NOT NULL REFERENCES registries(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role member_role NOT NULL DEFAULT 'member',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(registry_id, user_id)
);
```

### 2.4 `skills`

The core skill record. Each skill belongs to exactly one registry.

```sql
CREATE TABLE skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  registry_id UUID NOT NULL REFERENCES registries(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,                -- URL-safe name, e.g. "supabase-edge"
  name TEXT NOT NULL,                -- Human-readable name
  description TEXT,
  tags TEXT[] DEFAULT '{}',          -- e.g. {'supabase', 'backend', 'typescript'}
  compat TEXT[] DEFAULT '{}',        -- e.g. {'claude-code', 'cursor', 'codex'}
  created_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(registry_id, slug)
);
```

### 2.5 `skill_versions`

Each skill has one or more versions. The content (SKILL.md markdown) is stored per version.

```sql
CREATE TABLE skill_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  skill_id UUID NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  version TEXT NOT NULL,             -- semver string, e.g. "1.3.0"
  content TEXT NOT NULL,             -- The full SKILL.md markdown content
  changelog TEXT,                    -- What changed in this version
  published_by UUID NOT NULL REFERENCES profiles(id),
  is_latest BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(skill_id, version)
);

-- Ensure only one version per skill is marked as latest
-- Enforce via trigger: when a new version is inserted with is_latest = true,
-- set is_latest = false on all other versions of the same skill.
CREATE OR REPLACE FUNCTION handle_new_skill_version()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_latest = true THEN
    UPDATE skill_versions
    SET is_latest = false
    WHERE skill_id = NEW.skill_id AND id != NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_skill_version_created
  AFTER INSERT ON skill_versions
  FOR EACH ROW EXECUTE FUNCTION handle_new_skill_version();
```

### 2.6 `skill_maintainers`

Optional per-skill maintainer assignments. Contributors can only edit skills they created or are listed as maintainers of. Admins can edit all skills in a registry.

```sql
CREATE TABLE skill_maintainers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  skill_id UUID NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(skill_id, user_id)
);
```

### 2.7 `invitations`

Pending invitations to join a registry.

```sql
CREATE TYPE invitation_status AS ENUM ('pending', 'accepted', 'declined', 'expired');

CREATE TABLE invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  registry_id UUID NOT NULL REFERENCES registries(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role member_role NOT NULL DEFAULT 'member',
  invited_by UUID NOT NULL REFERENCES profiles(id),
  status invitation_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),
  UNIQUE(registry_id, email, status)  -- Prevent duplicate pending invites
);
```

### 2.8 Row-Level Security Policies

Every table must have RLS enabled. These policies enforce the access control model.

```sql
-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE registries ENABLE ROW LEVEL SECURITY;
ALTER TABLE registry_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE skill_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE skill_maintainers ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;

-- PROFILES
-- Anyone authenticated can read profiles
CREATE POLICY "profiles_select" ON profiles
  FOR SELECT TO authenticated USING (true);

-- Users can update only their own profile
CREATE POLICY "profiles_update" ON profiles
  FOR UPDATE TO authenticated USING (id = auth.uid());

-- REGISTRIES
-- Members can see registries they belong to
CREATE POLICY "registries_select" ON registries
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM registry_members
      WHERE registry_members.registry_id = registries.id
      AND registry_members.user_id = auth.uid()
    )
  );

-- Any authenticated user can create a registry (for organizations)
CREATE POLICY "registries_insert" ON registries
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

-- Only admins can update registry settings
CREATE POLICY "registries_update" ON registries
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM registry_members
      WHERE registry_members.registry_id = registries.id
      AND registry_members.user_id = auth.uid()
      AND registry_members.role = 'admin'
    )
  );

-- REGISTRY MEMBERS
-- Members can see other members in their registries
CREATE POLICY "registry_members_select" ON registry_members
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM registry_members AS rm
      WHERE rm.registry_id = registry_members.registry_id
      AND rm.user_id = auth.uid()
    )
  );

-- Only admins can add members
CREATE POLICY "registry_members_insert" ON registry_members
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM registry_members AS rm
      WHERE rm.registry_id = registry_members.registry_id
      AND rm.user_id = auth.uid()
      AND rm.role = 'admin'
    )
  );

-- Only admins can update member roles
CREATE POLICY "registry_members_update" ON registry_members
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM registry_members AS rm
      WHERE rm.registry_id = registry_members.registry_id
      AND rm.user_id = auth.uid()
      AND rm.role = 'admin'
    )
  );

-- Only admins can remove members (or users can remove themselves)
CREATE POLICY "registry_members_delete" ON registry_members
  FOR DELETE TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM registry_members AS rm
      WHERE rm.registry_id = registry_members.registry_id
      AND rm.user_id = auth.uid()
      AND rm.role = 'admin'
    )
  );

-- SKILLS
-- Members can read skills in their registries
CREATE POLICY "skills_select" ON skills
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM registry_members
      WHERE registry_members.registry_id = skills.registry_id
      AND registry_members.user_id = auth.uid()
    )
  );

-- Contributors and admins can create skills
CREATE POLICY "skills_insert" ON skills
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM registry_members
      WHERE registry_members.registry_id = skills.registry_id
      AND registry_members.user_id = auth.uid()
      AND registry_members.role IN ('contributor', 'admin')
    )
  );

-- Skill creators, maintainers, and registry admins can update skills
CREATE POLICY "skills_update" ON skills
  FOR UPDATE TO authenticated
  USING (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM skill_maintainers
      WHERE skill_maintainers.skill_id = skills.id
      AND skill_maintainers.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM registry_members
      WHERE registry_members.registry_id = skills.registry_id
      AND registry_members.user_id = auth.uid()
      AND registry_members.role = 'admin'
    )
  );

-- SKILL VERSIONS
-- Same read access as skills (members of the registry)
CREATE POLICY "skill_versions_select" ON skill_versions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM skills
      JOIN registry_members ON registry_members.registry_id = skills.registry_id
      WHERE skills.id = skill_versions.skill_id
      AND registry_members.user_id = auth.uid()
    )
  );

-- Contributors+ can publish versions for skills they have write access to
CREATE POLICY "skill_versions_insert" ON skill_versions
  FOR INSERT TO authenticated
  WITH CHECK (
    published_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM skills
      WHERE skills.id = skill_versions.skill_id
      AND (
        skills.created_by = auth.uid()
        OR EXISTS (
          SELECT 1 FROM skill_maintainers
          WHERE skill_maintainers.skill_id = skills.id
          AND skill_maintainers.user_id = auth.uid()
        )
        OR EXISTS (
          SELECT 1 FROM registry_members
          WHERE registry_members.registry_id = skills.registry_id
          AND registry_members.user_id = auth.uid()
          AND registry_members.role = 'admin'
        )
      )
    )
  );

-- SKILL MAINTAINERS
-- Readable by registry members
CREATE POLICY "skill_maintainers_select" ON skill_maintainers
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM skills
      JOIN registry_members ON registry_members.registry_id = skills.registry_id
      WHERE skills.id = skill_maintainers.skill_id
      AND registry_members.user_id = auth.uid()
    )
  );

-- Skill creators and registry admins can manage maintainers
CREATE POLICY "skill_maintainers_insert" ON skill_maintainers
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM skills
      WHERE skills.id = skill_maintainers.skill_id
      AND (
        skills.created_by = auth.uid()
        OR EXISTS (
          SELECT 1 FROM registry_members
          WHERE registry_members.registry_id = skills.registry_id
          AND registry_members.user_id = auth.uid()
          AND registry_members.role = 'admin'
        )
      )
    )
  );

CREATE POLICY "skill_maintainers_delete" ON skill_maintainers
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM skills
      WHERE skills.id = skill_maintainers.skill_id
      AND (
        skills.created_by = auth.uid()
        OR EXISTS (
          SELECT 1 FROM registry_members
          WHERE registry_members.registry_id = skills.registry_id
          AND registry_members.user_id = auth.uid()
          AND registry_members.role = 'admin'
        )
      )
    )
  );

-- INVITATIONS
-- Admins can see invitations for their registries
CREATE POLICY "invitations_select" ON invitations
  FOR SELECT TO authenticated
  USING (
    email = (SELECT email FROM auth.users WHERE id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM registry_members
      WHERE registry_members.registry_id = invitations.registry_id
      AND registry_members.user_id = auth.uid()
      AND registry_members.role = 'admin'
    )
  );

-- Admins can create invitations
CREATE POLICY "invitations_insert" ON invitations
  FOR INSERT TO authenticated
  WITH CHECK (
    invited_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM registry_members
      WHERE registry_members.registry_id = invitations.registry_id
      AND registry_members.user_id = auth.uid()
      AND registry_members.role = 'admin'
    )
  );

-- Invited user can update their own invitation (accept/decline)
CREATE POLICY "invitations_update" ON invitations
  FOR UPDATE TO authenticated
  USING (
    email = (SELECT email FROM auth.users WHERE id = auth.uid())
  );
```

### 2.9 Indexes

```sql
CREATE INDEX idx_registry_members_user ON registry_members(user_id);
CREATE INDEX idx_registry_members_registry ON registry_members(registry_id);
CREATE INDEX idx_skills_registry ON skills(registry_id);
CREATE INDEX idx_skills_slug ON skills(registry_id, slug);
CREATE INDEX idx_skills_tags ON skills USING GIN(tags);
CREATE INDEX idx_skill_versions_skill ON skill_versions(skill_id);
CREATE INDEX idx_skill_versions_latest ON skill_versions(skill_id) WHERE is_latest = true;
CREATE INDEX idx_skill_maintainers_skill ON skill_maintainers(skill_id);
CREATE INDEX idx_skill_maintainers_user ON skill_maintainers(user_id);
CREATE INDEX idx_invitations_email ON invitations(email) WHERE status = 'pending';
```

---

## 3. Supabase Edge Functions (API)

All Edge Functions are written in TypeScript (Deno). They validate the JWT from the `Authorization: Bearer <token>` header using Supabase's `createClient` with the user's token. RLS handles permission enforcement at the database level.

Every Edge Function should:
1. Parse the incoming request (method, path, body)
2. Create a Supabase client using the user's JWT from the `Authorization` header
3. Perform the database operation (RLS enforces permissions automatically)
4. Return a JSON response with appropriate status code

Use a single Edge Function per logical resource group with internal routing, or one monolithic `api` function with a path-based router. The monolithic approach is simpler for MVP.

### 3.1 API Router Structure

Create a single Edge Function named `api` that handles all routes:

```
POST   /api/auth/register         — Register new user
POST   /api/auth/login            — Login (returns JWT)
POST   /api/auth/refresh          — Refresh JWT

GET    /api/registries                          — List user's registries
POST   /api/registries                          — Create organization registry
GET    /api/registries/:slug                    — Get registry details
PUT    /api/registries/:slug                    — Update registry settings
GET    /api/registries/:slug/members            — List members
POST   /api/registries/:slug/members/invite     — Invite member
PUT    /api/registries/:slug/members/:userId    — Update member role
DELETE /api/registries/:slug/members/:userId    — Remove member
POST   /api/registries/:slug/invitations/:id/accept  — Accept invitation
POST   /api/registries/:slug/invitations/:id/decline — Decline invitation

GET    /api/registries/:slug/skills             — List skills in registry
POST   /api/registries/:slug/skills             — Create a new skill
GET    /api/registries/:slug/skills/:skillSlug  — Get skill detail + latest version content
PUT    /api/registries/:slug/skills/:skillSlug  — Update skill metadata
DELETE /api/registries/:slug/skills/:skillSlug  — Delete skill

GET    /api/registries/:slug/skills/:skillSlug/versions          — List all versions
POST   /api/registries/:slug/skills/:skillSlug/versions          — Publish new version
GET    /api/registries/:slug/skills/:skillSlug/versions/:version — Get specific version

GET    /api/search?q=<query>&tags=<tags>&compat=<compat>  — Search across all user-accessible registries
```

### 3.2 Key API Behaviors

#### `POST /api/auth/register`

```typescript
// Input
{ email: string, password: string, username: string, display_name?: string }

// Behavior
// 1. Validate username: lowercase alphanumeric + hyphens, 3-39 chars, no leading/trailing hyphens
// 2. Check username uniqueness against profiles table
// 3. Call supabase.auth.signUp({ email, password, options: { data: { username, display_name } } })
// 4. The trigger on auth.users auto-creates the profile and personal registry
// 5. Return { user, session }

// Response: 201
{ user: { id, email, username }, session: { access_token, refresh_token } }
```

#### `POST /api/auth/login`

```typescript
// Input
{ email: string, password: string }

// Behavior
// 1. Call supabase.auth.signInWithPassword({ email, password })
// 2. Return session tokens

// Response: 200
{ user: { id, email, username }, session: { access_token, refresh_token } }
```

#### `GET /api/registries/:slug/skills`

```typescript
// Headers: Authorization: Bearer <jwt>

// Query params (all optional):
// - tags: comma-separated tag filter
// - compat: comma-separated compat filter
// - search: text search on name/description

// Behavior
// 1. Query skills table where registry slug matches
// 2. RLS automatically filters to registries the user has access to
// 3. Join with skill_versions where is_latest = true to get current version number
// 4. Apply optional filters

// Response: 200
{
  skills: [
    {
      slug: "supabase-edge",
      name: "Supabase Edge Functions",
      description: "...",
      tags: ["supabase", "backend"],
      compat: ["claude-code", "cursor"],
      version: "1.3.0",
      created_by: "jake",
      updated_at: "2026-01-15T..."
    }
  ]
}
```

#### `GET /api/registries/:slug/skills/:skillSlug`

```typescript
// Headers: Authorization: Bearer <jwt>

// Behavior
// 1. Fetch the skill record
// 2. Join with skill_versions where is_latest = true
// 3. Return skill metadata + full SKILL.md content

// Response: 200
{
  slug: "supabase-edge",
  name: "Supabase Edge Functions",
  description: "...",
  tags: ["supabase", "backend"],
  compat: ["claude-code", "cursor"],
  version: "1.3.0",
  content: "# Supabase Edge Functions\n\n...",  // Full SKILL.md markdown
  created_by: "jake",
  maintainers: ["jake", "alex"],
  updated_at: "2026-01-15T..."
}
```

#### `POST /api/registries/:slug/skills`

```typescript
// Headers: Authorization: Bearer <jwt>

// Input
{
  slug: string,           // URL-safe skill identifier
  name: string,           // Human-readable name
  description?: string,
  tags?: string[],
  compat?: string[],
  content: string,        // Full SKILL.md markdown
  version?: string        // Initial version, defaults to "1.0.0"
}

// Behavior
// 1. Validate slug: lowercase alphanumeric + hyphens, 2-50 chars
// 2. Insert into skills table (RLS checks contributor+ role)
// 3. Insert initial version into skill_versions with is_latest = true
// 4. Return created skill

// Response: 201
{ skill: { ... }, version: "1.0.0" }
```

#### `POST /api/registries/:slug/skills/:skillSlug/versions`

```typescript
// Headers: Authorization: Bearer <jwt>

// Input
{
  version: string,        // New semver version string
  content: string,        // Full updated SKILL.md markdown
  changelog?: string      // What changed
}

// Behavior
// 1. Validate version is valid semver and > current latest version
// 2. Insert new skill_version with is_latest = true
// 3. Trigger auto-sets previous latest to is_latest = false
// 4. Update skills.updated_at

// Response: 201
{ version: "1.4.0", changelog: "Added error handling patterns" }
```

#### `GET /api/search`

```typescript
// Headers: Authorization: Bearer <jwt>
// Query params:
// - q: text search (searches name, description, tags)
// - tags: comma-separated tag filter
// - compat: comma-separated compat filter

// Behavior
// 1. Search across ALL registries the user has access to
// 2. Use Postgres full-text search on name + description
// 3. Filter by tags/compat using array overlap operator (&&)
// 4. Return results with registry slug prefix

// Response: 200
{
  results: [
    {
      registry: "kove-inc",
      slug: "supabase-edge",
      name: "Supabase Edge Functions",
      description: "...",
      tags: ["supabase"],
      compat: ["claude-code"],
      version: "1.3.0"
    }
  ]
}
```

#### `POST /api/registries/:slug/members/invite`

```typescript
// Headers: Authorization: Bearer <jwt>

// Input
{ email: string, role: "member" | "contributor" | "admin" }

// Behavior
// 1. RLS verifies caller is admin of this registry
// 2. Check if user with this email already exists
//    a. If yes and already a member: return 409 Conflict
//    b. If yes and not a member: add them directly to registry_members, return 200
//    c. If no: create invitation record, return 201
// 3. For case (c), when the invited user eventually signs up and logs in,
//    the client (CLI or MCP) should check for pending invitations and prompt to accept

// Response: 201
{ invitation: { id, email, role, status: "pending", expires_at } }
// or 200
{ member: { user_id, role } }
```

#### Accept/Decline Invitation

```typescript
// POST /api/registries/:slug/invitations/:id/accept
// Headers: Authorization: Bearer <jwt>

// Behavior
// 1. Verify the invitation email matches the authenticated user's email
// 2. Verify invitation is still pending and not expired
// 3. Update invitation status to 'accepted'
// 4. Insert into registry_members with the invited role
// 5. Return the new membership

// POST /api/registries/:slug/invitations/:id/decline
// Same flow but sets status to 'declined' and does not create membership
```

### 3.3 Sync Endpoint (Bulk Fetch for CLI)

This is the key endpoint the CLI uses during `skills sync`. It fetches multiple skills in a single request.

```typescript
// POST /api/sync
// Headers: Authorization: Bearer <jwt>

// Input
{
  skills: [
    { registry: "kove-inc", slug: "supabase-edge", version?: ">=1.3.0" },
    { registry: "jake", slug: "zod-v4" },
    { registry: "kove-inc", slug: "edge-functions", version?: "2.0.0" }
  ]
}

// Behavior
// 1. For each requested skill, fetch from the appropriate registry
// 2. RLS ensures user has access to each registry
// 3. If version constraint specified, resolve to matching version
//    - Exact version: fetch that version
//    - Semver range (>=, ^, ~): resolve to latest matching version
//    - No version: fetch latest
// 4. Return all skills with content in a single response

// Response: 200
{
  skills: [
    {
      registry: "kove-inc",
      slug: "supabase-edge",
      version: "1.3.0",
      content: "# Supabase Edge Functions\n\n...",
      sha256: "abc123..."  // Hash of content for lock file
    },
    // ...
  ],
  errors: [
    // Any skills that failed to resolve
    { registry: "kove-inc", slug: "nonexistent", error: "not_found" }
  ]
}
```

---

## 4. OAuth Flow (Edge Function serving HTML)

For MCP clients (Claude.ai, ChatGPT) to connect, they need an OAuth flow. Implement this as a Supabase Edge Function that serves HTML pages.

### 4.1 OAuth Edge Function: `oauth`

This function handles the OAuth2 Authorization Code flow:

**`GET /oauth/authorize`**
- Query params: `client_id`, `redirect_uri`, `state`, `scope`
- Serves an HTML page with a login/register form
- On successful login, redirects back to `redirect_uri` with an authorization code
- The HTML page should be minimal but functional:
  - Email + password fields
  - Login button
  - Register toggle (shows additional username field)
  - Error display area
  - Styled simply with inline CSS, no frameworks

**`POST /oauth/token`**
- Exchanges authorization code for access token
- Input: `{ grant_type: "authorization_code", code, redirect_uri, client_id }`
- Returns: `{ access_token, token_type: "bearer", refresh_token, expires_in }`

**`POST /oauth/token` (refresh)**
- Refreshes an expired access token
- Input: `{ grant_type: "refresh_token", refresh_token, client_id }`
- Returns: `{ access_token, token_type: "bearer", refresh_token, expires_in }`

### 4.2 OAuth Client Registration

For MVP, hardcode a known set of OAuth clients. Store in an `oauth_clients` table or as environment variables:

```sql
CREATE TABLE oauth_clients (
  id TEXT PRIMARY KEY,                    -- client_id
  secret TEXT NOT NULL,                   -- client_secret (hashed)
  name TEXT NOT NULL,                     -- e.g. "Claude.ai MCP"
  redirect_uris TEXT[] NOT NULL,          -- allowed redirect URIs
  created_at TIMESTAMPTZ DEFAULT now()
);
```

Pre-seed with clients for Claude.ai and ChatGPT MCP connections.

### 4.3 Authorization Codes

Temporary codes exchanged for tokens:

```sql
CREATE TABLE oauth_codes (
  code TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES oauth_clients(id),
  user_id UUID NOT NULL REFERENCES profiles(id),
  redirect_uri TEXT NOT NULL,
  scope TEXT,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '10 minutes'),
  used BOOLEAN NOT NULL DEFAULT false
);
```

The authorize endpoint creates a code after successful login, the token endpoint consumes it.

---

## 5. MCP Server (Edge Function)

The MCP server is a Supabase Edge Function named `mcp` that implements the Model Context Protocol over SSE (Server-Sent Events) transport.

### 5.1 Transport

Use SSE transport as required by Claude.ai and ChatGPT MCP connections. The Edge Function must:
1. Accept an initial POST to establish a session
2. Return an SSE stream on GET for receiving messages
3. Accept subsequent POSTs for sending messages

Use the `@modelcontextprotocol/sdk` package's `SSEServerTransport` or implement the SSE protocol manually.

### 5.2 Authentication

The MCP server receives the user's OAuth access token (obtained via the OAuth flow above). On every tool call, create a Supabase client using this token so RLS is enforced.

### 5.3 Tools

The MCP server exposes these tools:

#### `list_skills`

```typescript
{
  name: "list_skills",
  description: "List all skills available to the user across all their registries. Optionally filter by registry.",
  inputSchema: {
    type: "object",
    properties: {
      registry: { type: "string", description: "Optional registry slug to filter by" },
      tags: { type: "array", items: { type: "string" }, description: "Optional tag filter" },
      compat: { type: "array", items: { type: "string" }, description: "Optional compatibility filter" }
    }
  }
}
// Returns: Array of { registry, slug, name, description, version, tags, compat }
```

#### `get_skill`

```typescript
{
  name: "get_skill",
  description: "Get the full content of a specific skill. Returns the complete SKILL.md markdown.",
  inputSchema: {
    type: "object",
    properties: {
      registry: { type: "string", description: "Registry slug" },
      slug: { type: "string", description: "Skill slug" },
      version: { type: "string", description: "Optional specific version. Defaults to latest." }
    },
    required: ["registry", "slug"]
  }
}
// Returns: { registry, slug, name, version, content (full markdown) }
```

#### `search_skills`

```typescript
{
  name: "search_skills",
  description: "Search for skills by name, description, or tags across all accessible registries.",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Search query" },
      tags: { type: "array", items: { type: "string" } },
      compat: { type: "array", items: { type: "string" } }
    },
    required: ["query"]
  }
}
// Returns: Array of matching skills with metadata
```

#### `create_skill`

```typescript
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
      compat: { type: "array", items: { type: "string" } }
    },
    required: ["registry", "slug", "name", "content"]
  }
}
```

#### `update_skill`

```typescript
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
      changelog: { type: "string", description: "Description of changes" }
    },
    required: ["registry", "slug", "content", "version"]
  }
}
```

#### `list_registries`

```typescript
{
  name: "list_registries",
  description: "List all registries the user has access to.",
  inputSchema: { type: "object", properties: {} }
}
// Returns: Array of { slug, name, type, role }
```

#### `report_skill_issue`

```typescript
{
  name: "report_skill_issue",
  description: "Report an issue with a skill, such as incorrect instructions or errors encountered during use.",
  inputSchema: {
    type: "object",
    properties: {
      registry: { type: "string" },
      slug: { type: "string" },
      issue: { type: "string", description: "Description of the issue" },
      context: { type: "string", description: "What the agent was trying to do when the issue occurred" }
    },
    required: ["registry", "slug", "issue"]
  }
}
```

For `report_skill_issue`, store reports in a simple `skill_issues` table:

```sql
CREATE TABLE skill_issues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  skill_id UUID NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  reported_by UUID REFERENCES profiles(id),
  issue TEXT NOT NULL,
  context TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

## 6. CLI Tool (`skills`)

### 6.1 Project Setup

Create a new TypeScript project:

```
skills-cli/
├── src/
│   ├── index.ts              -- Entry point, commander setup
│   ├── commands/
│   │   ├── init.ts
│   │   ├── sync.ts
│   │   ├── add.ts
│   │   ├── remove.ts
│   │   ├── update.ts
│   │   ├── list.ts
│   │   ├── search.ts
│   │   ├── info.ts
│   │   ├── diff.ts
│   │   ├── edit.ts
│   │   ├── push.ts
│   │   ├── validate.ts
│   │   ├── bundle.ts
│   │   ├── login.ts
│   │   ├── config.ts
│   │   └── registry.ts       -- registry members, invite subcommands
│   ├── lib/
│   │   ├── api.ts            -- HTTP client wrapper for all API calls
│   │   ├── auth.ts           -- Token storage, refresh logic
│   │   ├── config.ts         -- Read/write .skills.yaml
│   │   ├── lockfile.ts       -- Read/write .skills.lock
│   │   ├── fs.ts             -- File system operations (write skills to disk)
│   │   ├── semver.ts         -- Version comparison/resolution
│   │   └── index-gen.ts      -- SKILLS_INDEX.md generator
│   └── types.ts              -- Shared TypeScript types
├── package.json
├── tsconfig.json
└── README.md
```

### 6.2 Dependencies

```json
{
  "name": "agent-skills",
  "version": "0.1.0",
  "bin": { "skills": "./dist/index.js" },
  "dependencies": {
    "commander": "^12.0.0",
    "ofetch": "^1.3.0",
    "yaml": "^2.3.0",
    "chalk": "^5.3.0",
    "ora": "^7.0.0",
    "semver": "^7.5.0",
    "conf": "^12.0.0"
  },
  "devDependencies": {
    "typescript": "^5.3.0",
    "@types/node": "^20.0.0",
    "@types/semver": "^7.5.0"
  }
}
```

Use `yarn` as the package manager (per user preference).

### 6.3 Authentication & Token Storage

Use the `conf` package to store credentials in `~/.config/agent-skills/config.json`:

```json
{
  "api_url": "https://<project-ref>.supabase.co/functions/v1/api",
  "access_token": "eyJ...",
  "refresh_token": "abc...",
  "expires_at": 1706000000
}
```

The `auth.ts` module should:
1. Before every API call, check if `expires_at` has passed
2. If expired, use the refresh token to get a new access token
3. If refresh fails, prompt the user to `skills login` again

### 6.4 `.skills.yaml` Format

```yaml
# .skills.yaml — committed to the repo
sources:
  - name: personal
    registry: jake                           # registry slug
    url: https://<project-ref>.supabase.co/functions/v1/api
  - name: org
    registry: kove-inc
    url: https://<project-ref>.supabase.co/functions/v1/api

install_path: .skills    # relative to repo root

skills:
  - slug: supabase-edge
    source: org
  - slug: zod-v4
    source: org
    version: ">=2.0.0"          # optional version constraint
  - slug: my-experiment
    source: personal
```

### 6.5 `.skills.lock` Format

Generated by `skills sync`. Should be committed to the repo for reproducibility.

```yaml
# .skills.lock — auto-generated, commit to repo
locked_at: "2026-02-02T12:00:00Z"
skills:
  - slug: supabase-edge
    registry: kove-inc
    version: "1.3.0"
    sha256: "a1b2c3d4e5f6..."    # hash of the SKILL.md content
  - slug: zod-v4
    registry: kove-inc
    version: "2.1.0"
    sha256: "f6e5d4c3b2a1..."
  - slug: my-experiment
    registry: jake
    version: "1.0.0"
    sha256: "1a2b3c4d5e6f..."
```

### 6.6 Command Specifications

#### `skills init`

1. Prompt the user for their default API URL (or use the stored one from `skills config`)
2. Prompt for default registry slug
3. Prompt for install_path (default: `.skills`)
4. Create `.skills.yaml` with the provided values and an empty skills list
5. Add `.skills/` to `.gitignore` if not already present (the skill files themselves should not be committed — only `.skills.yaml` and `.skills.lock`)
6. Print success message with next steps

#### `skills login`

1. Open the OAuth authorize URL in the user's default browser:
   `https://<api-url>/oauth/authorize?client_id=cli&redirect_uri=http://localhost:9876/callback`
2. Start a temporary local HTTP server on port 9876
3. Wait for the OAuth redirect with the authorization code
4. Exchange the code for tokens via `POST /oauth/token`
5. Store tokens in `~/.config/agent-skills/config.json`
6. Print "Logged in as <username>"

Alternative flow for environments where browser redirect doesn't work:
1. Print the authorize URL
2. User visits it manually, logs in, gets a code displayed on screen
3. User pastes the code back into the CLI
4. CLI exchanges code for tokens

#### `skills sync`

1. Read `.skills.yaml`
2. Verify authentication (refresh token if needed)
3. Call `POST /api/sync` with all declared skills and version constraints
4. For each returned skill:
   a. Write `<install_path>/<skill-slug>/SKILL.md` with the content
   b. Write `<install_path>/<skill-slug>/meta.yaml` with metadata (version, tags, compat, registry, sha256)
5. Also install the meta-skill to `<install_path>/_system/SKILL.md` (see Feature 2)
6. Generate `<install_path>/SKILLS_INDEX.md` (see section 6.7)
7. Write `.skills.lock` with resolved versions and content hashes
8. Print summary: "Synced N skills. M updated, K unchanged."
9. If any skills failed to resolve, print warnings

If `.skills.lock` exists and no `--force` flag, compare content hashes. Skip writing files that haven't changed (for speed).

#### `skills add <slug> [slug2...]`

1. Read `.skills.yaml`
2. For each slug:
   a. If no source prefix (e.g. just `supabase-edge`), search across all configured sources
   b. If prefixed (e.g. `org/supabase-edge`), use that specific source
   c. Verify the skill exists by calling `GET /api/registries/:slug/skills/:skillSlug`
3. Add entries to `.skills.yaml`
4. Run `skills sync` automatically
5. Print "Added: supabase-edge (kove-inc v1.3.0)"

#### `skills remove <slug>`

1. Read `.skills.yaml`
2. Find and remove the matching skill entry
3. Delete the skill folder from `install_path`
4. Regenerate `SKILLS_INDEX.md`
5. Update `.skills.lock`
6. Write updated `.skills.yaml`
7. Print "Removed: supabase-edge"

#### `skills update [slug]`

1. Read `.skills.yaml` and `.skills.lock`
2. For each skill (or just the specified one):
   a. Fetch latest version from API
   b. Compare with locked version
   c. If newer version available and satisfies version constraint, update
3. Write updated files to disk
4. Update `.skills.lock`
5. Print update summary: "Updated supabase-edge: 1.3.0 → 1.4.0"

#### `skills list`

Default (no flags): list all skills available in all configured registries.

```
$ skills list
kove-inc:
  supabase-edge    v1.3.0  Edge Function invocation patterns
  zod-v4           v2.1.0  Zod v4 validation patterns
  edge-functions   v1.0.0  Supabase Edge Functions deployment

jake:
  my-experiment    v1.0.0  Testing something
```

With `--installed` flag: list only skills declared in `.skills.yaml` with their locked versions.

```
$ skills list --installed
supabase-edge    kove-inc  v1.3.0  (locked)
zod-v4           kove-inc  v2.1.0  (locked, constraint: >=2.0.0)
my-experiment    jake      v1.0.0  (locked)
```

#### `skills search <query>`

1. Call `GET /api/search?q=<query>`
2. Display results with registry, name, description, version, tags

```
$ skills search "supabase"
kove-inc/supabase-edge    v1.3.0  Edge Function invocation patterns     [supabase, backend]
kove-inc/edge-functions   v1.0.0  Supabase Edge Functions deployment    [supabase, deployment]
```

#### `skills info <slug>`

1. Resolve which registry the skill belongs to (from `.skills.yaml` or search)
2. Call `GET /api/registries/:slug/skills/:skillSlug`
3. Display full metadata: name, description, version, all version history, tags, compat, maintainers, created date

#### `skills diff [slug]`

1. For each installed skill (or just the specified one):
   a. Read local SKILL.md content
   b. Fetch latest remote content
   c. Compute and display a unified diff
2. Use chalk to color additions (green) and deletions (red)

#### `skills edit <slug>`

1. Resolve the local file path: `<install_path>/<slug>/SKILL.md`
2. Open in `$EDITOR` (or `$VISUAL`, fall back to `vim`)
3. After editor closes, mark the skill as locally modified (write a `.modified` marker file in the skill folder)
4. Print "Edited supabase-edge locally. Run `skills push supabase-edge` to publish."

#### `skills push [slug]`

1. If slug specified, push that skill. Otherwise, push all locally modified skills.
2. Read the local SKILL.md content
3. Read the current version from `.skills.lock`
4. Auto-bump the patch version (e.g. 1.3.0 → 1.3.1) unless `--version <v>` is specified
5. Call `POST /api/registries/:slug/skills/:skillSlug/versions` with new content and version
6. If server returns 403 (insufficient permissions), display clear error: "You don't have write access to kove-inc/supabase-edge. Contact a registry admin."
7. On success, update `.skills.lock` with new version and hash
8. Remove `.modified` marker
9. Print "Pushed supabase-edge v1.3.1 to kove-inc"

#### `skills push <slug> --from-stdin`

Same as above but reads SKILL.md content from stdin instead of from the local file:

```bash
cat updated-skill.md | skills push supabase-edge --from-stdin
# or
echo "..." | skills push supabase-edge --from-stdin
```

#### `skills validate [slug]`

1. For each installed skill (or specified one):
   a. Check that SKILL.md exists and is non-empty
   b. Check that meta.yaml is valid YAML with required fields
   c. Check that SKILL.md starts with a `# Title` heading
   d. Check that the skill slug is valid (lowercase alphanumeric + hyphens)
2. Print validation results

#### `skills bundle [slug1 slug2...]`

1. If slugs specified, bundle those. Otherwise, bundle all installed skills.
2. Concatenate all SKILL.md files into a single markdown file with separators:

```markdown
<!-- === SKILL: supabase-edge (kove-inc v1.3.0) === -->

# Supabase Edge Functions
...

<!-- === SKILL: zod-v4 (kove-inc v2.1.0) === -->

# Zod v4 Patterns
...
```

3. Write to `skills-bundle.md` in the current directory (or `--output <path>`)
4. Print "Bundled N skills into skills-bundle.md (X KB)"

#### `skills config <key> [value]`

Get or set global CLI configuration:

```bash
skills config api_url                              # get
skills config api_url https://xyz.supabase.co/...  # set
skills config editor vim                           # set preferred editor
skills config install_path .agent-skills           # default install path for new repos
```

Stored in `~/.config/agent-skills/config.json`.

#### `skills registry members`

```bash
$ skills registry members kove-inc
jake        admin
alex        contributor
sarah       member
```

#### `skills registry invite`

```bash
$ skills registry invite kove-inc --email alex@example.com --role contributor
Invited alex@example.com as contributor to kove-inc
```

### 6.7 SKILLS_INDEX.md Generation

Generated during `skills sync` at `<install_path>/SKILLS_INDEX.md`. This is the primary file agents read to discover available skills.

```markdown
# Available Skills

This file is auto-generated by the skills CLI. Do not edit manually.

## supabase-edge
- **Source:** kove-inc
- **Version:** 1.3.0
- **Description:** Edge Function invocation patterns via SDK
- **Tags:** supabase, backend, typescript
- **Compatibility:** claude-code, cursor, codex
- **File:** supabase-edge/SKILL.md

## zod-v4
- **Source:** kove-inc
- **Version:** 2.1.0
- **Description:** Ensures Zod v4 patterns are used correctly
- **Tags:** validation, zod, typescript
- **Compatibility:** claude-code, cursor, codex
- **File:** zod-v4/SKILL.md

## my-experiment
- **Source:** jake
- **Version:** 1.0.0
- **Description:** Testing something
- **Tags:** experimental
- **File:** my-experiment/SKILL.md
```

---

## 7. Meta-Skill (Feature 2)

The meta-skill is a SKILL.md file bundled with the CLI and automatically installed to `<install_path>/_system/SKILL.md` during every `skills sync`.

### 7.1 Content

```markdown
# Skills System — Agent Instructions

You have access to a skills system that provides curated instruction files
to guide your work. This file explains how to use it.

## Discovering Skills

Check the file `SKILLS_INDEX.md` in this directory. It lists every skill
installed in this project with its name, description, tags, and file path.

Before starting any task, scan SKILLS_INDEX.md to identify relevant skills.
Match skills to your task by:
- Name and description (most reliable)
- Tags (e.g. if working with Supabase, look for "supabase" tag)
- Compatibility (check if your agent type is listed)

## Using Skills

When you find a relevant skill:
1. Read the full SKILL.md file at the path listed in SKILLS_INDEX.md
2. Follow its instructions as authoritative guidance for your work
3. If multiple skills are relevant, read all of them before starting
4. Skills take precedence over your default patterns when they conflict

## Managing Skills (When Asked by the User)

If the user asks you to manage skills, you have these CLI commands available.
Run them in the terminal:

### Viewing Available Skills
- `skills list` — Show all skills available in remote registries
- `skills list --installed` — Show skills installed in this project
- `skills search <query>` — Search for skills by keyword
- `skills info <name>` — Show full details about a skill

### Installing and Removing
- `skills add <name>` — Add a skill to this project and sync it
- `skills remove <name>` — Remove a skill from this project
- `skills sync` — Re-sync all installed skills from remote
- `skills update` — Pull latest versions of all skills

### Editing and Publishing
- `skills edit <name>` — Open a skill for editing in the default editor
- `skills push <name>` — Publish local edits to the remote registry
- `skills diff <name>` — See what changed between local and remote
- `skills validate <name>` — Check skill file structure

### Creating New Skills
To create a new skill:
1. Write a SKILL.md file following the format of existing skills
2. Run `skills push <name> --from-stdin` piping in the content, or
3. Create the file in the skills folder and run `skills push <name>`

A good SKILL.md includes:
- A clear title (# heading)
- A description of what the skill covers
- Specific, actionable instructions
- Code examples where relevant
- Common pitfalls or anti-patterns to avoid

## Rules

- Do NOT modify .skills.yaml directly — use the CLI commands
- Do NOT delete or rename skill folders manually
- Do NOT assume a skill exists without checking SKILLS_INDEX.md
- The _system folder (where this file lives) is managed by the CLI — do not modify it
```

### 7.2 Installation Behavior

During `skills sync`:
1. Read the meta-skill content (bundled as a string constant in the CLI source code)
2. Write to `<install_path>/_system/SKILL.md`
3. The `_system` folder is always present regardless of which skills are configured
4. SKILLS_INDEX.md should reference the meta-skill first, before all other skills

---

## 8. Project Structure & Configuration

### 8.1 Supabase Project Structure

```
skills-platform/
├── supabase/
│   ├── config.toml
│   ├── migrations/
│   │   ├── 00001_initial_schema.sql        -- All tables, types, indexes
│   │   ├── 00002_rls_policies.sql          -- All RLS policies
│   │   └── 00003_triggers.sql              -- All triggers and functions
│   ├── functions/
│   │   ├── api/
│   │   │   └── index.ts                    -- Main API router
│   │   ├── oauth/
│   │   │   └── index.ts                    -- OAuth flow (HTML + token exchange)
│   │   └── mcp/
│   │       └── index.ts                    -- MCP server over SSE
│   └── seed.sql                            -- Default OAuth clients, test data
├── cli/
│   ├── src/                                -- CLI source (see section 6.1)
│   ├── package.json
│   └── tsconfig.json
└── README.md
```

### 8.2 Supabase Edge Function Shared Code

Edge Functions can share code via an `_shared` directory:

```
supabase/functions/
├── _shared/
│   ├── supabase.ts      -- Create Supabase client from request JWT
│   ├── cors.ts          -- CORS headers helper
│   ├── errors.ts        -- Error response helpers
│   └── types.ts         -- Shared TypeScript types
├── api/
│   └── index.ts
├── oauth/
│   └── index.ts
└── mcp/
    └── index.ts
```

`_shared/supabase.ts`:
```typescript
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export function createSupabaseClient(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) throw new Error("Missing Authorization header");

  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    {
      global: {
        headers: { Authorization: authHeader },
      },
    }
  );
}

export function createAdminClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}
```

---

## 9. Error Handling

All API responses should use consistent error format:

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Skill 'nonexistent' not found in registry 'kove-inc'"
  }
}
```

Standard error codes:

| Code | HTTP Status | When |
|---|---|---|
| `UNAUTHORIZED` | 401 | Missing or invalid JWT |
| `FORBIDDEN` | 403 | Valid JWT but insufficient permissions |
| `NOT_FOUND` | 404 | Resource doesn't exist or user can't access it |
| `CONFLICT` | 409 | Duplicate (e.g. skill slug already exists, user already member) |
| `VALIDATION_ERROR` | 422 | Invalid input (bad slug, invalid semver, etc.) |
| `INTERNAL_ERROR` | 500 | Unexpected server error |

The CLI should display friendly error messages, not raw JSON. Map error codes to human-readable messages:
- 401 → "Not logged in. Run `skills login` first."
- 403 → "You don't have permission to do that. Contact a registry admin."
- 404 → "Skill not found. Run `skills search` to find available skills."
- 409 → "A skill with that name already exists in this registry."

---

## 10. Development & Deployment

### 10.1 Local Development

```bash
# Start Supabase locally
supabase start

# Run migrations
supabase db reset

# Serve Edge Functions locally
supabase functions serve

# In another terminal, develop the CLI
cd cli
yarn install
yarn dev  # runs ts-node src/index.ts with --watch
```

### 10.2 Deployment

```bash
# Deploy database migrations
supabase db push

# Deploy all Edge Functions
supabase functions deploy api
supabase functions deploy oauth
supabase functions deploy mcp

# Publish CLI to npm
cd cli
yarn build
npm publish
```

### 10.3 Environment Variables

Set via Supabase dashboard or CLI:

```bash
supabase secrets set SUPABASE_URL=https://<ref>.supabase.co
supabase secrets set SUPABASE_ANON_KEY=eyJ...
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

The `SUPABASE_URL` and `SUPABASE_ANON_KEY` are automatically available in Edge Functions. The service role key is needed only for the OAuth function (to create sessions on behalf of users).

---

## 11. MVP Scope & Priorities

### Must Have (MVP)

1. **Database**: All tables, RLS policies, triggers
2. **Auth**: Register, login, token refresh via Edge Functions
3. **API**: CRUD for registries, skills, versions, and the sync endpoint
4. **CLI commands**: `init`, `login`, `sync`, `add`, `remove`, `list`, `search`, `push`
5. **Meta-skill**: Bundled SKILL.md + SKILLS_INDEX.md generation
6. **Access control**: Roles (member/contributor/admin), RLS enforcement

### Should Have (Post-MVP)

7. **MCP server**: Full MCP implementation over SSE
8. **OAuth flow**: HTML login page for MCP client connections
9. **CLI commands**: `update`, `diff`, `edit`, `info`, `validate`, `bundle`, `config`
10. **Invitations**: Invite flow with email
11. **`report_skill_issue`**: MCP tool + issues table

### Nice to Have (Later)

12. **Approval workflows**: Pending state for skill updates in strict registries
13. **Webapp dashboard**: Browse skills, manage registries, view analytics
14. **GitHub Action**: Auto-sync skills in CI
15. **Usage analytics**: Track which skills are used most
16. **Full-text search**: Postgres tsvector indexes for better search

---

## 12. Testing

### API Tests

Write integration tests that:
1. Create a user and verify profile + personal registry auto-creation
2. Create a skill in the personal registry and verify it's accessible
3. Create an org registry, invite a member, verify role-based access
4. Test that members cannot push skills (only contributors+)
5. Test that contributors cannot edit skills they don't own/maintain
6. Test the sync endpoint with multiple skills and version constraints
7. Test version resolution (exact, >=, ^, ~)

### CLI Tests

Write unit tests for:
1. `.skills.yaml` parsing and validation
2. `.skills.lock` generation and comparison
3. SKILLS_INDEX.md generation
4. Semver constraint resolution
5. Command argument parsing

Write integration tests for:
1. Full `init → login → add → sync → push` workflow
2. Multi-source configuration
3. Error handling (network failures, auth failures, permission denied)
```
