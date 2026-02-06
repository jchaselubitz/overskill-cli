# Syncing and Updating Skills

## Checking which versions a project uses

To see all skills in the current project along with their locked versions:

```bash
skill list --installed
```

This shows each skill's slug, its currently locked version, any version constraint, and whether a newer version is available in your global registry.

To see detailed information about a specific skill:

```bash
skill info my-skill
```

## Syncing skills

`skill sync` installs all configured skills from your global registry into the project's `.skills/` directory. It also regenerates the skills index and updates agent config files.

```bash
skill sync
```

Sync respects the lockfile: if a skill is already locked to a version, it keeps that version unless it's missing from the cache. To force a full reinstall:

```bash
skill sync --force
```

## Checking for updates

To see which skills have newer versions available without installing anything:

```bash
skill update --check
```

## Updating skills

To update all skills to their latest versions (respecting any version constraints in `.skills.yaml`):

```bash
skill update
```

To update a specific skill:

```bash
skill update my-skill
```

After updating, the lockfile and installed files are updated automatically.
