import { ofetch, FetchError } from 'ofetch';
import * as auth from './auth.js';
import type {
  AuthResponse,
  RegistryResponse,
  SkillResponse,
  SkillVersionResponse,
  SyncResponse,
  SearchResult,
  MemberResponse,
  InvitationResponse,
  APIError,
} from '../types.js';

/**
 * Get the base API URL
 */
function getBaseUrl(): string {
  const url = auth.getApiUrl();
  if (!url) {
    throw new Error('API URL not configured. Run `skills config api_url <url>` first.');
  }
  return url;
}

/**
 * Get the web app URL for token refresh
 */
function getWebAppUrl(): string {
  const url = auth.getWebAppUrl();
  // Fall back to default local development URL
  return url || 'http://localhost:3000';
}

/**
 * Get authorization headers
 */
async function getAuthHeaders(): Promise<Record<string, string>> {
  const token = auth.getAccessToken();
  if (!token) {
    throw new Error('Not logged in. Run `skills login` first.');
  }

  const apiKey =
    process.env.SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  // Check if token is expired and refresh if needed
  if (auth.isTokenExpired()) {
    const refreshToken = auth.getRefreshToken();
    if (!refreshToken) {
      throw new Error('Session expired. Run `skills login` again.');
    }

    try {
      const response = await ofetch<{ access_token: string; refresh_token: string; expires_in?: number }>(
        `${getWebAppUrl()}/api/auth/token`,
        {
          method: 'POST',
          body: {
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
          },
        }
      );
      auth.setTokens(response.access_token, response.refresh_token, response.expires_in || 3600);
      return {
        Authorization: `Bearer ${response.access_token}`,
        ...(apiKey ? { apikey: apiKey } : {}),
      };
    } catch {
      auth.clearTokens();
      throw new Error('Session expired. Run `skills login` again.');
    }
  }

  return {
    Authorization: `Bearer ${token}`,
    ...(apiKey ? { apikey: apiKey } : {}),
  };
}

/**
 * Handle API errors
 */
function handleError(error: unknown): never {
  if (error instanceof FetchError) {
    const data = error.data as APIError | undefined;
    if (data?.error) {
      switch (data.error.code) {
        case 'UNAUTHORIZED':
          throw new Error('Not logged in. Run `skills login` first.');
        case 'FORBIDDEN':
          throw new Error(`Permission denied: ${data.error.message}`);
        case 'NOT_FOUND':
          throw new Error(data.error.message);
        case 'CONFLICT':
          throw new Error(data.error.message);
        case 'VALIDATION_ERROR':
          throw new Error(`Invalid input: ${data.error.message}`);
        default:
          throw new Error(data.error.message);
      }
    }
    throw new Error(`API error: ${error.message}`);
  }
  throw error;
}

// =============================================================================
// AUTH
// =============================================================================

export async function register(
  email: string,
  password: string,
  username: string,
  displayName?: string
): Promise<AuthResponse> {
  try {
    return await ofetch<AuthResponse>(`${getBaseUrl()}/auth/register`, {
      method: 'POST',
      body: { email, password, username, display_name: displayName },
    });
  } catch (error) {
    handleError(error);
  }
}

export async function login(email: string, password: string): Promise<AuthResponse> {
  try {
    return await ofetch<AuthResponse>(`${getBaseUrl()}/auth/login`, {
      method: 'POST',
      body: { email, password },
    });
  } catch (error) {
    handleError(error);
  }
}

// =============================================================================
// REGISTRIES
// =============================================================================

export async function listRegistries(): Promise<RegistryResponse[]> {
  try {
    const headers = await getAuthHeaders();
    const response = await ofetch<{ registries: RegistryResponse[] }>(
      `${getBaseUrl()}/registries`,
      { headers }
    );
    return response.registries;
  } catch (error) {
    handleError(error);
  }
}

export async function getRegistry(slug: string): Promise<RegistryResponse> {
  try {
    const headers = await getAuthHeaders();
    return await ofetch<RegistryResponse>(`${getBaseUrl()}/registries/${slug}`, {
      headers,
    });
  } catch (error) {
    handleError(error);
  }
}

export async function createRegistry(
  slug: string,
  name: string,
  options?: { description?: string; type?: 'personal' | 'organization'; publish_policy?: 'open' | 'require_approval' }
): Promise<RegistryResponse> {
  try {
    const headers = await getAuthHeaders();
    const response = await ofetch<{ registry: RegistryResponse }>(
      `${getBaseUrl()}/registries`,
      {
        method: 'POST',
        headers,
        body: { slug, name, ...options },
      }
    );
    return response.registry;
  } catch (error) {
    handleError(error);
  }
}

export async function listMembers(registrySlug: string): Promise<MemberResponse[]> {
  try {
    const headers = await getAuthHeaders();
    const response = await ofetch<{ members: MemberResponse[] }>(
      `${getBaseUrl()}/registries/${registrySlug}/members`,
      { headers }
    );
    return response.members;
  } catch (error) {
    handleError(error);
  }
}

export async function inviteMember(
  registrySlug: string,
  email: string,
  role: 'member' | 'contributor' | 'admin'
): Promise<void> {
  try {
    const headers = await getAuthHeaders();
    await ofetch(`${getBaseUrl()}/registries/${registrySlug}/members/invite`, {
      method: 'POST',
      headers,
      body: { email, role },
    });
  } catch (error) {
    handleError(error);
  }
}

export async function listInvitations(): Promise<InvitationResponse[]> {
  try {
    const headers = await getAuthHeaders();
    const response = await ofetch<{ invitations: InvitationResponse[] }>(
      `${getBaseUrl()}/invitations`,
      { headers }
    );
    return response.invitations;
  } catch (error) {
    handleError(error);
  }
}

export async function acceptInvitation(registrySlug: string, invitationId: string): Promise<void> {
  try {
    const headers = await getAuthHeaders();
    await ofetch(
      `${getBaseUrl()}/registries/${registrySlug}/invitations/${invitationId}/accept`,
      { method: 'POST', headers }
    );
  } catch (error) {
    handleError(error);
  }
}

export async function declineInvitation(registrySlug: string, invitationId: string): Promise<void> {
  try {
    const headers = await getAuthHeaders();
    await ofetch(
      `${getBaseUrl()}/registries/${registrySlug}/invitations/${invitationId}/decline`,
      { method: 'POST', headers }
    );
  } catch (error) {
    handleError(error);
  }
}

// =============================================================================
// SKILLS
// =============================================================================

export async function listSkills(
  registrySlug: string,
  options?: { tags?: string[]; compat?: string[]; search?: string }
): Promise<SkillResponse[]> {
  try {
    const headers = await getAuthHeaders();
    const params = new URLSearchParams();
    if (options?.tags?.length) params.set('tags', options.tags.join(','));
    if (options?.compat?.length) params.set('compat', options.compat.join(','));
    if (options?.search) params.set('search', options.search);

    const queryString = params.toString();
    const url = `${getBaseUrl()}/registries/${registrySlug}/skills${queryString ? `?${queryString}` : ''}`;

    const response = await ofetch<{ skills: SkillResponse[] }>(url, { headers });
    return response.skills;
  } catch (error) {
    handleError(error);
  }
}

export async function getSkill(registrySlug: string, skillSlug: string): Promise<SkillResponse> {
  try {
    const headers = await getAuthHeaders();
    return await ofetch<SkillResponse>(
      `${getBaseUrl()}/registries/${registrySlug}/skills/${skillSlug}`,
      { headers }
    );
  } catch (error) {
    handleError(error);
  }
}

export async function createSkill(
  registrySlug: string,
  data: {
    slug: string;
    name: string;
    description?: string;
    tags?: string[];
    compat?: string[];
    content: string;
    version?: string;
  }
): Promise<{ skill: SkillResponse; version: string }> {
  try {
    const headers = await getAuthHeaders();
    return await ofetch<{ skill: SkillResponse; version: string }>(
      `${getBaseUrl()}/registries/${registrySlug}/skills`,
      {
        method: 'POST',
        headers,
        body: data,
      }
    );
  } catch (error) {
    handleError(error);
  }
}

export async function updateSkill(
  registrySlug: string,
  skillSlug: string,
  data: { name?: string; description?: string; tags?: string[]; compat?: string[] }
): Promise<SkillResponse> {
  try {
    const headers = await getAuthHeaders();
    const response = await ofetch<{ skill: SkillResponse }>(
      `${getBaseUrl()}/registries/${registrySlug}/skills/${skillSlug}`,
      {
        method: 'PUT',
        headers,
        body: data,
      }
    );
    return response.skill;
  } catch (error) {
    handleError(error);
  }
}

export async function deleteSkill(registrySlug: string, skillSlug: string): Promise<void> {
  try {
    const headers = await getAuthHeaders();
    await ofetch(`${getBaseUrl()}/registries/${registrySlug}/skills/${skillSlug}`, {
      method: 'DELETE',
      headers,
    });
  } catch (error) {
    handleError(error);
  }
}

// =============================================================================
// VERSIONS
// =============================================================================

export async function listVersions(
  registrySlug: string,
  skillSlug: string
): Promise<SkillVersionResponse[]> {
  try {
    const headers = await getAuthHeaders();
    const response = await ofetch<{ versions: SkillVersionResponse[] }>(
      `${getBaseUrl()}/registries/${registrySlug}/skills/${skillSlug}/versions`,
      { headers }
    );
    return response.versions;
  } catch (error) {
    handleError(error);
  }
}

export async function getVersion(
  registrySlug: string,
  skillSlug: string,
  version: string
): Promise<SkillVersionResponse> {
  try {
    const headers = await getAuthHeaders();
    return await ofetch<SkillVersionResponse>(
      `${getBaseUrl()}/registries/${registrySlug}/skills/${skillSlug}/versions/${version}`,
      { headers }
    );
  } catch (error) {
    handleError(error);
  }
}

export async function createVersion(
  registrySlug: string,
  skillSlug: string,
  data: { version: string; content: string; changelog?: string }
): Promise<{ version: string; changelog?: string }> {
  try {
    const headers = await getAuthHeaders();
    return await ofetch<{ version: string; changelog?: string }>(
      `${getBaseUrl()}/registries/${registrySlug}/skills/${skillSlug}/versions`,
      {
        method: 'POST',
        headers,
        body: data,
      }
    );
  } catch (error) {
    handleError(error);
  }
}

// =============================================================================
// SEARCH
// =============================================================================

export async function search(
  query: string,
  options?: { tags?: string[]; compat?: string[] }
): Promise<SearchResult[]> {
  try {
    const headers = await getAuthHeaders();
    const params = new URLSearchParams({ q: query });
    if (options?.tags?.length) params.set('tags', options.tags.join(','));
    if (options?.compat?.length) params.set('compat', options.compat.join(','));

    const response = await ofetch<{ results: SearchResult[] }>(
      `${getBaseUrl()}/search?${params}`,
      { headers }
    );
    return response.results;
  } catch (error) {
    handleError(error);
  }
}

// =============================================================================
// SYNC
// =============================================================================

export async function sync(
  skills: Array<{ registry: string; slug: string; version?: string }>
): Promise<SyncResponse> {
  try {
    const headers = await getAuthHeaders();
    return await ofetch<SyncResponse>(`${getBaseUrl()}/sync`, {
      method: 'POST',
      headers,
      body: { skills },
    });
  } catch (error) {
    handleError(error);
  }
}
