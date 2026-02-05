/**
 * Skill CRUD operations for the local registry
 */

import * as fs from 'fs';
import * as yaml from 'yaml';
import {
  getSkillDir,
  getSkillsDir,
  getMetaPath,
  ensureDir,
  skillExists as pathSkillExists,
  ensureRegistryStructure,
} from './paths.js';
import { writeObject, readObject, objectExists } from './objects.js';
import {
  addVersionEntry,
  getVersionEntry,
  getLatestVersion,
  getAllVersions,
  getVersionCount,
  resolveVersion as resolveVersionInternal,
  createLocalProvenance,
} from './versions.js';
import type {
  LocalSkillMeta,
  PutVersionParams,
  GetVersionResult,
  SkillSummary,
  SearchResult,
  Provenance,
} from './types.js';

/**
 * Read meta.yaml for a skill
 */
export function readMeta(slug: string): LocalSkillMeta | null {
  const metaPath = getMetaPath(slug);

  if (!fs.existsSync(metaPath)) {
    return null;
  }

  const content = fs.readFileSync(metaPath, 'utf-8');
  return yaml.parse(content) as LocalSkillMeta;
}

/**
 * Write meta.yaml for a skill (atomic)
 */
export function writeMeta(slug: string, meta: LocalSkillMeta): void {
  const metaPath = getMetaPath(slug);
  ensureDir(getSkillDir(slug));

  const content = yaml.stringify(meta, { lineWidth: 0 });

  // Atomic write
  const tempPath = `${metaPath}.tmp.${process.pid}.${Date.now()}`;
  try {
    fs.writeFileSync(tempPath, content, 'utf-8');
    fs.renameSync(tempPath, metaPath);
  } catch (error) {
    try {
      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
      }
    } catch {
      // Ignore cleanup errors
    }
    throw error;
  }
}

/**
 * Put a new skill version into the registry
 *
 * @returns The sha256 hash of the content
 */
export function putVersion(params: PutVersionParams): { sha256: string } {
  const { slug, version, content, meta, provenance, changelog } = params;

  // Ensure registry structure exists
  ensureRegistryStructure();

  // Write content to object store
  const sha256 = writeObject(content);

  // Create or update meta.yaml
  const fullMeta: LocalSkillMeta = {
    slug,
    name: meta.name,
    description: meta.description,
    tags: meta.tags || [],
    compat: meta.compat || [],
    updatedAt: new Date().toISOString(),
  };
  writeMeta(slug, fullMeta);

  // Add version entry
  const fullProvenance: Provenance = {
    kind: provenance?.kind || 'local',
    source: provenance?.source || 'created',
    fetchedAt: provenance?.fetchedAt,
    publishedBy: provenance?.publishedBy,
  };

  addVersionEntry(slug, {
    version,
    sha256,
    provenance: fullProvenance,
    changelog,
  });

  return { sha256 };
}

/**
 * Get a specific version of a skill
 *
 * @returns The skill content and metadata, or null if not found
 */
export function getVersion(slug: string, version: string): GetVersionResult | null {
  const meta = readMeta(slug);
  if (!meta) {
    return null;
  }

  const versionEntry = getVersionEntry(slug, version);
  if (!versionEntry) {
    return null;
  }

  const content = readObject(versionEntry.sha256);
  if (!content) {
    // Object is missing or corrupted
    return null;
  }

  return {
    content,
    meta,
    sha256: versionEntry.sha256,
    version: versionEntry.version,
    provenance: versionEntry.provenance,
  };
}

/**
 * Get the latest version of a skill
 */
export function getLatest(slug: string): GetVersionResult | null {
  const latestVersion = getLatestVersion(slug);
  if (!latestVersion) {
    return null;
  }
  return getVersion(slug, latestVersion);
}

/**
 * Resolve and get a skill version based on constraint
 *
 * @param slug - Skill slug
 * @param constraint - Optional semver constraint
 * @returns The resolved skill, or null if no match
 */
export function resolveAndGet(
  slug: string,
  constraint?: string
): GetVersionResult | null {
  const resolvedVersion = resolveVersionInternal(slug, constraint);
  if (!resolvedVersion) {
    return null;
  }
  return getVersion(slug, resolvedVersion);
}

/**
 * Check if a skill exists in the registry
 */
export function skillExists(slug: string): boolean {
  return pathSkillExists(slug);
}

/**
 * List all skills in the registry
 */
export function listSkills(): SkillSummary[] {
  const skillsDir = getSkillsDir();

  if (!fs.existsSync(skillsDir)) {
    return [];
  }

  const slugs = fs.readdirSync(skillsDir).filter((name) => {
    // Only include directories with both meta.yaml and versions.yaml
    return pathSkillExists(name);
  });

  const summaries: SkillSummary[] = [];

  for (const slug of slugs) {
    const meta = readMeta(slug);
    const latestVersion = getLatestVersion(slug);

    if (meta && latestVersion) {
      summaries.push({
        slug,
        latestVersion,
        meta,
        versionCount: getVersionCount(slug),
      });
    }
  }

  // Sort by slug
  summaries.sort((a, b) => a.slug.localeCompare(b.slug));

  return summaries;
}

/**
 * Search skills by query
 *
 * Searches in: slug, name, tags, description
 */
export function searchSkills(query: string): SearchResult[] {
  const allSkills = listSkills();
  const lowerQuery = query.toLowerCase();
  const results: SearchResult[] = [];

  for (const skill of allSkills) {
    let matchedOn: SearchResult['matchedOn'] | null = null;

    // Check slug (highest priority)
    if (skill.slug.toLowerCase().includes(lowerQuery)) {
      matchedOn = 'slug';
    }
    // Check name
    else if (skill.meta.name.toLowerCase().includes(lowerQuery)) {
      matchedOn = 'name';
    }
    // Check tags
    else if (skill.meta.tags.some((tag) => tag.toLowerCase().includes(lowerQuery))) {
      matchedOn = 'tags';
    }
    // Check description
    else if (skill.meta.description?.toLowerCase().includes(lowerQuery)) {
      matchedOn = 'description';
    }

    if (matchedOn) {
      results.push({
        slug: skill.slug,
        latestVersion: skill.latestVersion,
        meta: skill.meta,
        matchedOn,
      });
    }
  }

  // Sort by match type priority (slug > name > tags > description)
  const priority = { slug: 0, name: 1, tags: 2, description: 3 };
  results.sort((a, b) => priority[a.matchedOn] - priority[b.matchedOn]);

  return results;
}

/**
 * Search skills by tags
 */
export function searchByTags(tags: string[]): SkillSummary[] {
  const allSkills = listSkills();
  const lowerTags = tags.map((t) => t.toLowerCase());

  return allSkills.filter((skill) =>
    skill.meta.tags.some((tag) => lowerTags.includes(tag.toLowerCase()))
  );
}

/**
 * Search skills by compatibility
 */
export function searchByCompat(compat: string[]): SkillSummary[] {
  const allSkills = listSkills();
  const lowerCompat = compat.map((c) => c.toLowerCase());

  return allSkills.filter((skill) =>
    skill.meta.compat.some((c) => lowerCompat.includes(c.toLowerCase()))
  );
}

/**
 * Delete a skill entirely from the registry
 * Note: This does not delete the objects (they may be shared)
 */
export function deleteSkill(slug: string): boolean {
  const skillDir = getSkillDir(slug);

  if (!fs.existsSync(skillDir)) {
    return false;
  }

  fs.rmSync(skillDir, { recursive: true });
  return true;
}

/**
 * Get skill info including all versions
 */
export function getSkillInfo(slug: string): {
  meta: LocalSkillMeta;
  versions: Array<{
    version: string;
    sha256: string;
    createdAt: string;
    provenance: Provenance;
    changelog?: string;
  }>;
} | null {
  const meta = readMeta(slug);
  if (!meta) {
    return null;
  }

  const versions = getAllVersions(slug);

  return {
    meta,
    versions: versions.map((v) => ({
      version: v.version,
      sha256: v.sha256,
      createdAt: v.createdAt,
      provenance: v.provenance,
      changelog: v.changelog,
    })),
  };
}

// Re-export commonly used functions from other modules
export { resolveVersion } from './versions.js';
export { getLatestVersion, getAllVersions, getVersionCount, versionExists } from './versions.js';
export { objectExists, readObject } from './objects.js';
export { ensureRegistryStructure, getRoot } from './paths.js';
