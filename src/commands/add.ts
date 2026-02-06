import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { checkbox } from '@inquirer/prompts';
import * as config from '../lib/config.js';
import * as localRegistry from '../lib/local-registry/index.js';
import type { SkillEntry } from '../types.js';

export const addCommand = new Command('add')
  .description('Add one or more skills to the project')
  .argument('[slugs...]', 'Skill slugs to add')
  .option('-v, --version <constraint>', 'Version constraint (e.g., ">=1.0.0", "^2.0.0")')
  .option('--no-sync', 'Skip automatic sync after adding')
  .action(async (slugs: string[], options) => {
    try {
      // Check if initialized
      if (!config.configExists()) {
        console.log(chalk.red('Error: Not in a skills project.'));
        console.log(`Run ${chalk.cyan('skills init')} first.`);
        process.exit(1);
      }

      const skillsConfig = config.readConfig();

      // If no slugs provided, show interactive selection
      if (!slugs || slugs.length === 0) {
        const allSkills = localRegistry.listSkills();

        if (allSkills.length === 0) {
          console.log(chalk.yellow('No skills available in local cache.'));
          console.log('');
          console.log('To add skills, either:');
          console.log(`  ${chalk.cyan('skills new <slug>')}           Create a new skill`);
          console.log(`  ${chalk.cyan('skills cache import <path>')}   Import from a file`);
          return;
        }

        // Filter out already added skills
        const availableSkills = allSkills.filter(
          (skill) => !skillsConfig.skills.find((s) => s.slug === skill.slug)
        );

        if (availableSkills.length === 0) {
          console.log(chalk.yellow('All available skills are already added to this project.'));
          return;
        }

        // Show interactive checkbox prompt
        const selected = await checkbox({
          message: 'Select skills to add (use spacebar to select, enter to confirm):',
          choices: availableSkills.map((skill) => ({
            name: `${chalk.green(skill.slug)} - ${skill.meta.description || 'No description'}`,
            value: skill.slug,
          })),
        });

        if (selected.length === 0) {
          console.log(chalk.yellow('No skills selected.'));
          return;
        }

        slugs = selected;
      }

      const addedSkills: string[] = [];

      for (const slug of slugs) {
        const spinner = ora(`Adding ${slug}...`).start();

        try {
          // Check if skill exists in local registry
          if (!localRegistry.skillExists(slug)) {
            spinner.fail(`Skill '${slug}' not found in local cache.`);
            console.log('');
            console.log('To add this skill, either:');
            console.log(`  ${chalk.cyan(`skills new ${slug}`)}           Create it locally`);
            console.log(`  ${chalk.cyan(`skills cache import <path>`)}   Import from a file`);
            continue;
          }

          // Get skill info from local registry
          const skillInfo = localRegistry.getSkillInfo(slug);
          if (!skillInfo) {
            spinner.fail(`Could not read skill '${slug}' from cache.`);
            continue;
          }

          // Check if already added
          const existing = skillsConfig.skills.find((s) => s.slug === slug);
          if (existing) {
            spinner.warn(`${slug} already added to project`);
            continue;
          }

          // Resolve version if constraint provided
          let resolvedVersion: string | null = null;
          if (options.version) {
            resolvedVersion = localRegistry.resolveVersion(slug, options.version);
            if (!resolvedVersion) {
              const availableVersions = localRegistry.getVersionStrings(slug);
              spinner.fail(`No cached version of '${slug}' satisfies '${options.version}'.`);
              console.log(`  Available versions: ${availableVersions.join(', ')}`);
              continue;
            }
          } else {
            resolvedVersion = localRegistry.getLatestVersion(slug);
          }

          // Add to config
          const entry: SkillEntry = {
            slug,
          };

          if (options.version) {
            entry.version = options.version;
          }

          config.addSkill(entry);
          addedSkills.push(slug);

          const displayVersion = resolvedVersion || localRegistry.getLatestVersion(slug);
          spinner.succeed(
            `Added ${chalk.cyan(slug)} (v${displayVersion})`
          );
        } catch (error) {
          spinner.fail(error instanceof Error ? error.message : String(error));
        }
      }

      // Sync if skills were added
      if (addedSkills.length > 0 && options.sync !== false) {
        console.log('');
        console.log('Running sync...');

        // Import sync command and run it
        const { syncCommand } = await import('./sync.js');
        await syncCommand.parseAsync(['node', 'skills', 'sync']);
      }
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });
