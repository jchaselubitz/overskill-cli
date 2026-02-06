/**
 * Local Registry Module
 *
 * Provides content-addressed storage for skills with:
 * - Deduplication via SHA256 hashing
 * - Integrity verification on read
 * - Atomic writes to prevent corruption
 * - Semver-based version resolution
 */

// Re-export types
export type {
  Provenance,
  VersionEntry,
  VersionsFile,
  LocalSkillMeta,
  PutVersionParams,
  GetVersionResult,
  SkillSummary,
  SearchResult,
} from './types.js';

// Re-export path utilities
export {
  getRoot,
  getObjectsDir,
  getObjectPath,
  getSkillsDir,
  getSkillDir,
  getMetaPath,
  getVersionsPath,
  ensureDir,
  ensureRegistryStructure,
  registryExists,
  skillExists as pathExists,
  objectExists as objectPathExists,
} from './paths.js';

// Re-export object operations
export {
  computeHash,
  writeObject,
  readObject,
  objectExists,
  deleteObject,
  listObjects,
  verifyAllObjects,
  cleanupTempFiles,
} from './objects.js';

// Re-export version operations
export {
  readVersionsFile,
  writeVersionsFile,
  getAllVersions,
  getVersionStrings,
  getLatestVersion,
  getVersionEntry,
  resolveVersion,
  addVersionEntry,
  removeVersionEntry,
  versionExists,
  getVersionCount,
  createLocalProvenance,
} from './versions.js';

// Re-export skill operations (main API)
export {
  readMeta,
  writeMeta,
  putVersion,
  getVersion,
  getLatest,
  resolveAndGet,
  skillExists,
  listSkills,
  searchSkills,
  searchByTags,
  searchByCompat,
  deleteSkill,
  getSkillInfo,
} from './skills.js';
