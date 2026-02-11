/**
 * Local Registry Module
 *
 * Provides content-addressed storage for skills with:
 * - Deduplication via SHA256 hashing
 * - Integrity verification on read
 * - Atomic writes to prevent corruption
 */

// Re-export types
export type {
  LocalSkillMeta,
  PutSkillParams,
  GetSkillResult,
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
  getSkillFilePath as getSkillFilePathFromPaths,
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

// Re-export skill operations (main API)
export {
  readMeta,
  writeMeta,
  putSkill,
  getSkill,
  getSkillFilePath,
  skillExists,
  listSkills,
  searchSkills,
  searchByTags,
  searchByCompat,
  deleteSkill,
  getSkillInfo,
} from './skills.js';
