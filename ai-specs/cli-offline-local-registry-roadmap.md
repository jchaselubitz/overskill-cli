# CLI Roadmap: Offline Mode + Local Registry

This document is an implementation roadmap for making the `skills` CLI usable **without logging in** and for storing **skill content centrally** so new projects can pull the latest cached version.

**Focus:** Local-first usage. Cloud integration (as a cache source) is deferred to later phases.

## Goals

- **Offline-first by default:** `skills` should work for local development without requiring `skills login` or any cloud setup.
- **Centralized skill content:** store `SKILL.md` (and metadata) once per user machine, so multiple projects can reuse it.
- **Reproducible installs:** projects should continue to pin exact skill versions/hashes via `.skills.lock`.
- **Local authoring:** users can create, version, and share skills without cloud infrastructure.

## Non-goals (for this iteration)

- Cloud registry integration (deferred to future phases).
- Full peer-to-peer sharing of registries.
- Cryptographic signing / verification of skill content (leave hooks for later).
- SQLite indexing (start with plain files, add later if needed).

## Current state (baseline)

- Project config: `.skills.yaml` with `sources[]`, `install_path`, `skills[]`.
- Project lock: `.skills.lock` pins `{slug, registry, version, sha256}`.
- Install location: per-project `.skills/<slug>/SKILL.md` + `meta.yaml`.
- Many commands call cloud APIs via `cli/src/lib/api.ts` which requires auth.

## Proposed architecture

### Two layers: global registry + project install

1. **Local registry (global, per-user machine)**
   - Stores canonical `SKILL.md` content and metadata.
   - Provides lookup/search for offline commands (`list`, `info`, `search`, `add` verification, `sync` source).
   - Single source of truth for cached skills.

2. **Project install (per-repo, materialized)**
   - Remains `.skills/` and continues to be gitignored.
   - Driven by `.skills.yaml` (intent) + `.skills.lock` (resolution).

### Local registry storage format

Use a directory rooted in the CLI's OS-specific config directory (the `conf` library handles cross-platform paths automatically).

**Root location:**
```
localRegistryRoot = <dirname(auth.getConfigPath())>/registry
```

**Directory layout:**
```
registry/
  objects/
    <sha256>              # raw SKILL.md content (utf-8), filename is the hash
  skills/
    <slug>/
      meta.yaml           # skill metadata (name/tags/compat/description)
      versions.yaml       # list of all cached versions with their sha256 + timestamps
```

**Note:** There is no separate `latest` file. The "latest" version is computed dynamically from `versions.yaml` using semver sorting. This avoids synchronization issues between files.

### Content-addressed storage

Why content-addressed objects?
- De-duplicates content across versions (same content = same hash = stored once).
- Makes integrity checks trivial (sha256 is the key).
- **Integrity verification on read:** When reading from cache, always verify that the file content matches its sha256 filename. If corrupted, return an error with actionable guidance.

### Atomic writes

All write operations to the local registry must be atomic to handle concurrent access:
- Write content to a temporary file first.
- Use `rename()` to atomically move to final location.
- This prevents partial writes from corrupting the cache.

### Provenance model

Track where cached content came from in `versions.yaml`:

```yaml
versions:
  - version: "1.0.0"
    sha256: "abc123..."
    created_at: "2024-01-15T10:30:00Z"
    provenance:
      kind: local        # "local" (user-created) or "cloud" (fetched)
      source: "imported" # or registry slug if from cloud
```

For local-first usage, all skills will have `provenance.kind: local`.

### Version resolution algorithm

When resolving which version to install, follow this algorithm:

1. **If `.skills.lock` exists and has an entry for the skill:**
   - Use the exact version and sha256 from the lockfile (reproducible builds).
   - Verify the version exists in the local registry cache.
   - If not cached: fail with "Skill 'X' v1.0.0 not in local cache. Run `skills cache import` or `skills new` to add it."

2. **If no lockfile entry exists (new skill or fresh install):**
   - Read all versions from `versions.yaml` for the skill.
   - Filter to versions satisfying the constraint in `.skills.yaml` (e.g., `^1.0.0`).
   - Select the **highest semver** from the filtered set.
   - If no versions satisfy the constraint: fail with "No cached version of 'X' satisfies '^1.0.0'. Available: 1.0.0, 0.9.0."
   - If skill not in cache at all: fail with "Skill 'X' not found in local cache."

3. **No constraint specified:**
   - Use the highest semver version available (computed from `versions.yaml`).

## Config model changes (.skills.yaml)

### Simplified local-only config

For local-first usage, the config is simplified:

```yaml
sources:
  - name: local
    kind: local
install_path: ".skills"
skills:
  - slug: "code-review"
    version: "^1.0.0"  # optional semver constraint
  - slug: "testing"
    # no version = use latest cached
```

**Notes:**
- `source` field on skills is optional; defaults to `local`.
- The local registry path is derived automatically (not user-configured).
- `kind: local` indicates the local registry; no `path` or `url` needed.

### Lockfile changes

For local-only usage, the lockfile uses `"local"` as the registry value:

```yaml
locked_at: "2024-01-15T10:30:00Z"
skills:
  - slug: "code-review"
    registry: "local"     # indicates local registry (not a cloud registry)
    version: "1.0.0"
    sha256: "abc123..."
```

This clearly distinguishes locally-sourced skills from cloud-sourced skills (future).

### Migration behavior

Existing projects with cloud sources continue to work (cloud phases later):
- If `.skills.yaml` uses the old `{name, registry, url}` shape, treat it as `kind: cloud`.
- Those projects will require login until cloud-as-cache is implemented.

## CLI behavior changes (user-facing)

### `skills init`

New default behavior:
- Creates `.skills.yaml` with a single `local` source.
- Creates `.skills/` directory.
- Updates `.gitignore` to include `.skills/`.
- Does NOT require any cloud configuration or login.

```bash
$ skills init
Created .skills.yaml with local registry source.
Created .skills/ directory.
Updated .gitignore.

Next steps:
  skills new <slug>     Create a new skill
  skills add <slug>     Add an existing skill from cache
  skills sync           Install skills to .skills/
```

### `skills new <slug>` (NEW COMMAND)

Create a new skill in the local registry:

```bash
$ skills new code-review
```

Behavior:
1. Prompt for metadata (or accept via flags):
   - `--name "Code Review"` (default: slug titlecased)
   - `--description "..."`
   - `--tags tag1,tag2`
   - `--compat claude,gpt4`
2. Create `$EDITOR` session with skill template or accept `--content <file>`.
3. Prompt for initial version (default: `1.0.0`).
4. Write to local registry:
   - Hash content → store in `objects/<sha256>`.
   - Create/update `skills/<slug>/meta.yaml`.
   - Create/update `skills/<slug>/versions.yaml`.
5. Print success message with next steps.

This enables fully offline skill creation and versioning.

### `skills add <slug>`

Offline-first behavior:
- Verify skill exists in local registry cache.
- If found: add entry to `.skills.yaml` and succeed.
- If not found: fail with actionable message.

```bash
$ skills add unknown-skill
Error: Skill 'unknown-skill' not found in local cache.

To add this skill, either:
  skills new unknown-skill     Create it locally
  skills cache import <path>   Import from a file
```

No "unresolved" skills—if it's not cached, `add` fails. This keeps the system predictable.

### `skills sync`

Install skills from local registry to project:

1. Read `.skills.yaml` to get list of skills.
2. For each skill, resolve version using the algorithm above.
3. Verify content integrity (sha256 matches).
4. Copy content from `objects/<sha256>` to `.skills/<slug>/SKILL.md`.
5. Write `meta.yaml` in each skill directory.
6. Generate `SKILLS_INDEX.md` for AI discovery.
7. Update `.skills.lock` with resolved versions and hashes.

```bash
$ skills sync
Syncing 3 skills...
  ✓ code-review@1.0.0
  ✓ testing@2.1.0
  ✓ debugging@1.5.0

Installed 3 skills to .skills/
```

### `skills list`

List skills from local registry cache (not cloud):

```bash
$ skills list
Local registry (3 skills):
  code-review    1.2.0  Code review guidelines
  testing        2.1.0  Testing best practices
  debugging      1.5.0  Debugging strategies

$ skills list --installed
Installed in this project (2 skills):
  code-review    1.0.0  (pinned, update available: 1.2.0)
  testing        2.1.0
```

### `skills search <query>`

Search local registry cache:

```bash
$ skills search review
Found 2 skills:
  code-review    1.2.0  Code review guidelines
  pr-review      1.0.0  Pull request review checklist
```

### `skills info <slug>`

Show detailed skill information from local cache:

```bash
$ skills info code-review
code-review (Code Review)
  Latest: 1.2.0
  Description: Guidelines for effective code review
  Tags: review, quality, collaboration
  Compatible: claude, gpt4, copilot

  Cached versions:
    1.2.0  2024-01-15  (latest)
    1.1.0  2024-01-10
    1.0.0  2024-01-01
```

### `skills publish <slug>` (NEW - local versioning)

Publish a new version of an existing skill:

```bash
$ skills publish code-review
Current version: 1.2.0
New version [1.3.0]:
Opening editor for SKILL.md content...

Published code-review@1.3.0 to local registry.
```

Behavior:
1. Read current skill from local registry.
2. Open editor with current content (or accept `--content <file>`).
3. Prompt for new version (suggests next patch/minor/major).
4. Hash new content and store in `objects/`.
5. Update `versions.yaml` with new entry.
6. Optionally update `meta.yaml` if metadata changed.

### Cache management commands

```bash
$ skills cache path
/Users/jake/.config/overskill/registry

$ skills cache list
3 skills cached:
  code-review    3 versions  (latest: 1.2.0)
  testing        2 versions  (latest: 2.1.0)
  debugging      1 version   (latest: 1.5.0)

$ skills cache import ./my-skill/SKILL.md --slug my-skill --version 1.0.0
Imported my-skill@1.0.0 to local registry.

$ skills cache export code-review --version 1.2.0 --output ./export/
Exported code-review@1.2.0 to ./export/code-review/

$ skills cache verify
Verifying cache integrity...
  ✓ code-review: 3 versions OK
  ✓ testing: 2 versions OK
  ✗ debugging: object abc123 corrupted (hash mismatch)

1 error found. Run `skills cache repair` to fix.

$ skills cache clean --unused --older-than 90d
Removed 5 unused skill versions (older than 90 days).
Freed 128KB of disk space.
```

## Implementation plan (phased, for a coding agent)

### Phase 1 — Local registry module (read/write)

**Deliverables:**

Create new module: `cli/src/lib/local-registry/`

```
local-registry/
  index.ts          # main exports
  paths.ts          # getRoot(), getObjectPath(), getSkillPath()
  objects.ts        # readObject(), writeObject() with integrity checks
  skills.ts         # skill CRUD operations
  versions.ts       # version management, semver sorting
  types.ts          # LocalSkillMeta, VersionEntry, etc.
```

**Core functions:**

```typescript
// paths.ts
getRoot(): string
getObjectPath(sha256: string): string
getSkillDir(slug: string): string

// objects.ts
writeObject(content: string): Promise<string>  // returns sha256
readObject(sha256: string): Promise<string | null>  // verifies integrity
objectExists(sha256: string): boolean

// skills.ts
putVersion(params: {
  slug: string
  version: string
  content: string
  meta: SkillMeta
  provenance?: Provenance
}): Promise<{ sha256: string }>

getVersion(slug: string, version: string): Promise<{
  content: string
  meta: SkillMeta
  sha256: string
} | null>

getLatestVersion(slug: string): Promise<string | null>  // computed from versions.yaml

listSkills(): Promise<Array<{ slug: string; latestVersion: string; meta: SkillMeta }>>

searchSkills(query: string): Promise<Array<{ slug: string; latestVersion: string; meta: SkillMeta }>>

// versions.ts
resolveVersion(slug: string, constraint?: string): Promise<string | null>
getAllVersions(slug: string): Promise<VersionEntry[]>
```

**Implementation requirements:**

1. **Atomic writes:** All file writes use temp file + rename pattern.
2. **Integrity on read:** `readObject()` must verify sha256 matches content.
3. **Semver sorting:** Use existing `cli/src/lib/semver.ts` for version comparison.
4. **Error handling:** Return `null` for missing data; throw for corruption with actionable message.

**Acceptance criteria:**
- Can create a skill with `putVersion()` and retrieve it with `getVersion()`.
- `readObject()` returns null and logs warning if hash doesn't match content.
- `getLatestVersion()` correctly returns highest semver from `versions.yaml`.
- Multiple concurrent `putVersion()` calls don't corrupt the registry.

### Phase 2 — Config/types evolution + `init`

**Deliverables:**

1. Update `cli/src/types.ts`:

```typescript
// Tagged union for sources
export type SkillSource = LocalSource | CloudSource;

export interface LocalSource {
  name: string;
  kind: 'local';
}

export interface CloudSource {
  name: string;
  kind: 'cloud';
  registry: string;
  url: string;
}

// Helper type guard
export function isLocalSource(source: SkillSource): source is LocalSource {
  return source.kind === 'local';
}

// Update SkillEntry - source is optional, defaults to 'local'
export interface SkillEntry {
  slug: string;
  source?: string;  // optional, defaults to first local source
  version?: string; // optional semver constraint
}
```

2. Update `cli/src/lib/config.ts`:
   - Parse both old `{name, registry, url}` shape (treat as `kind: cloud`) and new shape.
   - Add `isLocalSource()` helper for type narrowing.
   - Default source resolution: first `kind: local` source, or first source if none.

3. Update `cli/src/commands/init.ts`:
   - Default creates local-only config (no `--url/--registry` required).
   - Add `--cloud --url <url> --registry <slug>` options for cloud setup.
   - Print helpful next-steps message.

**Acceptance criteria:**
- `skills init` works with zero arguments, creates local-only config.
- Existing `.skills.yaml` with old shape continues to parse.
- Type guards correctly identify source types.

### Phase 3 — Local skill authoring (`new`, `publish`)

**Deliverables:**

1. New command `cli/src/commands/new.ts`:
   - Creates a new skill in local registry.
   - Supports interactive prompts and flags for metadata.
   - Opens `$EDITOR` for content (use existing editor from auth config).
   - Writes to local registry using Phase 1 module.

2. New command `cli/src/commands/publish.ts` (or extend existing `push.ts`):
   - Publishes new version of existing local skill.
   - Validates version is higher than current latest.
   - Opens editor with current content for editing.

**Acceptance criteria:**
- `skills new my-skill` creates a skill entirely offline.
- `skills publish my-skill` adds a new version.
- Skills are immediately available for `skills add` and `skills sync`.

### Phase 4 — Offline-first commands (`add`, `list`, `search`, `info`)

**Deliverables:**

1. Update `cli/src/commands/add.ts`:
   - Check local registry first (not cloud).
   - Fail with actionable message if skill not cached.
   - No "unresolved" skills allowed.

2. Update `cli/src/commands/list.ts`:
   - Default: list from local registry cache.
   - `--installed`: list from project `.skills/` directory.
   - Show version update availability.

3. Update `cli/src/commands/search.ts`:
   - Search local registry by slug, name, tags.
   - No cloud search in this phase.

4. Update `cli/src/commands/info.ts`:
   - Show skill details from local registry.
   - Include all cached versions.

5. Ensure no command says "Run `skills login` first" for local operations.

**Acceptance criteria:**
- Brand-new user can run full workflow without login:
  ```bash
  skills init
  skills new my-skill
  skills add my-skill
  skills sync
  skills list
  ```

### Phase 5 — Sync from local registry

**Deliverables:**

1. Refactor `cli/src/commands/sync.ts`:
   - Use version resolution algorithm (lockfile → constraint → latest).
   - Read content from local registry `objects/`.
   - Write to project `.skills/` directory.
   - Update `.skills.lock` with `registry: "local"`.

2. Update `cli/src/lib/lockfile.ts`:
   - Support `registry: "local"` entries.
   - Add helpers for checking if skill is from local registry.

3. Update index generation to work with local registry metadata.

**Acceptance criteria:**
- `skills sync` works fully offline for cached skills.
- Lockfile correctly records `registry: "local"`.
- Missing skills fail with clear message (not silent skip).

### Phase 6 — Cache management commands

**Deliverables:**

New command group `cli/src/commands/cache.ts`:

- `skills cache path` — print registry root path.
- `skills cache list` — list all cached skills with version counts.
- `skills cache import <file> --slug <slug> --version <ver>` — import SKILL.md.
- `skills cache export <slug> --version <ver> --output <dir>` — export skill.
- `skills cache verify` — check integrity of all objects.
- `skills cache clean --unused --older-than <duration>` — remove old versions.

**Acceptance criteria:**
- Can import a skill from any markdown file.
- Can export a skill for sharing.
- Verify detects corrupted objects.
- Clean removes only unused versions.

### Future Phases (deferred)

**Phase 7 — Cloud as cache source:**
- `skills cache pull` — fetch from cloud registry into local cache.
- Requires login, populates local registry from cloud.

**Phase 8 — Update semantics:**
- `skills update` — update to latest cached (offline) or pull + update (online).

**Phase 9 — Multi-registry support:**
- Multiple local registries.
- Registry precedence rules.
- Lockfile tracks which registry each skill came from.

## Test plan

### Unit tests (local registry module)

- `writeObject()` / `readObject()` round-trip.
- `readObject()` with corrupted file returns null and logs warning.
- `putVersion()` creates correct directory structure.
- `getLatestVersion()` returns highest semver.
- `resolveVersion()` with constraints filters correctly.
- Concurrent `putVersion()` calls don't corrupt data (use temp files).

### Integration tests (CLI commands)

- `skills init` creates valid local-only config.
- `skills new` + `skills add` + `skills sync` full workflow.
- `skills sync` with lockfile uses exact versions.
- `skills sync` without lockfile resolves to latest.
- `skills list` shows cached skills.
- `skills search` finds by name and tags.

### Error handling tests

- `skills add <missing>` fails with helpful message.
- `skills sync` with missing cached skill fails clearly.
- Corrupted object detected on sync, not silently used.

### Regression tests

- Existing cloud-only `.skills.yaml` still parses (for future cloud support).
- Old lockfile format still readable.

## UX/error-message guidelines

**Do:**
- "Skill 'X' not found in local cache. Create it with `skills new X` or import with `skills cache import`."
- "No cached version of 'X' satisfies '^2.0.0'. Available versions: 1.2.0, 1.1.0, 1.0.0."
- "Cache integrity error: object abc123 corrupted. Run `skills cache verify` for details."

**Don't:**
- "Run `skills login` first" (never for local operations).
- "Error: unauthorized" (not relevant offline).
- "Network error" (shouldn't happen for local operations).

## Decisions made

1. **No separate `latest` file** — compute from `versions.yaml` using semver.
2. **No "unresolved" skills** — `skills add` fails if skill not cached.
3. **Lockfile uses `registry: "local"`** — clear provenance tracking.
4. **Atomic writes required** — prevents corruption from concurrent access.
5. **Integrity verified on read** — catches corruption early.
6. **Local authoring first** — `skills new` and `skills publish` before cloud sync.

## Open questions (resolved)

- ~~Do we allow "unresolved" skills?~~ **No.** `add` fails if not cached.
- ~~What is the canonical identifier?~~ **Slug.** Registry is provenance metadata.
- ~~Separate `latest` file?~~ **No.** Compute from `versions.yaml`.
