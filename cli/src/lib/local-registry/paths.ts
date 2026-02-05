/**
 * Path utilities for the local registry
 */

import * as path from 'path';
import * as fs from 'fs';
import { getConfigPath } from '../auth.js';

/**
 * Get the root directory of the local registry.
 * Located alongside the CLI config file (e.g., ~/.config/agent-skills/registry/)
 */
export function getRoot(): string {
  const configPath = getConfigPath();
  const configDir = path.dirname(configPath);
  return path.join(configDir, 'registry');
}

/**
 * Get the objects directory (content-addressed storage)
 */
export function getObjectsDir(): string {
  return path.join(getRoot(), 'objects');
}

/**
 * Get the path to a specific object by its sha256 hash
 */
export function getObjectPath(sha256: string): string {
  return path.join(getObjectsDir(), sha256);
}

/**
 * Get the skills directory
 */
export function getSkillsDir(): string {
  return path.join(getRoot(), 'skills');
}

/**
 * Get the directory for a specific skill
 */
export function getSkillDir(slug: string): string {
  return path.join(getSkillsDir(), slug);
}

/**
 * Get the path to a skill's meta.yaml
 */
export function getMetaPath(slug: string): string {
  return path.join(getSkillDir(slug), 'meta.yaml');
}

/**
 * Get the path to a skill's versions.yaml
 */
export function getVersionsPath(slug: string): string {
  return path.join(getSkillDir(slug), 'versions.yaml');
}

/**
 * Ensure a directory exists, creating it recursively if needed
 */
export function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * Ensure the registry structure exists
 */
export function ensureRegistryStructure(): void {
  ensureDir(getObjectsDir());
  ensureDir(getSkillsDir());
}

/**
 * Check if the registry exists
 */
export function registryExists(): boolean {
  return fs.existsSync(getRoot());
}

/**
 * Check if a skill exists in the registry
 */
export function skillExists(slug: string): boolean {
  return fs.existsSync(getMetaPath(slug)) && fs.existsSync(getVersionsPath(slug));
}

/**
 * Check if an object exists
 */
export function objectExists(sha256: string): boolean {
  return fs.existsSync(getObjectPath(sha256));
}
