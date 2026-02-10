# Overskill

[Visit the Overskill Website](https://overskill.jacobchaselubitz.com/)

Overskill is a AI coding agent skills manager that lets you keep skills in sync across repositories. It gives you a single place to write, version, and share the instruction files that guide tools like Claude Code, Cursor, Codex, and Windsurf — then apply them to any repository with one command.

**Why Overskill?**

- **Write once, use everywhere.** Create a skill once and add it to as many repositories as you need. When you improve it, update every project in seconds.
- **Agent-agnostic.** Skills are plain markdown files. They work with any agent that can read markdown — no plugin API, no vendor lock-in.
- **Version-locked per repo.** `.skills.lock` pins exact versions and content hashes, so every collaborator and CI run gets the same skills.
- **Transparent and auditable.** Skills live in your project as visible files you can read, diff, and review like any other code.
- **Works offline.** Once synced, skills are local files with no runtime dependency on external services.

## How it works

Overskill maintains a **global registry** on your machine (in `~/.overskill/registry/`). When you create or import a skill, it's saved there. When you run `skill add` and `skill sync` in a repository, Overskill copies the right version into the project's `.skills/` directory and generates an index file so AI agents discover them automatically.

## Documentation

1. **[Getting Started](./docs/getting-started.md)** — Install Overskill and add it to your first project
2. **[Configuration](./docs/configuration.md)** — View and change global settings like your default editor
3. **[Managing Skills in a Repository](./docs/managing-skills.md)** — Initialize a repo, import existing skills, create new ones, add and remove skills
4. **[Syncing and Updating](./docs/syncing-and-updating.md)** — Check installed versions, sync skills, and update to the latest
5. **[Editing Skills](./docs/editing-skills.md)** — Edit a skill, publish a new version, and apply changes to a project
6. **[Command Reference](./docs/command-reference.md)** — Full list of commands and flags

## Quick start

```bash
# Install
npm install -g overskill

# Or install with Homebrew
brew tap jchaselubitz/tap
brew install overskill
  
# Initialize in a project
cd your-project
skill init

# Import skills you've already written for Claude, Cursor, or Codex
skill import

# Or create a new skill from scratch
skill new my-skill

# Add skills to the project
skill add my-skill
```

## License

MIT
