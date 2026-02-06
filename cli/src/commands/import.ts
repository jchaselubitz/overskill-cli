import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import chalk from 'chalk';
import ora from 'ora';
import * as yaml from 'yaml';
import * as readline from 'readline';
import * as localRegistry from '../lib/local-registry/index.js';
import * as config from '../lib/config.js';
import type { SkillEntry } from '../types.js';

/**
 * Discovered skill from scanning
 */
interface DiscoveredSkill {
  slug: string;
  name: string;
  description: string;
  tags: string[];
  compat: string[];
  content: string;
  sourcePath: string;
  sourceType: 'claude-skills' | 'claude-commands' | 'agents-md' | 'cursorrules' | 'custom';
  sourceLabel: string;
}

/**
 * Location configuration for scanning
 */
interface ScanLocation {
  path: string;
  type: DiscoveredSkill['sourceType'];
  label: string;
  pattern: 'directory' | 'file' | 'skill-dirs';
}

/**
 * Get common locations to scan for skills
 */
function getCommonLocations(cwd: string): ScanLocation[] {
  const home = os.homedir();

  return [
    // Claude Code skills directories
    {
      path: path.join(cwd, '.claude', 'skills'),
      type: 'claude-skills' as const,
      label: 'Claude Skills (.claude/skills)',
      pattern: 'skill-dirs' as const,
    },
    {
      path: path.join(home, '.claude', 'skills'),
      type: 'claude-skills' as const,
      label: 'Claude Skills (global)',
      pattern: 'skill-dirs' as const,
    },
    // Generic skills directory in project root
    {
      path: path.join(cwd, 'skills'),
      type: 'claude-skills' as const,
      label: 'Skills (./skills)',
      pattern: 'skill-dirs' as const,
    },
    // Claude Code commands
    {
      path: path.join(cwd, '.claude', 'commands'),
      type: 'claude-commands' as const,
      label: 'Claude Commands (project)',
      pattern: 'directory' as const,
    },
    {
      path: path.join(home, '.claude', 'commands'),
      type: 'claude-commands' as const,
      label: 'Claude Commands (global)',
      pattern: 'directory' as const,
    },
    // OpenAI Codex AGENTS.md
    {
      path: path.join(cwd, 'AGENTS.md'),
      type: 'agents-md' as const,
      label: 'OpenAI Codex (AGENTS.md)',
      pattern: 'file' as const,
    },
    // Cursor rules
    {
      path: path.join(cwd, '.cursorrules'),
      type: 'cursorrules' as const,
      label: 'Cursor Rules',
      pattern: 'file' as const,
    },
    {
      path: path.join(cwd, '.cursor', 'rules'),
      type: 'cursorrules' as const,
      label: 'Cursor Rules (directory)',
      pattern: 'directory' as const,
    },
  ];
}

/**
 * Parse YAML frontmatter from markdown content
 */
function parseFrontmatter(content: string): { frontmatter: Record<string, unknown>; body: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);

  if (!match) {
    return { frontmatter: {}, body: content };
  }

  try {
    const frontmatter = yaml.parse(match[1]) || {};
    return { frontmatter, body: match[2] };
  } catch {
    return { frontmatter: {}, body: content };
  }
}

/**
 * Extract skill metadata from frontmatter
 */
function extractMetadata(frontmatter: Record<string, unknown>, slug: string): {
  name: string;
  description: string;
  tags: string[];
  compat: string[];
} {
  const name = typeof frontmatter.name === 'string'
    ? frontmatter.name
    : slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

  const description = typeof frontmatter.description === 'string'
    ? frontmatter.description
    : '';

  let tags: string[] = [];
  if (Array.isArray(frontmatter.tags)) {
    tags = frontmatter.tags.filter((t): t is string => typeof t === 'string');
  } else if (typeof frontmatter.tags === 'string') {
    tags = frontmatter.tags.split(',').map(t => t.trim());
  }

  let compat: string[] = [];
  if (Array.isArray(frontmatter.compat)) {
    compat = frontmatter.compat.filter((c): c is string => typeof c === 'string');
  } else if (typeof frontmatter.compat === 'string') {
    compat = frontmatter.compat.split(',').map(c => c.trim());
  }

  return { name, description, tags, compat };
}

/**
 * Scan a skill-dirs location (directories containing SKILL.md)
 */
function scanSkillDirs(location: ScanLocation): DiscoveredSkill[] {
  const skills: DiscoveredSkill[] = [];

  if (!fs.existsSync(location.path)) {
    return skills;
  }

  const entries = fs.readdirSync(location.path, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const skillPath = path.join(location.path, entry.name, 'SKILL.md');
    if (!fs.existsSync(skillPath)) continue;

    try {
      const content = fs.readFileSync(skillPath, 'utf-8');
      const { frontmatter, body } = parseFrontmatter(content);
      const metadata = extractMetadata(frontmatter, entry.name);

      skills.push({
        slug: entry.name,
        name: metadata.name,
        description: metadata.description,
        tags: metadata.tags,
        compat: metadata.compat,
        content,
        sourcePath: skillPath,
        sourceType: location.type,
        sourceLabel: location.label,
      });
    } catch (error) {
      // Skip files that can't be read
    }
  }

  return skills;
}

/**
 * Scan a directory for .md files
 */
function scanDirectory(location: ScanLocation): DiscoveredSkill[] {
  const skills: DiscoveredSkill[] = [];

  if (!fs.existsSync(location.path)) {
    return skills;
  }

  const entries = fs.readdirSync(location.path, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue;

    const filePath = path.join(location.path, entry.name);
    const slug = entry.name.replace(/\.md$/, '');

    // Skip invalid slugs
    if (!/^[a-z0-9-]+$/i.test(slug)) continue;

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const { frontmatter } = parseFrontmatter(content);
      const metadata = extractMetadata(frontmatter, slug.toLowerCase());

      skills.push({
        slug: slug.toLowerCase(),
        name: metadata.name,
        description: metadata.description,
        tags: metadata.tags,
        compat: metadata.compat,
        content,
        sourcePath: filePath,
        sourceType: location.type,
        sourceLabel: location.label,
      });
    } catch (error) {
      // Skip files that can't be read
    }
  }

  return skills;
}

/**
 * Scan a single file
 */
function scanFile(location: ScanLocation): DiscoveredSkill[] {
  if (!fs.existsSync(location.path)) {
    return [];
  }

  const slug = path.basename(location.path, '.md').toLowerCase().replace(/[^a-z0-9-]/g, '-');

  try {
    const content = fs.readFileSync(location.path, 'utf-8');
    const { frontmatter } = parseFrontmatter(content);
    const metadata = extractMetadata(frontmatter, slug);

    return [{
      slug,
      name: metadata.name || location.label,
      description: metadata.description,
      tags: metadata.tags,
      compat: metadata.compat,
      content,
      sourcePath: location.path,
      sourceType: location.type,
      sourceLabel: location.label,
    }];
  } catch {
    return [];
  }
}

/**
 * Scan all locations for skills
 */
function scanAllLocations(locations: ScanLocation[]): DiscoveredSkill[] {
  const allSkills: DiscoveredSkill[] = [];

  for (const location of locations) {
    let skills: DiscoveredSkill[] = [];

    switch (location.pattern) {
      case 'skill-dirs':
        skills = scanSkillDirs(location);
        break;
      case 'directory':
        skills = scanDirectory(location);
        break;
      case 'file':
        skills = scanFile(location);
        break;
    }

    allSkills.push(...skills);
  }

  // Deduplicate by slug, keeping the first occurrence
  const seen = new Set<string>();
  return allSkills.filter(skill => {
    if (seen.has(skill.slug)) {
      return false;
    }
    seen.add(skill.slug);
    return true;
  });
}

/**
 * Interactive skill selection using readline
 */
async function selectSkills(skills: DiscoveredSkill[]): Promise<DiscoveredSkill[]> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const question = (prompt: string): Promise<string> => {
    return new Promise((resolve) => {
      rl.question(prompt, resolve);
    });
  };

  console.log('');
  console.log(chalk.bold('Found skills:'));
  console.log('');

  // Group skills by source
  const bySource = new Map<string, DiscoveredSkill[]>();
  for (const skill of skills) {
    const existing = bySource.get(skill.sourceLabel) || [];
    existing.push(skill);
    bySource.set(skill.sourceLabel, existing);
  }

  let index = 1;
  const indexToSkill = new Map<number, DiscoveredSkill>();

  for (const [source, sourceSkills] of bySource) {
    console.log(chalk.cyan(`  ${source}:`));
    for (const skill of sourceSkills) {
      const alreadyExists = localRegistry.skillExists(skill.slug);
      const existsMarker = alreadyExists ? chalk.yellow(' (exists)') : '';
      console.log(`    ${chalk.gray(`[${index}]`)} ${skill.slug}${existsMarker}`);
      if (skill.description) {
        console.log(`        ${chalk.gray(skill.description.substring(0, 60))}${skill.description.length > 60 ? '...' : ''}`);
      }
      indexToSkill.set(index, skill);
      index++;
    }
    console.log('');
  }

  console.log(chalk.gray('Enter skill numbers to import (comma-separated), "all" for all, or "q" to quit:'));
  const answer = await question('> ');
  rl.close();

  if (answer.toLowerCase() === 'q' || answer.toLowerCase() === 'quit') {
    return [];
  }

  if (answer.toLowerCase() === 'all') {
    return skills;
  }

  // Parse comma-separated numbers and ranges
  const selected: DiscoveredSkill[] = [];
  const parts = answer.split(',').map(p => p.trim());

  for (const part of parts) {
    if (part.includes('-')) {
      // Range like "1-5"
      const [start, end] = part.split('-').map(n => parseInt(n.trim(), 10));
      if (!isNaN(start) && !isNaN(end)) {
        for (let i = start; i <= end; i++) {
          const skill = indexToSkill.get(i);
          if (skill && !selected.includes(skill)) {
            selected.push(skill);
          }
        }
      }
    } else {
      // Single number
      const num = parseInt(part, 10);
      const skill = indexToSkill.get(num);
      if (skill && !selected.includes(skill)) {
        selected.push(skill);
      }
    }
  }

  return selected;
}

/**
 * Import a single skill to the local registry
 */
function importSkill(skill: DiscoveredSkill, options: { force: boolean }): { success: boolean; message: string } {
  const exists = localRegistry.skillExists(skill.slug);

  if (exists && !options.force) {
    return {
      success: false,
      message: `Skill '${skill.slug}' already exists. Use --force to overwrite.`,
    };
  }

  try {
    const version = '1.0.0';

    localRegistry.putVersion({
      slug: skill.slug,
      version,
      content: skill.content,
      meta: {
        name: skill.name,
        description: skill.description || undefined,
        tags: skill.tags,
        compat: skill.compat,
      },
      provenance: {
        kind: 'local',
        source: `imported from ${skill.sourcePath}`,
      },
    });

    return {
      success: true,
      message: `Imported ${skill.slug}@${version}`,
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to import '${skill.slug}': ${error instanceof Error ? error.message : error}`,
    };
  }
}

export const importCommand = new Command('import')
  .description('Import skills from common AI tool locations (Claude, Cursor, Codex)')
  .argument('[path]', 'Custom path to scan for skills')
  .option('-f, --force', 'Overwrite existing skills')
  .option('--sync', 'Run sync after importing')
  .option('--dry-run', 'Show what would be imported without making changes')
  .option('-y, --yes', 'Import all found skills without prompting')
  .action(async (customPath: string | undefined, options) => {
    try {
      const cwd = process.cwd();

      // Build list of locations to scan
      let locations = getCommonLocations(cwd);

      // Add custom path if provided
      if (customPath) {
        const fullPath = path.resolve(cwd, customPath);

        if (!fs.existsSync(fullPath)) {
          console.log(chalk.red(`Error: Path not found: ${fullPath}`));
          process.exit(1);
        }

        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
          // Check if it's a skill-dirs pattern (contains subdirs with SKILL.md)
          const entries = fs.readdirSync(fullPath, { withFileTypes: true });
          const hasSkillDirs = entries.some(e => {
            if (!e.isDirectory()) return false;
            return fs.existsSync(path.join(fullPath, e.name, 'SKILL.md'));
          });

          locations = [{
            path: fullPath,
            type: 'custom',
            label: `Custom (${customPath})`,
            pattern: hasSkillDirs ? 'skill-dirs' : 'directory',
          }];
        } else {
          locations = [{
            path: fullPath,
            type: 'custom',
            label: `Custom (${customPath})`,
            pattern: 'file',
          }];
        }
      }

      // Scan for skills
      const spinner = ora('Scanning for skills...').start();
      const discoveredSkills = scanAllLocations(locations);
      spinner.stop();

      if (discoveredSkills.length === 0) {
        console.log(chalk.yellow('No skills found in common locations.'));
        console.log('');
        console.log('Locations searched:');
        for (const loc of locations) {
          const exists = fs.existsSync(loc.path);
          console.log(`  ${exists ? chalk.green('✓') : chalk.gray('✗')} ${loc.path}`);
        }
        console.log('');
        console.log(`Tip: Use ${chalk.cyan('skill import <path>')} to import from a custom location.`);
        process.exit(0);
      }

      console.log(chalk.green(`Found ${discoveredSkills.length} skill(s)`));

      // Select skills to import
      let skillsToImport: DiscoveredSkill[];

      if (options.yes) {
        skillsToImport = discoveredSkills;
      } else {
        skillsToImport = await selectSkills(discoveredSkills);
      }

      if (skillsToImport.length === 0) {
        console.log(chalk.yellow('No skills selected for import.'));
        process.exit(0);
      }

      // Dry run mode
      if (options.dryRun) {
        console.log('');
        console.log(chalk.cyan('Dry run - would import:'));
        for (const skill of skillsToImport) {
          const exists = localRegistry.skillExists(skill.slug);
          const action = exists ? (options.force ? 'overwrite' : 'skip (exists)') : 'create';
          console.log(`  ${skill.slug} → ${action}`);
        }
        process.exit(0);
      }

      // Import skills
      console.log('');
      const importSpinner = ora('Importing skills...').start();

      const results: Array<{ skill: DiscoveredSkill; success: boolean; message: string }> = [];

      for (const skill of skillsToImport) {
        const result = importSkill(skill, { force: options.force || false });
        results.push({ skill, ...result });
      }

      importSpinner.stop();

      // Show results
      const successful = results.filter(r => r.success);
      const failed = results.filter(r => !r.success);

      if (successful.length > 0) {
        console.log(chalk.green(`✓ Imported ${successful.length} skill(s):`));
        for (const r of successful) {
          console.log(`  ${chalk.cyan(r.skill.slug)}`);
        }
      }

      if (failed.length > 0) {
        console.log('');
        console.log(chalk.yellow(`⚠ Skipped ${failed.length} skill(s):`));
        for (const r of failed) {
          console.log(`  ${r.skill.slug}: ${r.message}`);
        }
      }

      // Add to project
      if (successful.length > 0) {
        if (!config.configExists()) {
          console.log('');
          console.log(chalk.yellow('Warning: No .skills.yaml found. Run `skill init` first to add skills to project.'));
        } else {
          const skillsConfig = config.readConfig();
          let added = 0;

          for (const r of successful) {
            const exists = skillsConfig.skills.find(s => s.slug === r.skill.slug);
            if (!exists) {
              const entry: SkillEntry = { slug: r.skill.slug };
              config.addSkill(entry);
              added++;
            }
          }

          if (added > 0) {
            console.log('');
            console.log(chalk.green(`Added ${added} skill(s) to .skills.yaml`));

            // Run sync if requested
            if (options.sync) {
              console.log('');
              console.log('Running sync...');
              const { syncCommand } = await import('./sync.js');
              await syncCommand.parseAsync(['node', 'skill', 'sync']);
            }
          }
        }
      }

      // Show next steps
      console.log('');
      console.log('Next steps:');
      console.log(`  ${chalk.cyan('skill sync')}            Install skills to your project`);
      console.log(`  ${chalk.cyan('skill list --local')}   View all local skills`);
      console.log(`  ${chalk.cyan('skill info <slug>')}    View skill details`);

    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });
