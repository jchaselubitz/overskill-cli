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

### Local-Only Workflow (No Cloud)

1. Initialize a local-only project:

```bash
skills init
```

2. Create a new skill:

```bash
skills new my-skill
```

3. Add skills from local cache:

```bash
skills add my-skill
```

4. Import skills from other tools (Claude, Cursor, Codex):

```bash
skills import
```

### Cloud Workflow

1. Configure the API URL:

```bash
skills config api_url https://your-domain.example/api
```

2. Initialize with cloud registry:

```bash
skills init --cloud --registry your-registry
```

3. Log in:

```bash
skills login
```

4. Add and sync skills:

```bash
skills add my-skill
skills sync
```

## Commands

### Configuration

- `skills config <key> [value]` - Get or set config (`api_url`, `editor`, `install_path`)
- `skills config show` - Show all config
- `skills config logout` - Clear authentication tokens

### Project Setup

- `skills init [options]` - Initialize `.skills.yaml` in current directory
  - `--cloud` - Include a cloud registry source
  - `-u, --url <url>` - API URL for cloud registry (requires `--cloud`)
  - `-r, --registry <slug>` - Cloud registry slug (requires `--cloud`)
  - `-p, --path <path>` - Custom install path (default: `.skills`)

### Authentication

- `skills login [--manual]` - Authenticate with cloud registry (browser flow or manual code entry)

### Skill Creation & Management

- `skills new <slug> [options]` - Create a new skill in local registry
  - `-n, --name <name>` - Display name
  - `-d, --description <desc>` - Description
  - `-t, --tags <tags>` - Comma-separated tags
  - `-c, --compat <compat>` - Compatibility list (e.g., `claude,gpt4`)
  - `-v, --version <version>` - Initial version (default: `1.0.0`)
  - `-m, --metadata <key=value>` - Custom frontmatter metadata (repeatable)
  - `--content <file>` - Read content from file instead of editor
  - `--blank` - Open editor with blank content (frontmatter only)
  - `--no-editor` - Skip editor, create with template
  - `--no-add` - Skip adding to current project
  - `--no-sync` - Skip automatic sync

- `skills publish <slug> [options]` - Publish a new version of existing skill
  - `-v, --version <version>` - Explicit version number
  - `--patch` - Bump patch version (1.0.0 → 1.0.1)
  - `--minor` - Bump minor version (1.0.0 → 1.1.0)
  - `--major` - Bump major version (1.0.0 → 2.0.0)
  - `-m, --message <message>` - Changelog message
  - `--content <file>` - Read content from file
  - `--no-editor` - Skip editor, use current content

- `skills import [path] [options]` - Import skills from other AI tools
  - `[path]` - Custom path to scan (optional)
  - `-f, --force` - Overwrite existing skills
  - `--add` - Add imported skills to `.skills.yaml`
  - `--sync` - Run sync after importing (requires `--add`)
  - `--dry-run` - Preview without making changes
  - `-y, --yes` - Import all without prompting

### Project Operations

- `skills add [slugs...] [options]` - Add skills to project
  - Interactive mode if no slugs provided (checkbox selection)
  - `-v, --version <constraint>` - Version constraint (e.g., `>=1.0.0`, `^2.0.0`)
  - `--no-sync` - Skip automatic sync after adding

- `skills remove <slugs...>` - Remove skills from project

- `skills sync [options]` - Sync configured skills to install directory
  - `-f, --force` - Force re-install even if unchanged

- `skills update [slug] [--check]` - Update to latest versions

### Discovery & Information

- `skills list [options]` - List available skills
  - `--installed` - Show only installed skills in current project
  - `--local` - Show only local registry skills

- `skills search <query> [options]` - Search for skills
  - `-t, --tags <tags>` - Filter by tags
  - `-c, --compat <compat>` - Filter by compatibility

- `skills info <slug> [options]` - Show detailed skill information
  - `-v, --version <version>` - Show info for specific version

### Editing & Validation

- `skills edit <slug>` - Edit a local skill using configured editor

- `skills diff <slug>` - Show differences between local and registry versions

- `skills validate [slug]` - Validate skill files (validates all if no slug provided)

## Project Files

- `.skills.yaml` - Project config (sources, install path, skills list)
- `.skills.lock` - Version lock file (like package-lock.json)
- `.skills/` - Installed skills directory (default, configurable)
- `SKILLS_INDEX.md` - Generated index of installed skills for AI discovery

## Local Registry

Skills are cached locally in `~/.local/share/agent-skills/cache/` (Linux/macOS) or equivalent on Windows. The local registry supports:

- Creating skills with `skills new`
- Publishing versions with `skills publish`
- Importing from other tools with `skills import`
- Version resolution with semver constraints

# Coming for Cloud

### Commands for Cloud

- `skills login [--manual]` - Authenticate with cloud registry (browser flow or manual code entry)

- `skills config api_url <url>` - Set the API URL for the cloud registry

- `skills config registry <slug>` - Set the registry slug for the cloud registry

- `skills config install_path <path>` - Set the install path for the cloud registry

### Publishing & Sharing

- `skills push [slug] [--create ...]` - Publish changes to cloud registry

- `skills bundle [slugs...] [options]` - Bundle skills into single markdown file
  - `[slugs...]` - Specific skills to bundle (bundles all if omitted)
  - `-o, --output <path>` - Output file path (default: `skills-bundle.md`)

- `skills delete <skill>` - Delete skill from registry
  - Local: `skills delete <slug>`
  - Remote: `skills delete <registry>/<slug>`

### Registry Management

- `skills registry <subcommand>` - Manage registries and invitations
  - See `skills registry --help` for subcommands



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
