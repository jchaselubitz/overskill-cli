import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';
import { getInstallPath, findProjectRoot } from './config.js';
import type { SkillMeta, SyncSkillResponse } from '../types.js';

/**
 * Ensure a directory exists
 */
export function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * Get the skill directory path
 */
export function getSkillDir(slug: string): string {
  return path.join(getInstallPath(), slug);
}

/**
 * Get the system skill directory path
 */
export function getSystemDir(): string {
  return path.join(getInstallPath(), '_system');
}

/**
 * Write a skill to disk
 */
export function writeSkill(
  skill: SyncSkillResponse,
  meta: Omit<SkillMeta, 'sha256'>
): void {
  const skillDir = getSkillDir(skill.slug);
  ensureDir(skillDir);

  // Write SKILL.md
  const skillPath = path.join(skillDir, 'SKILL.md');
  fs.writeFileSync(skillPath, skill.content, 'utf-8');

  // Write meta.yaml
  const metaPath = path.join(skillDir, 'meta.yaml');
  const fullMeta: SkillMeta = {
    ...meta,
    sha256: skill.sha256,
  };
  fs.writeFileSync(metaPath, yaml.stringify(fullMeta), 'utf-8');
}

/**
 * Read a skill's content from disk
 */
export function readSkillContent(slug: string): string | null {
  const skillPath = path.join(getSkillDir(slug), 'SKILL.md');
  if (!fs.existsSync(skillPath)) {
    return null;
  }
  return fs.readFileSync(skillPath, 'utf-8');
}

/**
 * Read a skill's metadata from disk
 */
export function readSkillMeta(slug: string): SkillMeta | null {
  const metaPath = path.join(getSkillDir(slug), 'meta.yaml');
  if (!fs.existsSync(metaPath)) {
    return null;
  }
  const content = fs.readFileSync(metaPath, 'utf-8');
  return yaml.parse(content) as SkillMeta;
}

/**
 * Delete a skill from disk
 */
export function deleteSkill(slug: string): void {
  const skillDir = getSkillDir(slug);
  if (fs.existsSync(skillDir)) {
    fs.rmSync(skillDir, { recursive: true });
  }
}

/**
 * Check if a skill exists on disk
 */
export function skillExists(slug: string): boolean {
  const skillPath = path.join(getSkillDir(slug), 'SKILL.md');
  return fs.existsSync(skillPath);
}

/**
 * List all skills on disk
 */
export function listLocalSkills(): string[] {
  const installPath = getInstallPath();
  if (!fs.existsSync(installPath)) {
    return [];
  }

  return fs.readdirSync(installPath)
    .filter(name => {
      // Skip system folder and index
      if (name === '_system' || name === 'SKILLS_INDEX.md') {
        return false;
      }
      const skillPath = path.join(installPath, name, 'SKILL.md');
      return fs.existsSync(skillPath);
    });
}

/**
 * Check if a skill is modified locally
 */
export function isSkillModified(slug: string): boolean {
  const markerPath = path.join(getSkillDir(slug), '.modified');
  return fs.existsSync(markerPath);
}

/**
 * Mark a skill as modified
 */
export function markSkillModified(slug: string): void {
  const markerPath = path.join(getSkillDir(slug), '.modified');
  fs.writeFileSync(markerPath, new Date().toISOString(), 'utf-8');
}

/**
 * Unmark a skill as modified
 */
export function unmarkSkillModified(slug: string): void {
  const markerPath = path.join(getSkillDir(slug), '.modified');
  if (fs.existsSync(markerPath)) {
    fs.unlinkSync(markerPath);
  }
}

/**
 * Write the system (meta) skill
 */
export function writeSystemSkill(content: string): void {
  const systemDir = getSystemDir();
  ensureDir(systemDir);

  const skillPath = path.join(systemDir, 'SKILL.md');
  fs.writeFileSync(skillPath, content, 'utf-8');
}

/**
 * Add .skills/ to .gitignore if not present
 */
export function updateGitignore(installPath: string): void {
  const projectRoot = findProjectRoot() || process.cwd();
  const gitignorePath = path.join(projectRoot, '.gitignore');

  const entry = `${installPath}/`;
  let content = '';

  if (fs.existsSync(gitignorePath)) {
    content = fs.readFileSync(gitignorePath, 'utf-8');
    if (content.includes(entry) || content.includes(installPath)) {
      return; // Already present
    }
    if (!content.endsWith('\n')) {
      content += '\n';
    }
  }

  content += `\n# Skills (synced files, not committed)\n${entry}\n`;
  fs.writeFileSync(gitignorePath, content, 'utf-8');
}

/**
 * Compute SHA256 hash of content
 */
export async function computeHash(content: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
