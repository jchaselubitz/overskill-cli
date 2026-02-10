import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import chalk from 'chalk';
import ora from 'ora';
import * as yaml from 'yaml';
import * as localRegistry from '../lib/local-registry/index.js';
import * as config from '../lib/config.js';
import * as auth from '../lib/auth.js';
import { isValidVersion } from '../lib/semver.js';
import { parseEditorCommand } from '../lib/editor.js';
import type { SkillEntry } from '../types.js';

const SKILL_TEMPLATE = `# {{name}}

## Instructions

<!-- Add your skill instructions here -->

## Examples

<!-- Add examples of how to use this skill -->
`;

function collectMetadata(value: string, previous: string[]): string[] {
  return [...previous, value];
}

function parseMetadata(values?: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  const entries = values ?? [];

  for (const entry of entries) {
    const separatorIndex = entry.indexOf("=");
    if (separatorIndex <= 0 || separatorIndex === entry.length - 1) {
      throw new Error(`Invalid metadata '${entry}'. Use key=value.`);
    }

    const key = entry.slice(0, separatorIndex).trim();
    const value = entry.slice(separatorIndex + 1).trim();

    if (!key || !value) {
      throw new Error(`Invalid metadata '${entry}'. Use non-empty key=value.`);
    }

    result[key] = value;
  }

  return result;
}

function buildFrontmatter(params: {
  name: string;
  description: string;
  metadata?: Record<string, string>;
}): string {
  let body = `Name: ${params.name}\nDescription:`;

  if (params.description) {
    body += ` ${params.description}`;
  }

  if (params.metadata && Object.keys(params.metadata).length > 0) {
    const metaYaml = yaml.stringify(params.metadata, { lineWidth: 0 }).trim();
    body += `\n${metaYaml}`;
  }

  return `---\n${body}\n---\n\n`;
}

/**
 * Open a file in the user's preferred editor (fire-and-forget for GUI editors)
 */
function openFileInEditor(filePath: string): void {
  const editor = auth.getEditor();

  let command: string;
  let args: string[];

  try {
    const parsed = parseEditorCommand(editor);
    command = parsed.command;
    args = parsed.args;
  } catch {
    // Silently fail — the file is already created, user can open manually
    return;
  }

  const child = spawn(command, [...args, filePath], {
    stdio: 'ignore',
    detached: true,
  });

  // Detach so the CLI doesn't wait for the editor to close
  child.unref();

  child.on('error', () => {
    // Silently fail — the file is already created, user can open manually
  });
}

export const newCommand = new Command("new")
  .description("Create a new skill in the local registry")
  .argument("<slug>", "Skill slug (lowercase, hyphens allowed)")
  .option("-n, --name <name>", "Skill display name")
  .option("-d, --description <desc>", "Skill description")
  .option("-t, --tags <tags>", "Comma-separated tags")
  .option(
    "-c, --compat <compat>",
    "Comma-separated compatibility list (e.g., claude,gpt4)",
  )
  .option("-v, --version <version>", "Initial version", "1.0.0")
  .option(
    "-m, --metadata <key=value>",
    "Repeatable metadata to include in SKILL.md frontmatter",
    collectMetadata,
    [],
  )
  .option(
    "--content <file>",
    "Read content from file instead of opening editor",
  )
  .option("--blank", "Open editor with blank content (frontmatter only)")
  .option("--no-editor", "Skip editor and create with template")
  .option("--no-add", "Skip adding to project after creation")
  .option("--no-sync", "Skip automatic sync after adding")
  .action(async (slug: string, options) => {
    try {
      // Validate slug
      if (!/^[a-z0-9-]+$/.test(slug)) {
        console.log(
          chalk.red(
            "Error: Slug must be lowercase alphanumeric with hyphens only.",
          ),
        );
        process.exit(1);
      }

      // Check if skill already exists
      if (localRegistry.skillExists(slug)) {
        console.log(
          chalk.red(`Error: Skill '${slug}' already exists in local registry.`),
        );
        console.log(
          `Use ${chalk.cyan(`skills publish ${slug}`)} to add a new version.`,
        );
        process.exit(1);
      }

      // Validate version
      const version = options.version;
      if (!isValidVersion(version)) {
        console.log(
          chalk.red(
            `Error: Invalid version '${version}'. Use semver format (e.g., 1.0.0).`,
          ),
        );
        process.exit(1);
      }

      // Parse options — default name to slug unless explicitly provided
      const name = options.name || slug;
      const description = options.description || '';
      const metadata = parseMetadata(options.metadata);
      const tags = options.tags
        ? options.tags.split(',').map((t: string) => t.trim())
        : [];
      const compat = options.compat
        ? options.compat.split(',').map((c: string) => c.trim())
        : [];
      const frontmatter = buildFrontmatter({
        name,
        description,
        metadata,
      });

      // Build content
      let content: string;

      if (options.content) {
        // Read from file
        if (!fs.existsSync(options.content)) {
          console.log(chalk.red(`Error: File not found: ${options.content}`));
          process.exit(1);
        }
        content = fs.readFileSync(options.content, 'utf-8');
      } else if (options.blank) {
        // Frontmatter only
        content = `${frontmatter}\n`;
      } else {
        // Template with frontmatter
        content = `${frontmatter}${SKILL_TEMPLATE.replace('{{name}}', name)}`;
      }

      // Validate content
      if (!content.trim()) {
        console.log(chalk.red('Error: Skill content cannot be empty.'));
        process.exit(1);
      }

      const spinner = ora('Creating skill...').start();

      try {
        // Save to local registry
        const { sha256 } = localRegistry.putVersion({
          slug,
          version,
          content,
          meta: {
            name,
            description: description || undefined,
            tags,
            compat,
          },
          provenance: {
            kind: 'local',
            source: 'created',
          },
        });

        spinner.succeed(`Created ${chalk.cyan(slug)}@${version}`);

        console.log('');
        console.log('Skill details:');
        console.log(`  ${chalk.bold('Slug:')}        ${slug}`);
        console.log(`  ${chalk.bold('Name:')}        ${name}`);
        console.log(`  ${chalk.bold('Version:')}     ${version}`);
        console.log(
          `  ${chalk.bold('SHA256:')}      ${sha256.substring(0, 16)}...`,
        );

        if (tags.length > 0) {
          console.log(`  ${chalk.bold('Tags:')}        ${tags.join(', ')}`);
        }
        if (compat.length > 0) {
          console.log(`  ${chalk.bold('Compat:')}      ${compat.join(', ')}`);
        }

        // Auto-add to project if initialized and not disabled
        const isInProject = config.configExists();
        let addedToProject = false;

        if (isInProject && options.add !== false) {
          const skillsConfig = config.readConfig();
          const existing = skillsConfig.skills.find((s: SkillEntry) => s.slug === slug);

          if (!existing) {
            const entry: SkillEntry = { slug };
            config.addSkill(entry);
            addedToProject = true;
            console.log('');
            console.log(chalk.green(`Added ${slug} to .skills.yaml`));

            // Run sync if not disabled
            if (options.sync !== false) {
              console.log('');
              console.log('Running sync...');
              const { syncCommand } = await import('./sync.js');
              await syncCommand.parseAsync(['node', 'skills', 'sync']);
            }
          }
        }

        // Open the synced skill file in the editor (unless --no-editor)
        if (options.editor !== false && isInProject) {
          const installPath = config.getInstallPath();
          const skillFilePath = path.join(installPath, slug, 'SKILL.md');

          if (fs.existsSync(skillFilePath)) {
            console.log('');
            console.log(
              chalk.gray(`Opening ${chalk.cyan(skillFilePath)} in editor...`),
            );
            openFileInEditor(skillFilePath);
          }
        }

        console.log('');
        if (addedToProject) {
          console.log('Next steps:');
          console.log(
            `  ${chalk.cyan(`skill info ${slug}`)}      View skill details`,
          );
          console.log(
            `  ${chalk.cyan(`skill publish ${slug}`)}   Publish a new version`,
          );
        } else if (isInProject) {
          console.log('Next steps:');
          console.log(
            `  ${chalk.cyan(`skill add ${slug}`)}       Add to current project`,
          );
          console.log(
            `  ${chalk.cyan(`skill info ${slug}`)}      View skill details`,
          );
          console.log(
            `  ${chalk.cyan(`skill publish ${slug}`)}   Publish a new version`,
          );
        } else {
          console.log('Next steps:');
          console.log(
            `  ${chalk.cyan('skill init')}              Initialize a project first`,
          );
          console.log(
            `  ${chalk.cyan(`skill info ${slug}`)}      View skill details`,
          );
        }
      } catch (error) {
        spinner.fail('Failed to create skill');
        throw error;
      }
    } catch (error) {
      console.error(
        chalk.red("Error:"),
        error instanceof Error ? error.message : error,
      );
      process.exit(1);
    }
  });
