# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository, **focused only on the local CLI and non-cloud workflows**.

## Project Overview

This is Overskill - a skills platform (MVP) that allows developers to store, version, share, and sync reusable skills (markdown instruction files) across repositories and AI agents.

For the purposes of this file, you should assume:

- **You are only working with the local TypeScript CLI (`skill`)**
- **You should not assume or rely on any remote cloud services, databases, or hosted APIs**

The spec for the overall platform is documented in `skills-platform-spec.md`, but you only need to use the parts that apply to the CLI itself.

## CLI Development

The CLI is implemented in TypeScript and uses `commander` for command definitions.

```bash
cd cli

# Install dependencies
yarn install

# Development mode with auto-reload
yarn dev

# Type checking
yarn typecheck

# Build for production
yarn build

# Run built CLI
yarn start
```

## CLI Architecture

The CLI is built with TypeScript and `commander`.

- `.skills.yaml` is the main project-level config (committed)
- `SKILLS_INDEX.md` is auto-generated in the install directory for AI agents
- Skills are installed to `.claude/skills/` by default
- Global config directory: `~/.overskill/` (works on macOS, Linux, Windows)

You can safely reason about these files and flows **without** needing to know anything about how a server or database might be implemented.

## Common CLI Workflows

### Testing a CLI Command

Each command lives in `cli/src/commands/`.

To run a command in development:

```bash
cd cli
yarn dev <command> [options]
```

For example, to test the `sync` command:

```bash
cd cli
yarn dev sync
```

### Adding a New CLI Command

1. Create a new file in `cli/src/commands/<command-name>.ts`.
2. Export a `Command` instance (from `commander`) with name, description, options, and an `action`.
3. Import and register the command in `cli/src/index.ts` using `program.addCommand()`.

When adding commands, prefer:

- Clear, composable helpers in `cli/src/lib/`
- Named argument objects for functions with more than two parameters
- Good error messages that don't expose internal stack traces by default

## Testing Considerations (CLI-Only)

When testing CLI behavior, focus on:

- Config file operations (read/write `.skills.yaml`)
- Filesystem effects (creating/updating skill directories and files)
- User-facing messages and exit codes

For external interactions that would normally hit a remote API, **prefer mocking** in tests or using abstractions in `cli/src/lib/` that can be easily stubbed.

## File Locations

**CLI:**
- Commands: `cli/src/commands/`
- Libraries: `cli/src/lib/`
- Types: `cli/src/types.ts`
- Built output: `cli/dist/`

**Config Files:**
- `.skills.yaml` - Project config (committed)
- `.claude/skills/` - Default install directory for skills
- `~/.overskill/config.json` - Global CLI config (cross-platform: macOS, Linux, Windows)

<!-- overskill-start -->
## Overskill Skills

This project uses Overskill to manage reusable AI skills.

Before starting any task, read `.claude/skills/SKILLS_INDEX.md` to discover available skills. When a skill is relevant to your current task, read its full SKILL.md file and follow its instructions.

To manage skills, use the `skill` CLI command (run `skill --help` for usage).
<!-- overskill-end -->
