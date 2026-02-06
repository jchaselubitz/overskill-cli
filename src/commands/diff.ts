import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import * as config from '../lib/config.js';
import * as api from '../lib/api.js';
import * as fs from '../lib/fs.js';
import { isCloudSource } from '../types.js';

export const diffCommand = new Command('diff')
  .description('Show differences between local and remote skill content (requires cloud source)')
  .argument('[slug]', 'Skill slug (optional, shows all if not provided)')
  .action(async (slug?: string) => {
    try {
      // Check if initialized
      if (!config.configExists()) {
        console.log(chalk.red('Error: Not in a skills project.'));
        console.log(`Run ${chalk.cyan('skills init')} first.`);
        process.exit(1);
      }

      // Check for cloud sources
      if (!config.hasCloudSource()) {
        console.log(chalk.red('Error: This command requires a cloud source.'));
        console.log('Configure a cloud source in .skills.yaml or use `skills init --cloud`.');
        process.exit(1);
      }

      const skillsConfig = config.readConfig();
      const skillsToDiff = slug
        ? skillsConfig.skills.filter((s) => s.slug === slug)
        : skillsConfig.skills;

      if (skillsToDiff.length === 0) {
        console.log(chalk.yellow(slug ? `Skill '${slug}' not found in config.` : 'No skills configured.'));
        return;
      }

      for (const skill of skillsToDiff) {
        const spinner = ora(`Checking ${skill.slug}...`).start();

        // Get source, preferring cloud source for this command
        const sourceName = skill.source || config.getDefaultSource()?.name;
        const source = sourceName ? config.getSource(sourceName) : config.getDefaultSource();

        if (!source || !isCloudSource(source)) {
          spinner.warn(`${skill.slug}: Requires cloud source, skipping`);
          continue;
        }

        // Read local content
        const localContent = fs.readSkillContent(skill.slug);
        if (!localContent) {
          spinner.warn(`${skill.slug}: Not synced locally`);
          continue;
        }

        try {
          // Fetch remote content
          const remoteSkill = await api.getSkill(source.registry, skill.slug);
          const remoteContent = remoteSkill.content || '';

          spinner.stop();

          if (localContent === remoteContent) {
            console.log(chalk.green(`${skill.slug}: No differences`));
            continue;
          }

          console.log('');
          console.log(chalk.bold(`${skill.slug}:`));
          console.log('');

          // Simple line-by-line diff
          const localLines = localContent.split('\n');
          const remoteLines = remoteContent.split('\n');

          const maxLines = Math.max(localLines.length, remoteLines.length);

          for (let i = 0; i < maxLines; i++) {
            const localLine = localLines[i];
            const remoteLine = remoteLines[i];

            if (localLine === remoteLine) {
              continue;
            }

            if (localLine !== undefined && remoteLine === undefined) {
              console.log(chalk.green(`+ ${i + 1}: ${localLine}`));
            } else if (localLine === undefined && remoteLine !== undefined) {
              console.log(chalk.red(`- ${i + 1}: ${remoteLine}`));
            } else if (localLine !== remoteLine) {
              console.log(chalk.red(`- ${i + 1}: ${remoteLine}`));
              console.log(chalk.green(`+ ${i + 1}: ${localLine}`));
            }
          }

          console.log('');
        } catch (error) {
          spinner.fail(`${skill.slug}: Failed to fetch from cloud`);
        }
      }
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });
