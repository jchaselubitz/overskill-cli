# Changelog

All notable changes to this project will be documented in this file.

## [2.2.0] - 2026-02-13

### Removed
- **Removed `.skills.lock` lockfile**: The lockfile concept has been removed entirely. `skill sync` now always installs the latest version of each skill from the registry, making the lockfile unnecessary. The `--force` flag on `sync` has also been removed since every sync now writes the latest content.
- `SkillsLock` and `LockedSkill` types
- `src/lib/lockfile.ts` module
- Lockfile update calls from `save`, `push`, and `remove` commands

## [2.1.0] - 2026-02-13

### Changed
- **`.claude/skills/` is now the single source of truth for all agents**: Skills, `SKILLS_INDEX.md`, and the `_system` meta-skill are all written to `.claude/skills/`. Previously these were split between `.skills/` and `.claude/skills/`. Agent configuration files (CLAUDE.md, AGENTS.md, Cursor rules) now point agents to `.claude/skills/` to discover available skills.
- **`SKILLS_INDEX.md` moved to `.claude/skills/`**: The auto-generated index file that agents use to discover skills is now written inside `.claude/skills/SKILLS_INDEX.md` instead of `.skills/SKILLS_INDEX.md`.

### Migration

If you are upgrading from v2.0.x, run the following once to update your global registry, then sync each repository:

```bash
# Run once globally
skill upgrade

# Run in each repository that uses Overskill
skill sync
```

## [2.0.0] - 2026-02-11

### Changed
- **Removed versioning system**: Skills no longer track semver versions in the registry. Instead, a version number is included as an HTML comment (`<!-- version: 1.0.0 -->`) at the top of each SKILL.md for reference only. The registry stores one copy of each skill (the latest).
- **Simplified lockfile**: `.skills.lock` now only tracks `slug` and `sha256` (no version or registry fields).
- **Simplified `.skills.yaml`**: Skill entries no longer have a `version` constraint field.
- **Renamed `skill update` to `skill save`**: Saves local project skill changes back to the registry. The flow is: open a skill in your editor, then run `skill save` to persist changes.
- **Removed `skill edit`**: Use `skill open` instead, which works globally without requiring a project.
- **Simplified `skill sync`**: Now simply pulls the latest content for each skill from the local registry into the project.
- **Simplified `skill publish`**: Now directly updates skill content in the local registry without version bumping.
- **Reordered CLI commands**: Local/core commands appear first in help output; cloud-related commands are grouped at the bottom.
- **Simplified `skill info`**: No longer shows version history (since versions are no longer tracked).
- **Simplified `skill list`**: No longer shows version numbers.
- **Simplified `skill add`**: Removed `--version` option.

### Added
- **`skill open <slug>`**: New command that opens a skill in your configured editor from anywhere (no project required). Works globally by opening the skill's SKILL.md from the local registry.
- **`skill rename <slug>`** New command that allows you to enter a new name for the skill. It changes both the slug and the skill name.
- **Version comment in new skills**: `skill new` now adds `<!-- version: 1.0.0 -->` at the top of each new skill for reference.
- **SKILL.md working copy in registry**: The local registry now maintains a readable `SKILL.md` file alongside `meta.yaml` for each skill, making `skill open` possible.
- **Legacy migration**: Skills created with the old versioning system are automatically migrated (sha256 is read from versions.yaml into meta.yaml).

### Removed
- Semver version resolution and constraints (`^1.0.0`, `~1.0.0`, etc.)
- `versions.yaml` in the local registry (no longer written; old files are read for migration)
- Version fields from `LockedSkill`, `SkillEntry`, and `SkillMeta` types
- Version history display in `skill info`
- `--version` / `--patch` / `--minor` / `--major` options from `skill publish`
