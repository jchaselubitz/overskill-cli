# Syncing and Updating Skills

## Checking which skills a project uses

To see all skills in the current project:

```bash
skill list --installed
```

To see detailed information about a specific skill:

```bash
skill info my-skill
```

## Syncing skills

`skill sync` installs all configured skills from your global registry into the project's `.claude/skills/` directory. It always writes the latest version from the registry. It also regenerates the skills index and updates agent config files.

```bash
skill sync
```

## Saving skill changes

To save all modified skills back to the registry:

```bash
skill save
```

To save a specific skill:

```bash
skill save my-skill
```

After saving, installed files are updated automatically on the next `skill sync`.
