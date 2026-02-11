/**
 * Types for the local registry module
 */

/**
 * Skill metadata stored in meta.yaml
 */
export interface LocalSkillMeta {
  slug: string;
  name: string;
  description?: string;
  tags: string[];
  compat: string[];
  sha256: string;
  updatedAt: string; // ISO timestamp
}

/**
 * Parameters for putting a skill into the registry
 */
export interface PutSkillParams {
  slug: string;
  content: string;
  meta: Omit<LocalSkillMeta, 'slug' | 'updatedAt' | 'sha256'>;
}

/**
 * Result of getting a skill
 */
export interface GetSkillResult {
  content: string;
  meta: LocalSkillMeta;
  sha256: string;
}

/**
 * Summary of a skill in the registry
 */
export interface SkillSummary {
  slug: string;
  meta: LocalSkillMeta;
}

/**
 * Search result
 */
export interface SearchResult {
  slug: string;
  meta: LocalSkillMeta;
  matchedOn: 'slug' | 'name' | 'tags' | 'description';
}
