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
 * Upsert a managed section (between start/end markers) in a markdown file.
 * Creates the file if it doesn't exist, appends if no section found, replaces if found.
 */
function upsertManagedSection(
  filePath: string,
  startMarker: string,
  endMarker: string,
  section: string
): void {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, section + '\n', 'utf-8');
    return;
  }

  let content = fs.readFileSync(filePath, 'utf-8');
  const startIdx = content.indexOf(startMarker);
  const endIdx = content.indexOf(endMarker);

  if (startIdx !== -1 && endIdx !== -1) {
    content = content.slice(0, startIdx) + section + content.slice(endIdx + endMarker.length);
  } else {
    if (!content.endsWith('\n')) {
      content += '\n';
    }
    content += '\n' + section + '\n';
  }

  fs.writeFileSync(filePath, content, 'utf-8');
}

function overskillMdSection(installPath: string): string {
  const startMarker = '<!-- overskill-start -->';
  const endMarker = '<!-- overskill-end -->';
  return `${startMarker}
## Overskill Skills

This project uses Overskill to manage reusable AI skills.

Before starting any task, read \`${installPath}/SKILLS_INDEX.md\` to discover available skills. When a skill is relevant to your current task, read its full SKILL.md file and follow its instructions.

To manage skills, use the \`skill\` CLI command (run \`skill --help\` for usage).
${endMarker}`;
}

/**
 * Add or update the Overskill section in CLAUDE.md
 */
export function updateClaudeMd(installPath: string): void {
  const projectRoot = findProjectRoot() || process.cwd();
  const filePath = path.join(projectRoot, 'CLAUDE.md');
  upsertManagedSection(filePath, '<!-- overskill-start -->', '<!-- overskill-end -->', overskillMdSection(installPath));
}

/**
 * Add or update the Overskill section in AGENTS.md
 */
export function updateAgentsMd(installPath: string): void {
  const projectRoot = findProjectRoot() || process.cwd();
  const filePath = path.join(projectRoot, 'AGENTS.md');
  upsertManagedSection(filePath, '<!-- overskill-start -->', '<!-- overskill-end -->', overskillMdSection(installPath));
}

/**
 * Add or update the Overskill rule in .cursor/rules/
 */
export function updateCursorRules(installPath: string): void {
  const projectRoot = findProjectRoot() || process.cwd();
  const rulesDir = path.join(projectRoot, '.cursor', 'rules');
  ensureDir(rulesDir);

  const rulePath = path.join(rulesDir, 'overskill.mdc');
  const content = `---
description: Discover and apply Overskill skills for this project
globs:
alwaysApply: true
---

## Overskill Skills

This project uses Overskill to manage reusable AI skills.

Before starting any task, read \`${installPath}/SKILLS_INDEX.md\` to discover available skills. When a skill is relevant to your current task, read its full SKILL.md file and follow its instructions.

To manage skills, use the \`skill\` CLI command (run \`skill --help\` for usage).
`;

  fs.writeFileSync(rulePath, content, 'utf-8');
}

/**
 * Check if a path is a symlink
 */
function isSymlink(p: string): boolean {
  try {
    return fs.lstatSync(p).isSymbolicLink();
  } catch {
    return false;
  }
}

/**
 * Sync skills as directory symlinks in .claude/skills/ for native agent loading.
 * This allows agents like Claude Code to auto-load Overskill skills
 * the same way they load skills from .claude/skills/<name>/SKILL.md.
 */
export function syncClaudeNativeSkills(syncedSlugs: string[]): void {
  const projectRoot = findProjectRoot() || process.cwd();
  const installPath = getInstallPath();
  const claudeSkillsDir = path.join(projectRoot, '.claude', 'skills');

  ensureDir(claudeSkillsDir);

  // Clean up stale Overskill-managed symlinks
  const entries = fs.readdirSync(claudeSkillsDir);
  for (const entry of entries) {
    const fullPath = path.join(claudeSkillsDir, entry);
    if (!isSymlink(fullPath)) continue;

    try {
      const target = fs.readlinkSync(fullPath);
      const resolvedTarget = path.resolve(claudeSkillsDir, target);
      // Check if this symlink points into our install path
      if (resolvedTarget.startsWith(installPath + path.sep) || resolvedTarget.startsWith(installPath + '/')) {
        if (!syncedSlugs.includes(entry)) {
          fs.unlinkSync(fullPath);
        }
      }
    } catch {
      // Skip entries we can't read
    }
  }

  // Create/update directory symlinks for current skills
  for (const slug of syncedSlugs) {
    const skillDir = path.join(installPath, slug);
    const linkPath = path.join(claudeSkillsDir, slug);

    if (!fs.existsSync(path.join(skillDir, 'SKILL.md'))) continue;

    // Don't overwrite user-created regular directories
    if (fs.existsSync(linkPath) && !isSymlink(linkPath)) {
      continue;
    }

    // Remove existing symlink if present
    if (isSymlink(linkPath)) {
      fs.unlinkSync(linkPath);
    }

    // Create relative symlink to skill directory
    const relativePath = path.relative(claudeSkillsDir, skillDir);
    fs.symlinkSync(relativePath, linkPath);
  }
}

/**
 * Remove a single skill's directory symlink from .claude/skills/
 */
export function removeClaudeNativeSkill(slug: string): void {
  const projectRoot = findProjectRoot() || process.cwd();
  const linkPath = path.join(projectRoot, '.claude', 'skills', slug);

  if (isSymlink(linkPath)) {
    fs.unlinkSync(linkPath);
  }
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
