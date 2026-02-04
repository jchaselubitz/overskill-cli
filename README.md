# Skill Hub

CLI and Supabase functions for managing agent skills across repositories.

## Requirements

- Node.js >= 18
- Supabase CLI (for local function development)

## Setup

### CLI

1. Install dependencies and build:

```bash
cd cli
npm install
npm run build
```

2. Run the CLI:

```bash
node dist/index.js --help
```

Optional: link the CLI for a global `skills` command:

```bash
npm link
skills --help
```

### Backend (Supabase Functions)

The OAuth flow and API live under `supabase/functions`. For local dev, ensure the function environment has:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

To serve functions locally (example):

```bash
supabase functions serve oauth --no-verify-jwt
```

## CLI Quick Start

1. Configure the API URL (must end with `/api` so OAuth can derive `/oauth`):

```bash
skills config api_url https://your-domain.example/api
```

2. Initialize a project and set a default registry:

```bash
skills init --registry your-registry
```

3. Log in:

```bash
skills login
```

4. Add skills and sync:

```bash
skills add my-skill
skills sync
```

## Common Commands

- `skills config <key> [value]`: Get or set config (`api_url`, `editor`, `install_path`).
- `skills config show`: Show all config.
- `skills config logout`: Clear tokens.
- `skills init --registry <slug> [--url <api_url>] [--path <dir>]`: Initialize `.skills.yaml`.
- `skills login [--manual]`: Authenticate (browser flow or manual code entry).
- `skills list`: List all available skills.
- `skills list --installed`: List installed skills for the current project.
- `skills search <query> [-t tags] [-c compat]`: Search skills.
- `skills add <slug...> [--source <name>] [--version <constraint>] [--no-sync]`: Add skills.
- `skills sync [-f]`: Download configured skills.
- `skills update [slug] [--check]`: Update to latest versions.
- `skills edit <slug>`: Edit a local skill using your configured editor.
- `skills diff <slug>`: Show local vs. registry differences.
- `skills push [slug] [--create ...]`: Publish changes or create a new skill.
- `skills registry <subcommand>`: Manage registries and invitations.

## Project Files

- `.skills.yaml`: Project config (sources, install path, skills list).
- `.skills/`: Installed skills directory (default, configurable).
- `SKILLS_INDEX.md`: Generated index of installed skills.

## Development

- CLI dev mode:

```bash
cd cli
npm run dev
```

- Typecheck:

```bash
cd cli
npm run typecheck
```
