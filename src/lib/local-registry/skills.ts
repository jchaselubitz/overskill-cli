/**
 * Skill CRUD operations for the local registry
 */

import * as fs from 'fs';
import * as yaml from 'yaml';
import {
  getSkillDir,
  getSkillsDir,
  getMetaPath,
  getSkillFilePath,
  ensureDir,
  skillExists as pathSkillExists,
  ensureRegistryStructure,
} from './paths.js';
import { writeObject, readObject } from './objects.js';
import type {
  LocalSkillMeta,
  PutSkillParams,
  GetSkillResult,
  SkillSummary,
  SearchResult,
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
  const meta = yaml.parse(content) as LocalSkillMeta;

  // Migration: if meta doesn't have sha256, try to read from legacy versions.yaml
  if (!meta.sha256) {
    const versionsPath = getSkillDir(slug) + '/versions.yaml';
    if (fs.existsSync(versionsPath)) {
      try {
        const versionsContent = fs.readFileSync(versionsPath, 'utf-8');
        const versionsData = yaml.parse(versionsContent) as { versions?: Array<{ sha256: string }> };
        if (versionsData?.versions?.[0]?.sha256) {
          meta.sha256 = versionsData.versions[0].sha256;
          // Save migrated meta
          writeMeta(slug, meta);
        }
      } catch {
        // Ignore migration errors
      }
    }
  }

  return meta;
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
 * Write a readable SKILL.md working copy alongside meta.yaml
 */
function writeSkillFile(slug: string, content: string): void {
  const skillFilePath = getSkillFilePath(slug);
  ensureDir(getSkillDir(slug));
  fs.writeFileSync(skillFilePath, content, 'utf-8');
}

/**
 * Put a skill into the registry (create or update)
 *
 * @returns The sha256 hash of the content
 */
export function putSkill(params: PutSkillParams): { sha256: string } {
  const { slug, content, meta } = params;

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
    sha256,
    updatedAt: new Date().toISOString(),
  };
  writeMeta(slug, fullMeta);

  // Write readable SKILL.md working copy
  writeSkillFile(slug, content);

  return { sha256 };
}

/**
 * Get a skill from the registry
 *
 * @returns The skill content and metadata, or null if not found
 */
export function getSkill(slug: string): GetSkillResult | null {
  const meta = readMeta(slug);
  if (!meta || !meta.sha256) {
    return null;
  }

  const content = readObject(meta.sha256);
  if (!content) {
    // Object is missing or corrupted, try the SKILL.md working copy
    const skillFilePath = getSkillFilePath(slug);
    if (fs.existsSync(skillFilePath)) {
      const fallbackContent = fs.readFileSync(skillFilePath, 'utf-8');
      return {
        content: fallbackContent,
        meta,
        sha256: meta.sha256,
      };
    }
    return null;
  }

  return {
    content,
    meta,
    sha256: meta.sha256,
  };
}

/**
 * Check if a skill exists in the registry
 */
export function skillExists(slug: string): boolean {
  return pathSkillExists(slug);
}

/**
 * Get the path to a skill's SKILL.md in the registry
 */
export { getSkillFilePath } from './paths.js';

/**
 * List all skills in the registry
 */
export function listSkills(): SkillSummary[] {
  const skillsDir = getSkillsDir();

  if (!fs.existsSync(skillsDir)) {
    return [];
  }

  const slugs = fs.readdirSync(skillsDir).filter((name) => {
    return pathSkillExists(name);
  });

  const summaries: SkillSummary[] = [];

  for (const slug of slugs) {
    const meta = readMeta(slug);

    if (meta) {
      summaries.push({
        slug,
        meta,
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

    if (skill.slug.toLowerCase().includes(lowerQuery)) {
      matchedOn = 'slug';
    } else if (skill.meta.name.toLowerCase().includes(lowerQuery)) {
      matchedOn = 'name';
    } else if (skill.meta.tags.some((tag) => tag.toLowerCase().includes(lowerQuery))) {
      matchedOn = 'tags';
    } else if (skill.meta.description?.toLowerCase().includes(lowerQuery)) {
      matchedOn = 'description';
    }

    if (matchedOn) {
      results.push({
        slug: skill.slug,
        meta: skill.meta,
        matchedOn,
      });
    }
  }

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
 * Get skill info
 */
export function getSkillInfo(slug: string): {
  meta: LocalSkillMeta;
} | null {
  const meta = readMeta(slug);
  if (!meta) {
    return null;
  }

  return { meta };
}
