// Skills config types (.skills.yaml)
export interface SkillsConfig {
  sources: SkillSource[];
  install_path: string;
  skills: SkillEntry[];
}

export interface SkillSource {
  name: string;
  registry: string;
  url: string;
}

export interface SkillEntry {
  slug: string;
  source: string;
  version?: string;
}

// Lock file types (.skills.lock)
export interface SkillsLock {
  locked_at: string;
  skills: LockedSkill[];
}

export interface LockedSkill {
  slug: string;
  registry: string;
  version: string;
  sha256: string;
}

// Skill metadata (meta.yaml in each skill folder)
export interface SkillMeta {
  slug: string;
  registry: string;
  version: string;
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
  registry: string;
  slug: string;
  version: string;
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

// CLI config types (stored in ~/.config/agent-skills/)
export interface CLIConfig {
  api_url?: string;
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
