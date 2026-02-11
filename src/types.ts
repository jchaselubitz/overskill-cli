// Skills config types (.skills.yaml)
export interface SkillsConfig {
  sources: SkillSource[];
  install_path: string;
  skills: SkillEntry[];
}

// Tagged union for source types
export type SkillSource = LocalSource | CloudSource;

export interface LocalSource {
  name: string;
  kind: 'local';
}

export interface CloudSource {
  name: string;
  kind: 'cloud';
  registry: string;
  url: string;
}

// Legacy source format (for backward compatibility)
export interface LegacySource {
  name: string;
  registry: string;
  url: string;
}

// Type guards for sources
export function isLocalSource(source: SkillSource): source is LocalSource {
  return source.kind === 'local';
}

export function isCloudSource(source: SkillSource): source is CloudSource {
  return source.kind === 'cloud';
}

export interface SkillEntry {
  slug: string;
  source?: string; // Optional, defaults to first local source
}

// Lock file types (.skills.lock)
export interface SkillsLock {
  locked_at: string;
  skills: LockedSkill[];
}

export interface LockedSkill {
  slug: string;
  sha256: string;
}

// Skill metadata (meta.yaml in each skill folder)
export interface SkillMeta {
  slug: string;
  name: string;
  description?: string;
  tags: string[];
  compat: string[];
  sha256: string;
}

// API response types
export interface AuthResponse {
  user: {
    id: string;
    email: string;
    username: string;
  };
  session: {
    access_token: string;
    refresh_token: string;
  };
}

export interface RegistryResponse {
  id: string;
  slug: string;
  name: string;
  description?: string;
  type: 'personal' | 'organization';
  publish_policy: 'open' | 'require_approval';
  role?: 'member' | 'contributor' | 'admin';
  created_at: string;
  updated_at: string;
}

export interface SkillResponse {
  slug: string;
  name: string;
  description?: string;
  tags: string[];
  compat: string[];
  version: string;
  content?: string;
  created_by: string;
  maintainers?: string[];
  updated_at: string;
}

export interface SkillVersionResponse {
  version: string;
  content?: string;
  changelog?: string;
  is_latest: boolean;
  published_by: string;
  created_at: string;
}

export interface SyncSkillResponse {
  slug: string;
  content: string;
  sha256: string;
}

export interface SyncResponse {
  skills: SyncSkillResponse[];
  errors: Array<{
    registry: string;
    slug: string;
    error: string;
  }>;
}

export interface SearchResult {
  registry: string;
  slug: string;
  name: string;
  description?: string;
  tags: string[];
  compat: string[];
  version: string;
}

export interface MemberResponse {
  id: string;
  username: string;
  display_name?: string;
  avatar_url?: string;
  role: 'member' | 'contributor' | 'admin';
  joined_at: string;
}

export interface InvitationResponse {
  id: string;
  registry_slug: string;
  registry_name: string;
  role: 'member' | 'contributor' | 'admin';
  invited_by: string;
  expires_at: string;
}

// CLI config types (stored in ~/.overskill/)
export interface CLIConfig {
  api_url?: string;
  api_key?: string;
  web_app_url?: string;
  access_token?: string;
  refresh_token?: string;
  expires_at?: number;
  editor?: string;
  install_path?: string;
}

// API error type
export interface APIError {
  error: {
    code: string;
    message: string;
  };
}
