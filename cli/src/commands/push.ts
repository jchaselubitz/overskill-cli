import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import * as config from '../lib/config.js';
import * as api from '../lib/api.js';
import * as fs from '../lib/fs.js';
import * as lockfile from '../lib/lockfile.js';
import * as semverLib from '../lib/semver.js';
import { isCloudSource } from '../types.js';

export const pushCommand = new Command('push')
  .description('Publish local skill changes to a cloud registry (requires cloud source)')
  .argument('[slug]', 'Skill slug to push (optional, pushes all modified if not provided)')
  .option('-v, --version <version>', 'Version number for the new version')
  .option('-c, --changelog <message>', 'Changelog message')
  .option('--from-stdin', 'Read skill content from stdin')
  .option('--create', 'Create a new skill (requires --name)')
  .option('-n, --name <name>', 'Human-readable name (for --create)')
  .option('-d, --description <desc>', 'Description (for --create)')
  .option('-t, --tags <tags>', 'Tags (comma-separated, for --create)')
  .option('--compat <compat>', 'Compatibility (comma-separated, for --create)')
  .action(async (slug: string | undefined, options) => {
    try {
      // Check if initialized
      if (!config.configExists()) {
        console.log(chalk.red('Error: Not in a skills project.'));
        console.log(`Run ${chalk.cyan('skills init')} first.`);
        process.exit(1);
      }

      // Check for cloud sources
      const cloudSources = config.getCloudSources();
      if (cloudSources.length === 0) {
        console.log(chalk.red('Error: This command requires a cloud source.'));
        console.log('Configure a cloud source in .skills.yaml or use `skills init --cloud`.');
        console.log('');
        console.log('For local-only publishing, use:');
        console.log(`  ${chalk.cyan('skills publish <slug>')}  Publish to local registry`);
        process.exit(1);
      }

      // Handle stdin input
      let stdinContent: string | null = null;
      if (options.fromStdin) {
        if (!slug) {
          console.log(chalk.red('Error: Slug is required when using --from-stdin'));
          process.exit(1);
        }

        const chunks: Buffer[] = [];
        for await (const chunk of process.stdin) {
          chunks.push(chunk);
        }
        stdinContent = Buffer.concat(chunks).toString('utf-8');
      }

      // Determine skills to push
      const skillsToPush: string[] = [];

      if (slug) {
        skillsToPush.push(slug);
      } else {
        // Find all modified skills
        const localSkills = fs.listLocalSkills();
        for (const localSlug of localSkills) {
          if (fs.isSkillModified(localSlug)) {
            skillsToPush.push(localSlug);
          }
        }

        if (skillsToPush.length === 0) {
          console.log(chalk.yellow('No modified skills to push.'));
          console.log(`Edit a skill with ${chalk.cyan('skills edit <slug>')} first.`);
          return;
        }
      }

      // Use first cloud source
      const source = cloudSources[0];

      for (const skillSlug of skillsToPush) {
        const spinner = ora(`Pushing ${skillSlug}...`).start();

        try {
          // Get content
          let content: string;
          if (stdinContent && skillSlug === slug) {
            content = stdinContent;
          } else {
            const localContent = fs.readSkillContent(skillSlug);
            if (!localContent) {
              spinner.fail(`Skill ${skillSlug} not found locally`);
              continue;
            }
            content = localContent;
          }

          if (options.create) {
            // Create new skill
            if (!options.name) {
              spinner.fail('--name is required when creating a new skill');
              continue;
            }

            const result = await api.createSkill(source.registry, {
              slug: skillSlug,
              name: options.name,
              description: options.description,
              tags: options.tags?.split(',').map((t: string) => t.trim()),
              compat: options.compat?.split(',').map((c: string) => c.trim()),
              content,
              version: options.version || '1.0.0',
            });

            spinner.succeed(
              `Created ${chalk.cyan(skillSlug)} v${result.version} in ${source.registry}`
            );
          } else {
            // Push new version
            const locked = lockfile.getLockedSkill(skillSlug);
            const currentVersion = locked?.version || '1.0.0';

            // Determine new version
            let newVersion = options.version;
            if (!newVersion) {
              newVersion = semverLib.autoBump(currentVersion);
            }

            if (!semverLib.isValidVersion(newVersion)) {
              spinner.fail(`Invalid version: ${newVersion}`);
              continue;
            }

            if (!semverLib.isGreaterThan(newVersion, currentVersion)) {
              spinner.fail(
                `New version (${newVersion}) must be greater than current (${currentVersion})`
              );
              continue;
            }

            // Push version
            const result = await api.createVersion(source.registry, skillSlug, {
              version: newVersion,
              content,
              changelog: options.changelog,
            });

            // Update lockfile
            const hash = await fs.computeHash(content);
            lockfile.updateLockedSkill({
              slug: skillSlug,
              registry: source.registry,
              version: newVersion,
              sha256: hash,
            });

            // Clear modified marker
            fs.unmarkSkillModified(skillSlug);

            spinner.succeed(
              `Pushed ${chalk.cyan(skillSlug)} v${result.version} to ${source.registry}`
            );
          }
        } catch (error) {
          spinner.fail(error instanceof Error ? error.message : String(error));
        }
      }
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });
