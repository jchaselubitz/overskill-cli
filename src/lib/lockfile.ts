import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';
import { findProjectRoot } from './config.js';
import type { SkillsLock, LockedSkill } from '../types.js';

/**
 * Get the path to .skills.lock
 */
export function getLockfilePath(): string {
  const projectRoot = findProjectRoot() || process.cwd();
  return path.join(projectRoot, '.skills.lock');
}

/**
 * Check if lockfile exists
 */
export function lockfileExists(): boolean {
  return fs.existsSync(getLockfilePath());
}

/**
 * Read .skills.lock
 */
export function readLockfile(): SkillsLock | null {
  const lockfilePath = getLockfilePath();

  if (!fs.existsSync(lockfilePath)) {
    return null;
  }

  const content = fs.readFileSync(lockfilePath, 'utf-8');
  return yaml.parse(content) as SkillsLock;
}

/**
 * Write .skills.lock
 */
export function writeLockfile(lock: SkillsLock): void {
  const lockfilePath = getLockfilePath();
  const content = `# .skills.lock — auto-generated, commit to repo\n${yaml.stringify(lock, {
    lineWidth: 0,
  })}`;
  fs.writeFileSync(lockfilePath, content, 'utf-8');
}

/**
 * Create a new lockfile
 */
export function createLockfile(skills: LockedSkill[]): SkillsLock {
  return {
    locked_at: new Date().toISOString(),
    skills,
  };
}

/**
 * Get a locked skill by slug
 */
export function getLockedSkill(slug: string): LockedSkill | undefined {
  const lock = readLockfile();
  if (!lock) return undefined;
  return lock.skills.find(s => s.slug === slug);
}

/**
 * Update or add a skill in the lockfile
 */
export function updateLockedSkill(skill: LockedSkill): void {
  let lock = readLockfile();

  if (!lock) {
    lock = createLockfile([skill]);
  } else {
    const existingIndex = lock.skills.findIndex(
      s => s.slug === skill.slug
    );

    if (existingIndex >= 0) {
      lock.skills[existingIndex] = skill;
    } else {
      lock.skills.push(skill);
    }

    lock.locked_at = new Date().toISOString();
  }

  writeLockfile(lock);
}

/**
 * Remove a skill from the lockfile
 */
export function removeLockedSkill(slug: string): void {
  const lock = readLockfile();
  if (!lock) return;

  lock.skills = lock.skills.filter(s => s.slug !== slug);

  lock.locked_at = new Date().toISOString();
  writeLockfile(lock);
}

/**
 * Check if a skill has changed (compare hash)
 */
export function hasSkillChanged(slug: string, newHash: string): boolean {
  const locked = getLockedSkill(slug);
  if (!locked) return true;
  return locked.sha256 !== newHash;
}
