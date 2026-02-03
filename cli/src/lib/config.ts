import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';
import type { SkillsConfig, SkillEntry, SkillSource } from '../types.js';

const DEFAULT_CONFIG: SkillsConfig = {
  sources: [],
  install_path: '.skills',
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
 * Read .skills.yaml config
 */
export function readConfig(): SkillsConfig {
  const configPath = getConfigPath();

  if (!fs.existsSync(configPath)) {
    return { ...DEFAULT_CONFIG };
  }

  const content = fs.readFileSync(configPath, 'utf-8');
  const parsed = yaml.parse(content) as Partial<SkillsConfig>;

  return {
    sources: parsed.sources || [],
    install_path: parsed.install_path || '.skills',
    skills: parsed.skills || [],
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
  const existingIndex = config.sources.findIndex(s => s.name === source.name);
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

  // Check if skill already exists
  const existingIndex = config.skills.findIndex(
    s => s.slug === skill.slug && s.source === skill.source
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
    config.skills = config.skills.filter(
      s => !(s.slug === slug && s.source === source)
    );
  } else {
    config.skills = config.skills.filter(s => s.slug !== slug);
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
  return config.sources.find(s => s.name === name);
}

/**
 * Get the default source (first one)
 */
export function getDefaultSource(): SkillSource | undefined {
  const config = readConfig();
  return config.sources[0];
}

/**
 * Find a skill in config
 */
export function findSkill(slug: string): SkillEntry | undefined {
  const config = readConfig();
  return config.skills.find(s => s.slug === slug);
}
