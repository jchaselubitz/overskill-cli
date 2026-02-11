import { Command } from 'commander';
import chalk from 'chalk';
import * as localRegistry from '../lib/local-registry/index.js';

export const searchCommand = new Command('search')
  .description('Search for skills in the local registry')
  .argument('<query>', 'Search query')
  .option('-t, --tags <tags>', 'Filter by tags (comma-separated)')
  .option('-c, --compat <compat>', 'Filter by compatibility (comma-separated)')
  .action(async (query: string, options) => {
    try {
      // Search local registry
      let results = localRegistry.searchSkills(query);

      // Additional tag filtering
      if (options.tags) {
        const filterTags = options.tags.split(',').map((t: string) => t.trim().toLowerCase());
        results = results.filter((skill) =>
          skill.meta.tags.some((tag) => filterTags.includes(tag.toLowerCase()))
        );
      }

      // Additional compat filtering
      if (options.compat) {
        const filterCompat = options.compat.split(',').map((c: string) => c.trim().toLowerCase());
        results = results.filter((skill) =>
          skill.meta.compat.some((c) => filterCompat.includes(c.toLowerCase()))
        );
      }

      if (results.length === 0) {
        console.log(chalk.yellow(`No skills found matching "${query}".`));
        console.log('');
        console.log('To create a new skill:');
        console.log(`  ${chalk.cyan(`skills new ${query.toLowerCase().replace(/\s+/g, '-')}`)}`);
        return;
      }

      console.log(chalk.bold(`Found ${results.length} skill(s):`));
      console.log('');

      for (const skill of results) {
        const tags = skill.meta.tags.length > 0
          ? chalk.gray(` [${skill.meta.tags.join(', ')}]`)
          : '';

        const matchNote = chalk.gray(` (matched on ${skill.matchedOn})`);

        console.log(
          `${chalk.cyan(skill.slug.padEnd(30))}${tags}${matchNote}`
        );

        if (skill.meta.description) {
          console.log(chalk.gray(`    ${skill.meta.description}`));
        }
      }
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });
