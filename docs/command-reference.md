# Command Reference

## Project Setup

### `skill init`

Initialize a new skills configuration in the current directory.

| Flag | Description |
|------|-------------|
| `-p, --path <path>` | Install path for skills (default: `.skills`) |
| `--cloud` | Include a cloud registry source |
| `-u, --url <url>` | API URL for cloud registry (requires `--cloud`) |
| `-r, --registry <slug>` | Cloud registry slug (requires `--cloud`) |

### `skill login`

Authenticate with the skills platform.

| Flag | Description |
|------|-------------|
| `--manual` | Use manual code entry instead of browser redirect |

### `skill sync`

Install all configured skills from the registry into the project.

| Flag | Description |
|------|-------------|
| `-f, --force` | Force re-install even if unchanged |

### `skill import [path]`

Import skills from Claude, Cursor, Codex, and other AI tool locations.

| Flag | Description |
|------|-------------|
| `-f, --force` | Overwrite existing skills in the registry |
| `--sync` | Run sync after importing |
| `--dry-run` | Preview what would be imported |
| `-y, --yes` | Import all without prompting |

---

## Skill Creation & Management

### `skill new <slug>`

Create a new skill in the local registry.

| Flag | Description |
|------|-------------|
| `-n, --name <name>` | Display name |
| `-d, --description <desc>` | Description |
| `-t, --tags <tags>` | Comma-separated tags |
| `-c, --compat <compat>` | Compatibility list (e.g., `claude,cursor`) |
| `-v, --version <version>` | Initial version (default: `1.0.0`) |
| `-m, --metadata <key=value>` | Custom frontmatter metadata (repeatable) |
| `--content <file>` | Read content from file instead of editor |
| `--blank` | Open editor with blank content |
| `--no-editor` | Skip editor, create with template |
| `--no-add` | Skip adding to current project |
| `--no-sync` | Skip automatic sync |

### `skill publish <slug>`

Publish a new version of an existing skill.

| Flag | Description |
|------|-------------|
| `-v, --version <version>` | Explicit version number |
| `--patch` | Bump patch version |
| `--minor` | Bump minor version |
| `--major` | Bump major version |
| `-m, --message <message>` | Changelog message |
| `--content <file>` | Read content from file |
| `--no-editor` | Skip editor, use current content |

### `skill edit <slug>`

Open a skill for editing in your configured editor.

| Flag | Description |
|------|-------------|
| `-e, --editor <editor>` | Editor to use (overrides config) |

### `skill diff [slug]`

Show differences between local and remote skill content. Requires a cloud source. Omit slug to diff all configured skills.

### `skill validate [slug]`

Validate skill files. Validates all installed skills if no slug is provided.

---

## Project Operations

### `skill add [slugs...]`

Add skills to the current project. Shows an interactive selection if no slugs are provided.

| Flag | Description |
|------|-------------|
| `-v, --version <constraint>` | Version constraint (e.g., `>=1.0.0`, `^2.0.0`) |
| `--no-sync` | Skip automatic sync after adding |

### `skill remove <slugs...>`

Remove one or more skills from the current project.

### `skill delete <skill>`

Delete a skill from a registry. Use `<slug>` for local registry, or `<registry>/<slug>` for a remote registry.

### `skill push [slug]`

Publish local skill changes to a cloud registry. Requires a cloud source. Omit slug to push all modified skills.

| Flag | Description |
|------|-------------|
| `-v, --version <version>` | Version number for the new version |
| `-c, --changelog <message>` | Changelog message |
| `--from-stdin` | Read skill content from stdin |
| `--create` | Create a new skill (requires `--name`) |
| `-n, --name <name>` | Human-readable name (for `--create`) |
| `-d, --description <desc>` | Description (for `--create`) |
| `-t, --tags <tags>` | Tags, comma-separated (for `--create`) |
| `--compat <compat>` | Compatibility, comma-separated (for `--create`) |

### `skill bundle [slugs...]`

Bundle all or selected skills into a single markdown file. Bundles all installed skills if no slugs are provided.

| Flag | Description |
|------|-------------|
| `-o, --output <path>` | Output file path (default: `skills-bundle.md`) |

### `skill update [slug]`

Update skills to their latest versions. Updates all skills if no slug is provided.

| Flag | Description |
|------|-------------|
| `--check` | Only check for updates, do not install |

---

## Discovery & Information

### `skill list`

List available skills.

| Flag | Description |
|------|-------------|
| `-i, --installed` | Show only skills in the current project |
| `-l, --local` | Show skills from the local registry cache |
| `-t, --tags <tags>` | Filter by tags (comma-separated) |
| `-c, --compat <compat>` | Filter by compatibility (comma-separated) |

### `skill search <query>`

Search for skills by keyword in the local registry.

| Flag | Description |
|------|-------------|
| `-t, --tags <tags>` | Filter by tags |
| `-c, --compat <compat>` | Filter by compatibility |

### `skill info <slug>`

Show detailed information about a skill.

| Flag | Description |
|------|-------------|
| `-v, --version <version>` | Show info for a specific version |

---

## Configuration

### `skill config <key> [value]`

Get or set a global configuration value. Omit the value to read the current setting.

Valid keys: `editor`, `install_path`, `api_url`, `web_app_url`

### `skill config show`

Show all configuration values.

### `skill config logout`

Clear authentication tokens.

---

## Registry Management

### `skill registry list`

List all accessible registries.

### `skill registry create <slug>`

Create a new organization registry.

| Flag | Description |
|------|-------------|
| `-n, --name <name>` | Registry name |
| `-d, --description <desc>` | Registry description |

### `skill registry members <slug>`

List members of a registry.

### `skill registry invite <slug>`

Invite a user to a registry.

| Flag | Description |
|------|-------------|
| `-e, --email <email>` | Email of user to invite (required) |
| `-r, --role <role>` | Role: `member`, `contributor`, or `admin` (default: `member`) |

### `skill registry invitations`

List pending invitations for your account.

### `skill registry accept <registry> <invitation-id>`

Accept a pending invitation.

### `skill registry decline <registry> <invitation-id>`

Decline a pending invitation.
