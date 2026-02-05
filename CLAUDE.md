# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a skills platform (MVP) that allows developers to store, version, share, and sync reusable "agent skills" (markdown instruction files) across repositories and AI agents. The platform consists of:

1. **CLI tool** (`skills`) - TypeScript CLI published to npm for managing skills
2. **Supabase backend** - Postgres database, Edge Functions API, authentication
3. **MCP server** - Hosted as Supabase Edge Function to expose skills to AI agents

All infrastructure runs on Supabase. The spec is fully documented in `skills-platform-spec.md`.

## Development Commands

### Supabase (Backend)

```bash
# Start local Supabase (requires Docker)
supabase start

# Reset database and run migrations
supabase db reset

# Serve Edge Functions locally
supabase functions serve

# Deploy migrations to remote
supabase db push

# Deploy Edge Functions
supabase functions deploy api
supabase functions deploy oauth
supabase functions deploy mcp
```

### CLI Development

```bash
cd cli

# Install dependencies
npm install

# Development mode with auto-reload
npm run dev

# Type checking
npm run typecheck

# Build for production
npm run build

# Run built CLI
npm start
```

## Architecture

### Backend: Supabase Edge Functions + Postgres

**Request Flow:**
```
CLI/MCP Client → Edge Functions (Deno/TS) → Supabase Auth (JWT) → Postgres (RLS)
```

**Database:**
- All tables use Row-Level Security (RLS) for access control
- Triggers auto-create profiles and registries on user signup
- Three permission roles: `member` (read), `contributor` (write), `admin` (full)
- See migrations in `supabase/migrations/` for schema

### CLI: TypeScript with Commander

**Important Patterns:**
- CLI uses `.skills.yaml` for configuration (committed to repo)
- `.skills.lock` tracks exact versions and SHA256 hashes (like package-lock.json)
- `SKILLS_INDEX.md` is auto-generated in install directory for AI agents to discover skills
- Skills are installed to `.skills/` directory by default (not committed)
- Authentication tokens stored in `~/.config/agent-skills/config.json` using `conf` package

## Common Workflows

### Running the Full Stack Locally

1. Start Supabase: `supabase start`
2. Serve Edge Functions: `supabase functions serve`
3. Develop CLI: `cd cli && npm run dev`
4. Test CLI commands against local API

### Testing a CLI Command

The CLI is built with `commander`. Each command is in `cli/src/commands/`.

Example: Testing the sync command
```bash
cd cli
npm run dev sync
```

### Adding a New API Endpoint

1. Edit `supabase/functions/api/index.ts`
2. Add route matching with `matchRoute()` helper
3. Create Supabase client with `createSupabaseClient(req)` for RLS
4. Perform database operations - RLS enforces permissions automatically
5. Return JSON with `jsonResponse()` helper

### Adding a New CLI Command

1. Create file in `cli/src/commands/<command-name>.ts`
2. Export a `Command` instance with name, description, options, action
3. Import and register in `cli/src/index.ts` with `program.addCommand()`

## Database Patterns

### Row-Level Security (RLS)

All database operations enforce RLS policies. The API creates a Supabase client using the user's JWT, so the database automatically filters based on:
- Registry membership (users only see registries they belong to)
- Role permissions (members read, contributors write, admins manage)
- Skill ownership (only creators/maintainers can update skills)

When writing API code, trust RLS to enforce permissions. If a query returns no rows or throws a permission error, return appropriate HTTP error (403 or 404).

### Triggers

- `on_auth_user_created` - Auto-creates profile when user signs up
- `on_profile_created` - Auto-creates personal registry and adds user as admin
- `on_skill_version_created` - Sets `is_latest=false` on old versions when new version is published

These ensure data consistency without manual orchestration in API code.

## Key Concepts

### Registries

Namespaces that hold skills. Two types:
- `personal` - Auto-created for each user (username as slug)
- `organization` - Created by users for teams

### Skills

Reusable instruction files (SKILL.md) stored in registries. Each skill has:
- Metadata: slug, name, description, tags, compat (compatible agents)
- Versions: Multiple versions with semver, only one marked `is_latest`
- Content: Full markdown stored per version

### Sources

The CLI concept of a "source" maps to a registry. `.skills.yaml` defines sources:
```yaml
sources:
  - name: personal
    registry: jake
    url: https://xyz.supabase.co/functions/v1/api
```

### Sync Workflow

1. CLI reads `.skills.yaml` to get list of skills
2. Calls `POST /api/sync` with all skills and version constraints
3. API returns content for all skills in one response
4. CLI writes each skill to `.skills/<slug>/SKILL.md`
5. Writes metadata to `.skills/<slug>/meta.yaml`
6. Generates `SKILLS_INDEX.md` for AI discovery
7. Updates `.skills.lock` with exact versions and hashes

## Error Handling

Use standardized error helpers from `_shared/errors.ts`:
- `unauthorizedError()` - 401, missing/invalid JWT
- `forbiddenError()` - 403, valid JWT but insufficient permissions
- `notFoundError()` - 404, resource doesn't exist or user lacks access
- `conflictError()` - 409, duplicate resource
- `validationError()` - 422, invalid input
- `internalError()` - 500, unexpected server error

CLI should map these to friendly messages, not raw JSON errors.

## Authentication

### CLI Authentication
- Login via OAuth flow: opens browser to `/oauth/authorize`
- Local HTTP server on port 9876 receives callback with authorization code
- Exchanges code for access token + refresh token
- Stores in `~/.config/agent-skills/config.json`
- Before each API call, checks token expiry and refreshes if needed

### API Authentication
- All authenticated endpoints expect `Authorization: Bearer <jwt>` header
- Call `createSupabaseClient(req)` to get client with user's JWT
- RLS policies automatically enforce based on `auth.uid()`

## Testing Considerations

When testing API endpoints:
- Use admin client for setup (create users, registries)
- Use user client (with JWT) to test RLS enforcement
- Verify RLS prevents unauthorized access (e.g., member can't publish skills)

When testing CLI:
- Mock API responses in `lib/api.ts` or use a test Supabase instance
- Test config file operations (read/write `.skills.yaml`)
- Test lockfile operations (version comparison, hash checking)

## File Locations

**Backend:**
- Database schema: `supabase/migrations/`
- Edge Functions: `supabase/functions/`
- Seed data: `supabase/seed.sql`

**CLI:**
- Commands: `cli/src/commands/`
- Libraries: `cli/src/lib/`
- Types: `cli/src/types.ts`
- Built output: `cli/dist/`

**Config Files:**
- `.skills.yaml` - Project config (committed)
- `.skills.lock` - Version lock (committed)
- `.skills/` - Installed skills directory (not committed)
- `~/.config/agent-skills/config.json` - Global CLI config (user's home directory)
