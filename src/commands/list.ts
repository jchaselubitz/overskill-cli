import { Command } from 'commander';
import chalk from 'chalk';
import * as config from '../lib/config.js';
import * as localRegistry from '../lib/local-registry/index.js';

export const listCommand = new Command('list')
  .description('List skills')
  .option('-p, --project', 'List only skills in the current project')
  .option('-l, --local', 'List skills from local registry cache')
  .option('-t, --tags <tags>', 'Filter by tags (comma-separated)')
  .option('-c, --compat <compat>', 'Filter by compatibility (comma-separated)')
  .action(async options => {
    try {
      if (options.project) {
        // List installed skills in current project
        if (!config.configExists()) {
          console.log(chalk.red('Error: Not in a skills project.'));
          console.log(`Run ${chalk.cyan('skill init')} first.`);
          process.exit(1);
        }

        const skillsConfig = config.readConfig();

        if (skillsConfig.skills.length === 0) {
          console.log(chalk.yellow('No skills configured in this project.'));
          console.log(`Run ${chalk.cyan('skill add <slug>')} to add skills.`);
          return;
        }

        console.log(chalk.bold('Project Skills:'));
        console.log('');

        for (const skill of skillsConfig.skills) {
          const description = localRegistry.skillExists(skill.slug)
            ? localRegistry.readMeta(skill.slug)?.description
            : undefined;
          const descText = description
            ? chalk.gray(` - ${description.substring(0, 50)}${description.length > 50 ? '...' : ''}`)
            : '';

          console.log(`  ${chalk.cyan(skill.slug.padEnd(25))}${descText}`);
        }
      } else {
        // List all skills in local registry cache
        let skills = localRegistry.listSkills();

        if (skills.length === 0) {
          console.log(chalk.yellow('No skills in local cache.'));
          console.log('');
          console.log('To add skills:');
          console.log(`  ${chalk.cyan('skill new <slug>')}           Create a new skill`);
          console.log(`  ${chalk.cyan('skill import <path>')}        Import from a file`);
          return;
        }

        // Filter by tags
        if (options.tags) {
          const filterTags = options.tags.split(',').map((t: string) => t.trim().toLowerCase());
          skills = skills.filter((skill) =>
            skill.meta.tags.some((tag) => filterTags.includes(tag.toLowerCase()))
          );
        }

        // Filter by compat
        if (options.compat) {
          const filterCompat = options.compat.split(',').map((c: string) => c.trim().toLowerCase());
          skills = skills.filter((skill) =>
            skill.meta.compat.some((c) => filterCompat.includes(c.toLowerCase()))
          );
        }

        if (skills.length === 0) {
          console.log(chalk.yellow('No skills match the specified filters.'));
          return;
        }

        console.log(chalk.bold(`Local Registry (${skills.length} skills):`));
        console.log('');

        for (const skill of skills) {
          const description = skill.meta.description
            ? chalk.gray(` - ${skill.meta.description.substring(0, 50)}${skill.meta.description.length > 50 ? '...' : ''}`)
            : '';

          console.log(`  ${chalk.cyan(skill.slug.padEnd(25))}${description}`);
        }
      }
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });
