import { Command } from 'commander';
import chalk from 'chalk';
import * as localRegistry from '../lib/local-registry/index.js';

export const infoCommand = new Command('info')
  .description('Show detailed information about a skill')
  .argument('<slug>', 'Skill slug')
  .option('--content', 'Show content preview')
  .action(async (slug: string, options) => {
    try {
      // Check if skill exists in local registry
      if (!localRegistry.skillExists(slug)) {
        console.log(chalk.red(`Error: Skill '${slug}' not found in local cache.`));
        console.log('');
        console.log('To create this skill:');
        console.log(`  ${chalk.cyan(`skill new ${slug}`)}`);
        process.exit(1);
      }

      // Get skill info
      const skillInfo = localRegistry.getSkillInfo(slug);
      if (!skillInfo) {
        console.log(chalk.red(`Error: Could not read skill '${slug}'.`));
        process.exit(1);
      }

      // Display info
      console.log('');
      console.log(chalk.bold.cyan(slug));
      console.log('');
      console.log(`${chalk.bold('Name:')}        ${skillInfo.meta.name}`);

      if (skillInfo.meta.description) {
        console.log(`${chalk.bold('Description:')} ${skillInfo.meta.description}`);
      }

      if (skillInfo.meta.tags.length > 0) {
        console.log(`${chalk.bold('Tags:')}        ${skillInfo.meta.tags.join(', ')}`);
      }

      if (skillInfo.meta.compat.length > 0) {
        console.log(`${chalk.bold('Compat:')}      ${skillInfo.meta.compat.join(', ')}`);
      }

      console.log(`${chalk.bold('SHA256:')}      ${skillInfo.meta.sha256?.substring(0, 16) || 'unknown'}...`);
      console.log(`${chalk.bold('Updated:')}     ${new Date(skillInfo.meta.updatedAt).toLocaleString()}`);
      console.log(`${chalk.bold('Registry:')}    ${localRegistry.getSkillFilePath(slug)}`);

      // Show content preview if requested
      if (options.content) {
        const skillData = localRegistry.getSkill(slug);
        if (skillData) {
          console.log('');
          console.log(chalk.bold('Content Preview:'));
          const preview = skillData.content.split('\n').slice(0, 10).join('\n');
          console.log(chalk.gray(preview));
          if (skillData.content.split('\n').length > 10) {
            console.log(chalk.gray('...'));
          }
        }
      }
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });
