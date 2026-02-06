/**
 * Content-addressed object storage for skill content
 *
 * Objects are stored by their SHA256 hash, providing:
 * - Deduplication across versions
 * - Integrity verification on read
 * - Atomic writes using temp file + rename
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { getObjectsDir, getObjectPath, ensureDir } from './paths.js';

/**
 * Compute SHA256 hash of content
 */
export function computeHash(content: string): string {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

/**
 * Write content to the object store.
 * Uses atomic write (temp file + rename) to prevent corruption.
 *
 * @returns The SHA256 hash of the content
 */
export function writeObject(content: string): string {
  const sha256 = computeHash(content);
  const objectPath = getObjectPath(sha256);

  // If object already exists (same content), no need to write
  if (fs.existsSync(objectPath)) {
    return sha256;
  }

  // Ensure objects directory exists
  ensureDir(getObjectsDir());

  // Atomic write: write to temp file, then rename
  const tempPath = `${objectPath}.tmp.${process.pid}.${Date.now()}`;
  try {
    fs.writeFileSync(tempPath, content, 'utf-8');
    fs.renameSync(tempPath, objectPath);
  } catch (error) {
    // Clean up temp file on error
    try {
      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
      }
    } catch {
      // Ignore cleanup errors
    }
    throw error;
  }

  return sha256;
}

/**
 * Read content from the object store.
 * Verifies integrity by checking the hash matches the filename.
 *
 * @returns The content, or null if object doesn't exist or is corrupted
 */
export function readObject(sha256: string): string | null {
  const objectPath = getObjectPath(sha256);

  if (!fs.existsSync(objectPath)) {
    return null;
  }

  const content = fs.readFileSync(objectPath, 'utf-8');

  // Verify integrity
  const actualHash = computeHash(content);
  if (actualHash !== sha256) {
    console.error(
      `Cache integrity error: object ${sha256} corrupted (actual hash: ${actualHash}). ` +
        `Run 'skills cache verify' for details.`
    );
    return null;
  }

  return content;
}

/**
 * Check if an object exists in the store
 */
export function objectExists(sha256: string): boolean {
  return fs.existsSync(getObjectPath(sha256));
}

/**
 * Delete an object from the store
 *
 * @returns true if deleted, false if didn't exist
 */
export function deleteObject(sha256: string): boolean {
  const objectPath = getObjectPath(sha256);

  if (!fs.existsSync(objectPath)) {
    return false;
  }

  fs.unlinkSync(objectPath);
  return true;
}

/**
 * List all objects in the store
 */
export function listObjects(): string[] {
  const objectsDir = getObjectsDir();

  if (!fs.existsSync(objectsDir)) {
    return [];
  }

  return fs.readdirSync(objectsDir).filter((name) => {
    // Filter out temp files
    return !name.includes('.tmp.');
  });
}

/**
 * Verify integrity of all objects
 *
 * @returns Array of corrupted object hashes
 */
export function verifyAllObjects(): string[] {
  const corrupted: string[] = [];

  for (const sha256 of listObjects()) {
    const objectPath = getObjectPath(sha256);
    const content = fs.readFileSync(objectPath, 'utf-8');
    const actualHash = computeHash(content);

    if (actualHash !== sha256) {
      corrupted.push(sha256);
    }
  }

  return corrupted;
}

/**
 * Clean up orphaned temp files
 */
export function cleanupTempFiles(): number {
  const objectsDir = getObjectsDir();

  if (!fs.existsSync(objectsDir)) {
    return 0;
  }

  let cleaned = 0;
  const files = fs.readdirSync(objectsDir);

  for (const name of files) {
    if (name.includes('.tmp.')) {
      const filePath = path.join(objectsDir, name);
      // Only delete temp files older than 1 hour
      const stats = fs.statSync(filePath);
      const age = Date.now() - stats.mtimeMs;
      if (age > 60 * 60 * 1000) {
        fs.unlinkSync(filePath);
        cleaned++;
      }
    }
  }

  return cleaned;
}
