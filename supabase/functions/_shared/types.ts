// Database types

export type RegistryType = "personal" | "organization";
export type PublishPolicy = "open" | "require_approval";
export type MemberRole = "member" | "contributor" | "admin";
export type InvitationStatus = "pending" | "accepted" | "declined" | "expired";

export interface Profile {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface Registry {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  type: RegistryType;
  publish_policy: PublishPolicy;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface RegistryMember {
  id: string;
  registry_id: string;
  user_id: string;
  role: MemberRole;
  created_at: string;
  updated_at: string;
}

export interface Skill {
  id: string;
  registry_id: string;
  slug: string;
  name: string;
  description: string | null;
  tags: string[];
  compat: string[];
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface SkillVersion {
  id: string;
  skill_id: string;
  version: string;
  content: string;
  changelog: string | null;
  published_by: string;
  is_latest: boolean;
  created_at: string;
}

export interface SkillMaintainer {
  id: string;
  skill_id: string;
  user_id: string;
  created_at: string;
}

export interface Invitation {
  id: string;
  registry_id: string;
  email: string;
  role: MemberRole;
  invited_by: string;
  status: InvitationStatus;
  created_at: string;
  expires_at: string;
}

export interface OAuthClient {
  id: string;
  secret: string;
  name: string;
  redirect_uris: string[];
  created_at: string;
}

export interface OAuthCode {
  code: string;
  client_id: string;
  user_id: string;
  redirect_uri: string;
  scope: string | null;
  expires_at: string;
  used: boolean;
}

export interface SkillIssue {
  id: string;
  skill_id: string;
  reported_by: string | null;
  issue: string;
  context: string | null;
  created_at: string;
}

// API request/response types

export interface RegisterRequest {
  email: string;
  password: string;
  username: string;
  display_name?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface CreateRegistryRequest {
  slug: string;
  name: string;
  description?: string;
  type?: RegistryType;
  publish_policy?: PublishPolicy;
}

export interface CreateSkillRequest {
  slug: string;
  name: string;
  description?: string;
  tags?: string[];
  compat?: string[];
  content: string;
  version?: string;
}

export interface UpdateSkillRequest {
  name?: string;
  description?: string;
  tags?: string[];
  compat?: string[];
}

export interface CreateVersionRequest {
  version: string;
  content: string;
  changelog?: string;
}

export interface InviteMemberRequest {
  email: string;
  role: MemberRole;
}

export interface UpdateMemberRequest {
  role: MemberRole;
}

export interface SyncRequest {
  skills: Array<{
    registry: string;
    slug: string;
    version?: string;
  }>;
}

export interface SyncResponse {
  skills: Array<{
    registry: string;
    slug: string;
    version: string;
    content: string;
    sha256: string;
  }>;
  errors: Array<{
    registry: string;
    slug: string;
    error: string;
  }>;
}

// Validation helpers

export function isValidSlug(slug: string): boolean {
  return /^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/.test(slug);
}

export function isValidUsername(username: string): boolean {
  return /^[a-z0-9][a-z0-9-]{1,37}[a-z0-9]$|^[a-z0-9]{1,2}$/.test(username) &&
         username.length >= 3 &&
         username.length <= 39 &&
         !username.startsWith('-') &&
         !username.endsWith('-');
}

export function isValidSemver(version: string): boolean {
  return /^\d+\.\d+\.\d+(-[a-zA-Z0-9.-]+)?(\+[a-zA-Z0-9.-]+)?$/.test(version);
}
