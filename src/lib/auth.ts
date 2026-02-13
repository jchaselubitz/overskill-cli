import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import type { CLIConfig } from "../types.js";

/**
 * Get the ~/.overskill directory path (cross-platform)
 */
function getOverskillDir(): string {
  return path.join(os.homedir(), ".overskill");
}

/**
 * Get legacy config paths (from conf package)
 * macOS: ~/Library/Preferences/overskill-nodejs/
 * Linux: ~/.config/overskill/
 * Windows: %APPDATA%/overskill-nodejs/
 */
function getLegacyConfigPaths(): string[] {
  const platform = os.platform();
  const homeDir = os.homedir();

  if (platform === "darwin") {
    return [path.join(homeDir, "Library", "Preferences", "overskill-nodejs", "config.json")];
  } else if (platform === "win32") {
    const appData = process.env.APPDATA || path.join(homeDir, "AppData", "Roaming");
    return [path.join(appData, "overskill-nodejs", "config.json")];
  } else {
    // Linux and other Unix-like systems
    return [path.join(homeDir, ".config", "overskill", "config.json")];
  }
}

/**
 * Migrate config from legacy location to ~/.overskill/
 * Called automatically on first read if new config doesn't exist
 */
function migrateLegacyConfig(): void {
  const newConfigPath = getConfigPath();

  // Don't migrate if new config already exists
  if (fs.existsSync(newConfigPath)) {
    return;
  }

  // Check each legacy path
  for (const legacyPath of getLegacyConfigPaths()) {
    if (fs.existsSync(legacyPath)) {
      try {
        // Read legacy config
        const legacyContent = fs.readFileSync(legacyPath, "utf-8");
        const legacyConfig = JSON.parse(legacyContent) as CLIConfig;

        // Write to new location
        ensureOverskillDir();
        fs.writeFileSync(newConfigPath, JSON.stringify(legacyConfig, null, 2), "utf-8");

        console.log(`Migrated config from ${legacyPath} to ${newConfigPath}`);
        return;
      } catch (error) {
        console.error(`Failed to migrate config from ${legacyPath}:`, error);
      }
    }
  }
}

/**
 * Get the config file path (~/.overskill/config.json)
 */
export function getConfigPath(): string {
  return path.join(getOverskillDir(), "config.json");
}

/**
 * Ensure the ~/.overskill directory exists
 */
function ensureOverskillDir(): void {
  const dir = getOverskillDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Read config from ~/.overskill/config.json
 */
function readConfig(): CLIConfig {
  const configPath = getConfigPath();

  // Migrate from legacy location if needed
  if (!fs.existsSync(configPath)) {
    migrateLegacyConfig();
  }

  // Read config if it exists
  if (!fs.existsSync(configPath)) {
    return {};
  }

  try {
    const content = fs.readFileSync(configPath, "utf-8");
    return JSON.parse(content) as CLIConfig;
  } catch (error) {
    console.error(`Failed to read config from ${configPath}:`, error);
    return {};
  }
}

/**
 * Write config to ~/.overskill/config.json
 */
function writeConfig(config: CLIConfig): void {
  ensureOverskillDir();
  const configPath = getConfigPath();
  try {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8");
  } catch (error) {
    console.error(`Failed to write config to ${configPath}:`, error);
    throw error;
  }
}

/**
 * Get the API URL
 */
export function getApiUrl(): string | undefined {
  return readConfig().api_url;
}

/**
 * Set the API URL
 */
export function setApiUrl(url: string): void {
  const config = readConfig();
  config.api_url = url;
  writeConfig(config);
}

/**
 * Get the web app URL
 */
export function getWebAppUrl(): string | undefined {
  return readConfig().web_app_url;
}

/**
 * Set the web app URL
 */
export function setWebAppUrl(url: string): void {
  const config = readConfig();
  config.web_app_url = url;
  writeConfig(config);
}

/**
 * Get the access token
 */
export function getAccessToken(): string | undefined {
  return readConfig().access_token;
}

/**
 * Get the refresh token
 */
export function getRefreshToken(): string | undefined {
  return readConfig().refresh_token;
}

/**
 * Get token expiration time
 */
export function getExpiresAt(): number | undefined {
  return readConfig().expires_at;
}

/**
 * Store authentication tokens
 */
export function setTokens(
  accessToken: string,
  refreshToken: string,
  expiresIn: number
): void {
  const config = readConfig();
  config.access_token = accessToken;
  config.refresh_token = refreshToken;
  config.expires_at = Date.now() + expiresIn * 1000;
  writeConfig(config);
}

/**
 * Clear authentication tokens
 */
export function clearTokens(): void {
  const config = readConfig();
  delete config.access_token;
  delete config.refresh_token;
  delete config.expires_at;
  writeConfig(config);
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
    readConfig().editor || process.env.VISUAL || process.env.EDITOR || "vim"
  );
}

/**
 * Set preferred editor
 */
export function setEditor(editor: string): void {
  const config = readConfig();
  config.editor = editor;
  writeConfig(config);
}

/**
 * Get default install path
 */
export function getDefaultInstallPath(): string {
  return readConfig().install_path || ".claude/skills";
}

/**
 * Set default install path
 */
export function setDefaultInstallPath(installPath: string): void {
  const config = readConfig();
  config.install_path = installPath;
  writeConfig(config);
}

/**
 * Get a config value
 */
export function get<K extends keyof CLIConfig>(
  key: K
): CLIConfig[K] | undefined {
  return readConfig()[key];
}

/**
 * Set a config value
 */
export function set<K extends keyof CLIConfig>(
  key: K,
  value: CLIConfig[K]
): void {
  const config = readConfig();
  config[key] = value;
  writeConfig(config);
}

/**
 * Get all config
 */
export function getAll(): CLIConfig {
  return readConfig();
}
