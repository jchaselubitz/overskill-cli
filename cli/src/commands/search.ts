import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import * as api from '../lib/api.js';

export const searchCommand = new Command('search')
  .description('Search for skills across all accessible registries')
  .argument('<query>', 'Search query')
  .option('-t, --tags <tags>', 'Filter by tags (comma-separated)')
  .option('-c, --compat <compat>', 'Filter by compatibility (comma-separated)')
  .action(async (query: string, options) => {
    try {
      const spinner = ora(`Searching for "${query}"...`).start();

      const filterTags = options.tags?.split(',').map((t: string) => t.trim());
      const filterCompat = options.compat?.split(',').map((c: string) => c.trim());

      const results = await api.search(query, {
        tags: filterTags,
        compat: filterCompat,
      });

      spinner.stop();

      if (results.length === 0) {
        console.log(chalk.yellow('No skills found.'));
        return;
      }

      console.log(chalk.bold(`Found ${results.length} skill(s):`));
      console.log('');

      for (const skill of results) {
        const tags = skill.tags.length > 0
          ? chalk.gray(` [${skill.tags.join(', ')}]`)
          : '';

        console.log(
          `${chalk.cyan(`${skill.registry}/${skill.slug}`).padEnd(45)} v${skill.version.padEnd(10)}${tags}`
        );

        if (skill.description) {
          console.log(chalk.gray(`    ${skill.description}`));
        }
      }
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });
