import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { checkbox } from '@inquirer/prompts';
import * as config from '../lib/config.js';
import * as localRegistry from '../lib/local-registry/index.js';
import * as fs from '../lib/fs.js';
import type { SkillEntry } from '../types.js';

export const addCommand = new Command('add')
  .description('Add one or more skills to the project')
  .argument('[slugs...]', 'Skill slugs to add')
  .option('--no-sync', 'Skip automatic sync after adding')
  .action(async (slugs: string[], options) => {
    try {
      // Check if initialized
      if (!config.configExists()) {
        console.log(chalk.red('Error: Not in a skills project.'));
        console.log(`Run ${chalk.cyan('skill init')} first.`);
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
          console.log(`  ${chalk.cyan('skill new <slug>')}           Create a new skill`);
          console.log(`  ${chalk.cyan('skill import <path>')}        Import from a file`);
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
      let needsSync = false;

      for (const slug of slugs) {
        const spinner = ora(`Adding ${slug}...`).start();

        try {
          // Check if skill exists in local registry
          if (!localRegistry.skillExists(slug)) {
            spinner.fail(`Skill '${slug}' not found in local cache.`);
            console.log('');
            console.log('To add this skill, either:');
            console.log(`  ${chalk.cyan(`skill new ${slug}`)}           Create it locally`);
            console.log(`  ${chalk.cyan(`skill import <path>`)}        Import from a file`);
            continue;
          }

          // Check if already in config
          const existing = skillsConfig.skills.find((s) => s.slug === slug);
          if (existing) {
            // Still need to sync if the skill is missing from the install path
            if (!fs.skillExists(slug)) {
              spinner.succeed(`${slug} already in config, will re-install`);
              needsSync = true;
            } else {
              spinner.warn(`${slug} already added to project`);
            }
            continue;
          }

          // Add to config
          const entry: SkillEntry = { slug };
          config.addSkill(entry);
          addedSkills.push(slug);

          spinner.succeed(`Added ${chalk.cyan(slug)}`);
        } catch (error) {
          spinner.fail(error instanceof Error ? error.message : String(error));
        }
      }

      // Sync if skills were added or need re-installing
      if ((addedSkills.length > 0 || needsSync) && options.sync !== false) {
        console.log('');
        console.log('Running sync...');

        // Import sync command and run it
        const { syncCommand } = await import('./sync.js');
        await syncCommand.parseAsync(['node', 'skill', 'sync']);
      }
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });
