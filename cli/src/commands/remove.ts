import { Command } from 'commander';
import chalk from 'chalk';
import * as config from '../lib/config.js';
import * as fs from '../lib/fs.js';
import * as lockfile from '../lib/lockfile.js';
import * as indexGen from '../lib/index-gen.js';

export const removeCommand = new Command('remove')
  .description('Remove one or more skills from the project')
  .argument('<slugs...>', 'Skill slugs to remove')
  .action(async (slugs: string[]) => {
    try {
      // Check if initialized
      if (!config.configExists()) {
        console.log(chalk.red('Error: Not in a skills project.'));
        console.log(`Run ${chalk.cyan('skills init')} first.`);
        process.exit(1);
      }

      // Find the skills in config
      const skillsConfig = config.readConfig();

      for (const slug of slugs) {
        const skill = skillsConfig.skills.find((s) => s.slug === slug);

        if (!skill) {
          console.log(chalk.yellow(`Skill '${slug}' not found in config.`));
          continue;
        }

        // Remove from config
        const removed = config.removeSkill(slug);

        if (!removed) {
          console.log(chalk.yellow(`Failed to remove '${slug}' from config.`));
          continue;
        }

        // Delete from disk
        if (fs.skillExists(slug)) {
          fs.deleteSkill(slug);
        }

        // Remove from lockfile (use "local" as registry for local sources)
        lockfile.removeLockedSkill(slug);

        console.log(chalk.green(`Removed ${chalk.cyan(slug)}`));
      }

      // Regenerate index once after all removals
      indexGen.regenerateIndex();
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });
