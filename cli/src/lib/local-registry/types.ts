/**
 * Types for the local registry module
 */

/**
 * Provenance information - tracks where a skill version came from
 */
export interface Provenance {
  kind: 'local' | 'cloud';
  source: string; // 'imported', 'created', or registry slug if from cloud
  fetchedAt?: string; // ISO timestamp
  publishedBy?: string; // username if known
}

/**
 * A single version entry in versions.yaml
 */
export interface VersionEntry {
  version: string;
  sha256: string;
  createdAt: string; // ISO timestamp
  provenance: Provenance;
  changelog?: string;
}

/**
 * The structure of versions.yaml
 */
export interface VersionsFile {
  versions: VersionEntry[];
}

/**
 * Skill metadata stored in meta.yaml
 */
export interface LocalSkillMeta {
  slug: string;
  name: string;
  description?: string;
  tags: string[];
  compat: string[];
  updatedAt: string; // ISO timestamp
}

/**
 * Parameters for putting a new version
 */
export interface PutVersionParams {
  slug: string;
  version: string;
  content: string;
  meta: Omit<LocalSkillMeta, 'slug' | 'updatedAt'>;
  provenance?: Partial<Provenance>;
  changelog?: string;
}

/**
 * Result of getting a version
 */
export interface GetVersionResult {
  content: string;
  meta: LocalSkillMeta;
  sha256: string;
  version: string;
  provenance: Provenance;
}

/**
 * Summary of a skill in the registry
 */
export interface SkillSummary {
  slug: string;
  latestVersion: string;
  meta: LocalSkillMeta;
  versionCount: number;
}

/**
 * Search result
 */
export interface SearchResult {
  slug: string;
  latestVersion: string;
  meta: LocalSkillMeta;
  matchedOn: 'slug' | 'name' | 'tags' | 'description';
}
