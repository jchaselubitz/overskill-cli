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
skill save --check
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

After saving, the lockfile and installed files are updated automatically.
