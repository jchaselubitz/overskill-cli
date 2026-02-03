import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import * as config from '../lib/config.js';
import * as api from '../lib/api.js';
import * as lockfile from '../lib/lockfile.js';

export const listCommand = new Command('list')
  .description('List skills')
  .option('-i, --installed', 'List only installed skills')
  .option('-r, --registry <slug>', 'Filter by registry')
  .option('-t, --tags <tags>', 'Filter by tags (comma-separated)')
  .option('-c, --compat <compat>', 'Filter by compatibility (comma-separated)')
  .action(async (options) => {
    try {
      if (options.installed) {
        // List installed skills
        if (!config.configExists()) {
          console.log(chalk.red('Error: Not in a skills project.'));
          console.log(`Run ${chalk.cyan('skills init')} first.`);
          process.exit(1);
        }

        const skillsConfig = config.readConfig();
        const lock = lockfile.readLockfile();

        if (skillsConfig.skills.length === 0) {
          console.log(chalk.yellow('No skills installed.'));
          console.log(`Run ${chalk.cyan('skills add <slug>')} to add skills.`);
          return;
        }

        console.log(chalk.bold('Installed Skills:'));
        console.log('');

        for (const skill of skillsConfig.skills) {
          const source = config.getSource(skill.source);
          const locked = lock?.skills.find(
            (s) => s.slug === skill.slug && s.registry === source?.registry
          );

          const version = locked?.version || 'unknown';
          const constraint = skill.version ? ` (constraint: ${skill.version})` : '';

          console.log(
            `  ${chalk.cyan(skill.slug.padEnd(25))} ${source?.registry.padEnd(15)} v${version}${chalk.gray(constraint)}`
          );
        }
      } else {
        // List all available skills
        const spinner = ora('Fetching skills...').start();

        // Get registries
        const registries = await api.listRegistries();

        spinner.stop();

        if (registries.length === 0) {
          console.log(chalk.yellow('No registries available.'));
          return;
        }

        const filterTags = options.tags?.split(',').map((t: string) => t.trim());
        const filterCompat = options.compat?.split(',').map((c: string) => c.trim());

        for (const registry of registries) {
          // Skip if filtering by registry and doesn't match
          if (options.registry && registry.slug !== options.registry) {
            continue;
          }

          const skills = await api.listSkills(registry.slug, {
            tags: filterTags,
            compat: filterCompat,
          });

          if (skills.length === 0) {
            continue;
          }

          console.log(chalk.bold(`${registry.slug}:`));

          for (const skill of skills) {
            const description = skill.description
              ? chalk.gray(` - ${skill.description.substring(0, 50)}${skill.description.length > 50 ? '...' : ''}`)
              : '';

            console.log(
              `  ${chalk.cyan(skill.slug.padEnd(25))} v${skill.version.padEnd(10)}${description}`
            );
          }

          console.log('');
        }
      }
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });
