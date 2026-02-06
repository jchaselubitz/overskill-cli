/**
 * Version management for skills in the local registry
 */

import * as fs from 'fs';
import * as yaml from 'yaml';
import { getVersionsPath, ensureDir, getSkillDir } from './paths.js';
import { sortVersionsDesc, maxSatisfying, isValidVersion } from '../semver.js';
import type { VersionEntry, VersionsFile, Provenance } from './types.js';

/**
 * Read versions.yaml for a skill
 */
export function readVersionsFile(slug: string): VersionsFile | null {
  const versionsPath = getVersionsPath(slug);

  if (!fs.existsSync(versionsPath)) {
    return null;
  }

  const content = fs.readFileSync(versionsPath, 'utf-8');
  return yaml.parse(content) as VersionsFile;
}

/**
 * Write versions.yaml for a skill (atomic)
 */
export function writeVersionsFile(slug: string, data: VersionsFile): void {
  const versionsPath = getVersionsPath(slug);
  ensureDir(getSkillDir(slug));

  const content = yaml.stringify(data, { lineWidth: 0 });

  // Atomic write
  const tempPath = `${versionsPath}.tmp.${process.pid}.${Date.now()}`;
  try {
    fs.writeFileSync(tempPath, content, 'utf-8');
    fs.renameSync(tempPath, versionsPath);
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
 * Get all versions for a skill
 */
export function getAllVersions(slug: string): VersionEntry[] {
  const file = readVersionsFile(slug);
  return file?.versions || [];
}

/**
 * Get all version strings for a skill (sorted descending)
 */
export function getVersionStrings(slug: string): string[] {
  const entries = getAllVersions(slug);
  const versions = entries.map((e) => e.version);
  return sortVersionsDesc(versions);
}

/**
 * Get the latest version for a skill (highest semver)
 */
export function getLatestVersion(slug: string): string | null {
  const versions = getVersionStrings(slug);
  return versions[0] || null;
}

/**
 * Get a specific version entry
 */
export function getVersionEntry(slug: string, version: string): VersionEntry | null {
  const entries = getAllVersions(slug);
  return entries.find((e) => e.version === version) || null;
}

/**
 * Resolve a version based on a constraint
 *
 * @param slug - Skill slug
 * @param constraint - Optional semver constraint (e.g., "^1.0.0", ">=2.0.0")
 * @returns The resolved version, or null if no match
 */
export function resolveVersion(slug: string, constraint?: string): string | null {
  const versions = getVersionStrings(slug);

  if (versions.length === 0) {
    return null;
  }

  if (!constraint) {
    // No constraint = latest version
    return versions[0];
  }

  // Use semver to find the best match
  return maxSatisfying(versions, constraint);
}

/**
 * Add a new version entry
 */
export function addVersionEntry(
  slug: string,
  entry: Omit<VersionEntry, 'createdAt'> & { createdAt?: string }
): void {
  const file = readVersionsFile(slug) || { versions: [] };

  // Check if version already exists
  const existingIndex = file.versions.findIndex((v) => v.version === entry.version);

  const fullEntry: VersionEntry = {
    ...entry,
    createdAt: entry.createdAt || new Date().toISOString(),
  };

  if (existingIndex >= 0) {
    // Update existing version
    file.versions[existingIndex] = fullEntry;
  } else {
    // Add new version
    file.versions.push(fullEntry);
  }

  // Sort versions descending (newest first)
  file.versions.sort((a, b) => {
    const aValid = isValidVersion(a.version);
    const bValid = isValidVersion(b.version);
    if (!aValid && !bValid) return 0;
    if (!aValid) return 1;
    if (!bValid) return -1;
    return sortVersionsDesc([a.version, b.version])[0] === a.version ? -1 : 1;
  });

  writeVersionsFile(slug, file);
}

/**
 * Remove a version entry
 *
 * @returns true if removed, false if didn't exist
 */
export function removeVersionEntry(slug: string, version: string): boolean {
  const file = readVersionsFile(slug);
  if (!file) return false;

  const initialLength = file.versions.length;
  file.versions = file.versions.filter((v) => v.version !== version);

  if (file.versions.length < initialLength) {
    writeVersionsFile(slug, file);
    return true;
  }

  return false;
}

/**
 * Check if a specific version exists
 */
export function versionExists(slug: string, version: string): boolean {
  return getVersionEntry(slug, version) !== null;
}

/**
 * Get version count for a skill
 */
export function getVersionCount(slug: string): number {
  return getAllVersions(slug).length;
}

/**
 * Create default provenance for a locally created skill
 */
export function createLocalProvenance(source: string = 'created'): Provenance {
  return {
    kind: 'local',
    source,
  };
}
