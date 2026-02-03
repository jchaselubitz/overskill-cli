import { Command } from 'commander';
import chalk from 'chalk';
import * as config from '../lib/config.js';
import * as fs from '../lib/fs.js';
import * as lockfile from '../lib/lockfile.js';
import * as indexGen from '../lib/index-gen.js';

export const removeCommand = new Command('remove')
  .description('Remove a skill from the project')
  .argument('<slug>', 'Skill slug to remove')
  .option('-s, --source <name>', 'Source name (if skill exists in multiple sources)')
  .action(async (slug: string, options) => {
    try {
      // Check if initialized
      if (!config.configExists()) {
        console.log(chalk.red('Error: Not in a skills project.'));
        console.log(`Run ${chalk.cyan('skills init')} first.`);
        process.exit(1);
      }

      // Find the skill in config
      const skillsConfig = config.readConfig();
      const skill = skillsConfig.skills.find((s) => {
        if (options.source) {
          return s.slug === slug && s.source === options.source;
        }
        return s.slug === slug;
      });

      if (!skill) {
        console.log(chalk.yellow(`Skill '${slug}' not found in config.`));
        return;
      }

      // Remove from config
      const removed = config.removeSkill(slug, options.source);

      if (!removed) {
        console.log(chalk.yellow(`Failed to remove '${slug}' from config.`));
        return;
      }

      // Delete from disk
      if (fs.skillExists(slug)) {
        fs.deleteSkill(slug);
      }

      // Remove from lockfile
      const source = config.getSource(skill.source);
      if (source) {
        lockfile.removeLockedSkill(slug, source.registry);
      }

      // Regenerate index
      indexGen.regenerateIndex();

      console.log(chalk.green(`Removed ${chalk.cyan(slug)}`));
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });
