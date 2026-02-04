import Conf from "conf";
import type { CLIConfig } from "../types.js";

const config = new Conf<CLIConfig>({
  projectName: "agent-skills",
  defaults: {},
});

/**
 * Get the API URL
 */
export function getApiUrl(): string | undefined {
  return config.get("api_url");
}

/**
 * Set the API URL
 */
export function setApiUrl(url: string): void {
  config.set("api_url", url);
}

/**
 * Get the web app URL
 */
export function getWebAppUrl(): string | undefined {
  return config.get("web_app_url");
}

/**
 * Get the API key (Supabase publishable/anon key)
 */
// export function getApiKey(): string | undefined {
//   return config.get('api_key');
// }

// /**
//  * Set the API key
//  */
// export function setApiKey(key: string): void {
//   config.set('api_key', key);
// }

/**
 * Set the web app URL
 */
export function setWebAppUrl(url: string): void {
  config.set("web_app_url", url);
}

/**
 * Get the access token
 */
export function getAccessToken(): string | undefined {
  return config.get("access_token");
}

/**
 * Get the refresh token
 */
export function getRefreshToken(): string | undefined {
  return config.get("refresh_token");
}

/**
 * Get token expiration time
 */
export function getExpiresAt(): number | undefined {
  return config.get("expires_at");
}

/**
 * Store authentication tokens
 */
export function setTokens(
  accessToken: string,
  refreshToken: string,
  expiresIn: number
): void {
  config.set("access_token", accessToken);
  config.set("refresh_token", refreshToken);
  config.set("expires_at", Date.now() + expiresIn * 1000);
}

/**
 * Clear authentication tokens
 */
export function clearTokens(): void {
  config.delete("access_token");
  config.delete("refresh_token");
  config.delete("expires_at");
}

/**
 * Check if tokens are expired
 */
export function isTokenExpired(): boolean {
  const expiresAt = getExpiresAt();
  if (!expiresAt) return true;
  // Add 60 second buffer
  return Date.now() > expiresAt - 60000;
}

/**
 * Check if user is logged in
 */
export function isLoggedIn(): boolean {
  return !!getAccessToken() && !!getRefreshToken();
}

/**
 * Get preferred editor
 */
export function getEditor(): string {
  return (
    config.get("editor") || process.env.VISUAL || process.env.EDITOR || "vim"
  );
}

/**
 * Set preferred editor
 */
export function setEditor(editor: string): void {
  config.set("editor", editor);
}

/**
 * Get default install path
 */
export function getDefaultInstallPath(): string {
  return config.get("install_path") || ".skills";
}

/**
 * Set default install path
 */
export function setDefaultInstallPath(path: string): void {
  config.set("install_path", path);
}

/**
 * Get a config value
 */
export function get<K extends keyof CLIConfig>(
  key: K
): CLIConfig[K] | undefined {
  return config.get(key);
}

/**
 * Set a config value
 */
export function set<K extends keyof CLIConfig>(
  key: K,
  value: CLIConfig[K]
): void {
  config.set(key, value);
}

/**
 * Get all config
 */
export function getAll(): CLIConfig {
  return config.store;
}

/**
 * Get the config file path
 */
export function getConfigPath(): string {
  return config.path;
}
