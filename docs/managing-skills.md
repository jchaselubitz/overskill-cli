# Managing Skills in a Repository

## How Overskill structures a project

When you initialize Overskill in a repository, it creates the following:

| File / Directory | Purpose | Commit to git? |
|---|---|---|
| `.skills.yaml` | Lists which skills the project uses and where to find them | Yes |
| `.skills.lock` | Pins exact versions and content hashes for reproducibility | Yes |
| `.skills/` | Contains the installed skill files | Your choice |
| `.skills/SKILLS_INDEX.md` | Auto-generated index so AI agents can discover skills | Your choice |

On `init` and `sync`, Overskill also updates your AI agent config files so that Claude, Cursor, and Codex automatically discover installed skills:

- `CLAUDE.md` — managed section pointing to the skills index
- `AGENTS.md` — same, for Codex and other agents
- `.cursor/rules/overskill.mdc` — Cursor rule with `alwaysApply: true`

These sections are wrapped in `<!-- overskill-start -->` / `<!-- overskill-end -->` markers and are updated without affecting the rest of the file.

## Initializing a repository

```bash
skill init
```

Options:
- `-p, --path <path>` — custom install path (default: `.skills`)

## Importing existing skills

If you already have skills written for Claude, Cursor, or Codex, start with `skill import` instead of creating everything from scratch:

```bash
skill import
```

Overskill scans common locations automatically:
- `.claude/skills/` and `~/.claude/skills/` (Claude Code skills)
- `.claude/commands/` and `~/.claude/commands/` (Claude Code commands)
- `AGENTS.md` (Codex)
- `.cursorrules` and `.cursor/rules/` (Cursor)

You can also point it at a custom path:

```bash
skill import ./my-rules/
```

Imported skills are saved to your global registry so you can reuse them across projects.

## Creating a new skill

```bash
skill new my-skill
```

This opens your configured editor with a template. When you save and close, the skill is saved to the global registry and automatically added to the current project.

Options:
- `-n, --name <name>` — display name
- `-d, --description <desc>` — description
- `-t, --tags <tags>` — comma-separated tags
- `--content <file>` — read content from a file instead of opening the editor
- `--no-editor` — create with the default template, skip the editor
- `--no-add` — don't add to the current project
- `--no-sync` — don't sync after adding

## Adding an existing skill to a project

If a skill already exists in your global registry (from a previous `skill new` or `skill import`), add it to the current project:

```bash
skill add my-skill
```

Run `skill add` with no arguments to get an interactive list of available skills.

Options:
- `-v, --version <constraint>` — version constraint (e.g., `^1.0.0`, `>=2.0.0`)
- `--no-sync` — skip automatic sync after adding

## Removing a skill

```bash
skill remove my-skill
```

This removes the skill from `.skills.yaml`, deletes it from the `.skills/` directory, and updates the lockfile. The skill remains in your global registry for use in other projects.

You can remove multiple skills at once:

```bash
skill remove skill-one skill-two
```
