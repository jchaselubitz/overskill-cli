import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';
import type {
  SkillsConfig,
  SkillEntry,
  SkillSource,
  LocalSource,
  CloudSource,
  LegacySource,
} from '../types.js';
import { isLocalSource, isCloudSource } from '../types.js';

const DEFAULT_CONFIG: SkillsConfig = {
  sources: [],
  install_path: '.claude/skills',
  skills: [],
};

/**
 * Find the project root by looking for .skills.yaml
 */
export function findProjectRoot(): string | null {
  let currentDir = process.cwd();
  const root = path.parse(currentDir).root;

  while (currentDir !== root) {
    const configPath = path.join(currentDir, '.skills.yaml');
    if (fs.existsSync(configPath)) {
      return currentDir;
    }
    currentDir = path.dirname(currentDir);
  }

  return null;
}

/**
 * Get the path to .skills.yaml
 */
export function getConfigPath(): string {
  const projectRoot = findProjectRoot();
  if (projectRoot) {
    return path.join(projectRoot, '.skills.yaml');
  }
  return path.join(process.cwd(), '.skills.yaml');
}

/**
 * Check if skills config exists
 */
export function configExists(): boolean {
  return fs.existsSync(getConfigPath());
}

/**
 * Check if a source is in legacy format (has url/registry but no kind)
 */
function isLegacySource(source: unknown): source is LegacySource {
  return (
    typeof source === 'object' &&
    source !== null &&
    'name' in source &&
    'registry' in source &&
    'url' in source &&
    !('kind' in source)
  );
}

/**
 * Convert a legacy source to cloud source
 */
function convertLegacySource(legacy: LegacySource): CloudSource {
  return {
    name: legacy.name,
    kind: 'cloud',
    registry: legacy.registry,
    url: legacy.url,
  };
}

/**
 * Normalize sources (convert legacy format to new format)
 */
function normalizeSources(sources: unknown[]): SkillSource[] {
  return sources.map((source) => {
    if (isLegacySource(source)) {
      return convertLegacySource(source);
    }
    return source as SkillSource;
  });
}

/**
 * Read .skills.yaml config
 */
export function readConfig(): SkillsConfig {
  const configPath = getConfigPath();

  if (!fs.existsSync(configPath)) {
    return { ...DEFAULT_CONFIG };
  }

  const content = fs.readFileSync(configPath, 'utf-8');
  const parsed = yaml.parse(content) as Record<string, unknown>;

  // Normalize sources (handle legacy format)
  const rawSources = (parsed.sources as unknown[]) || [];
  const sources = normalizeSources(rawSources);

  return {
    sources,
    install_path: (parsed.install_path as string) || '.claude/skills',
    skills: (parsed.skills as SkillEntry[]) || [],
  };
}

/**
 * Write .skills.yaml config
 */
export function writeConfig(config: SkillsConfig): void {
  const configPath = getConfigPath();
  const content = yaml.stringify(config, {
    lineWidth: 0,
    defaultStringType: 'QUOTE_DOUBLE',
    defaultKeyType: 'PLAIN',
  });
  fs.writeFileSync(configPath, content, 'utf-8');
}

/**
 * Add a source to the config
 */
export function addSource(source: SkillSource): void {
  const config = readConfig();

  // Check if source already exists
  const existingIndex = config.sources.findIndex((s) => s.name === source.name);
  if (existingIndex >= 0) {
    config.sources[existingIndex] = source;
  } else {
    config.sources.push(source);
  }

  writeConfig(config);
}

/**
 * Add a skill to the config
 */
export function addSkill(skill: SkillEntry): void {
  const config = readConfig();

  // Normalize source to compare (use default if not specified)
  const skillSource = skill.source || getDefaultSourceName(config);

  // Check if skill already exists
  const existingIndex = config.skills.findIndex(
    (s) => s.slug === skill.slug && (s.source || getDefaultSourceName(config)) === skillSource
  );

  if (existingIndex >= 0) {
    config.skills[existingIndex] = skill;
  } else {
    config.skills.push(skill);
  }

  writeConfig(config);
}

/**
 * Remove a skill from the config
 */
export function removeSkill(slug: string, source?: string): boolean {
  const config = readConfig();
  const initialLength = config.skills.length;

  if (source) {
    config.skills = config.skills.filter((s) => !(s.slug === slug && s.source === source));
  } else {
    config.skills = config.skills.filter((s) => s.slug !== slug);
  }

  if (config.skills.length < initialLength) {
    writeConfig(config);
    return true;
  }

  return false;
}

/**
 * Get the install path (absolute)
 */
export function getInstallPath(): string {
  const config = readConfig();
  const projectRoot = findProjectRoot() || process.cwd();
  return path.join(projectRoot, config.install_path);
}

/**
 * Get a source by name
 */
export function getSource(name: string): SkillSource | undefined {
  const config = readConfig();
  return config.sources.find((s) => s.name === name);
}

/**
 * Get the default source name from config
 */
function getDefaultSourceName(config: SkillsConfig): string | undefined {
  // Prefer local source as default
  const localSource = config.sources.find((s) => isLocalSource(s));
  if (localSource) return localSource.name;

  // Fall back to first source
  return config.sources[0]?.name;
}

/**
 * Get the default source (prefer local, then first)
 */
export function getDefaultSource(): SkillSource | undefined {
  const config = readConfig();
  // Prefer local source as default
  const localSource = config.sources.find((s) => isLocalSource(s));
  if (localSource) return localSource;

  // Fall back to first source
  return config.sources[0];
}

/**
 * Get the first local source
 */
export function getLocalSource(): LocalSource | undefined {
  const config = readConfig();
  return config.sources.find((s) => isLocalSource(s)) as LocalSource | undefined;
}

/**
 * Get all cloud sources
 */
export function getCloudSources(): CloudSource[] {
  const config = readConfig();
  return config.sources.filter((s) => isCloudSource(s)) as CloudSource[];
}

/**
 * Check if config has a local source
 */
export function hasLocalSource(): boolean {
  const config = readConfig();
  return config.sources.some((s) => isLocalSource(s));
}

/**
 * Check if config has any cloud sources
 */
export function hasCloudSource(): boolean {
  const config = readConfig();
  return config.sources.some((s) => isCloudSource(s));
}

/**
 * Find a skill in config
 */
export function findSkill(slug: string): SkillEntry | undefined {
  const config = readConfig();
  return config.skills.find((s) => s.slug === slug);
}

/**
 * Get source for a skill entry (resolves default if not specified)
 */
export function getSourceForSkill(skill: SkillEntry): SkillSource | undefined {
  const config = readConfig();
  const sourceName = skill.source || getDefaultSourceName(config);
  if (!sourceName) return undefined;
  return config.sources.find((s) => s.name === sourceName);
}

/**
 * Create a default local source
 */
export function createLocalSource(name: string = 'local'): LocalSource {
  return {
    name,
    kind: 'local',
  };
}

/**
 * Create a cloud source
 */
export function createCloudSource(
  name: string,
  registry: string,
  url: string
): CloudSource {
  return {
    name,
    kind: 'cloud',
    registry,
    url,
  };
}

/**
 * Get registry slug from a source (only for cloud sources)
 * Returns undefined for local sources
 */
export function getSourceRegistry(source: SkillSource): string | undefined {
  if (isCloudSource(source)) {
    return source.registry;
  }
  return undefined;
}

/**
 * Get URL from a source (only for cloud sources)
 * Returns undefined for local sources
 */
export function getSourceUrl(source: SkillSource): string | undefined {
  if (isCloudSource(source)) {
    return source.url;
  }
  return undefined;
}

/**
 * Require a cloud source or throw an error
 * Used for operations that only work with cloud sources
 */
export function requireCloudSource(source: SkillSource | undefined, operation: string): CloudSource {
  if (!source) {
    throw new Error(`No source configured. Add a source in .skills.yaml`);
  }
  if (!isCloudSource(source)) {
    throw new Error(
      `Operation '${operation}' requires a cloud source, but '${source.name}' is a local source. ` +
        `Use a cloud source with --source or configure one in .skills.yaml`
    );
  }
  return source;
}

// Re-export type guards
export { isLocalSource, isCloudSource } from '../types.js';
