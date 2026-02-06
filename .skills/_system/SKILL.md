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
