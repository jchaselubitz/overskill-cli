import { Command } from 'commander';
import chalk from 'chalk';
import * as config from '../lib/config.js';
import * as fs from '../lib/fs.js';

export const validateCommand = new Command('validate')
  .description('Validate skill files')
  .argument('[slug]', 'Skill slug to validate (optional, validates all if not provided)')
  .action(async (slug?: string) => {
    try {
      // Check if initialized
      if (!config.configExists()) {
        console.log(chalk.red('Error: Not in a skills project.'));
        console.log(`Run ${chalk.cyan('skill init')} first.`);
        process.exit(1);
      }

      const skillsToValidate = slug ? [slug] : fs.listLocalSkills();

      if (skillsToValidate.length === 0) {
        console.log(chalk.yellow('No skills to validate.'));
        return;
      }

      let hasErrors = false;

      for (const skillSlug of skillsToValidate) {
        const errors: string[] = [];
        const warnings: string[] = [];

        // Check SKILL.md exists
        const content = fs.readSkillContent(skillSlug);
        if (!content) {
          errors.push('SKILL.md not found');
        } else {
          // Check content is not empty
          if (content.trim().length === 0) {
            errors.push('SKILL.md is empty');
          }

          // Check for title heading
          if (!content.match(/^#\s+.+/m)) {
            warnings.push('SKILL.md should have a # heading');
          }

          // Check for reasonable length
          if (content.length < 100) {
            warnings.push('SKILL.md seems very short');
          }
        }

        // Check meta.yaml exists
        const meta = fs.readSkillMeta(skillSlug);
        if (!meta) {
          errors.push('meta.yaml not found');
        } else {
          // Validate required fields
          if (!meta.slug) {
            errors.push('meta.yaml missing slug');
          }

          // Check slug format
          if (meta.slug && !/^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/.test(meta.slug)) {
            errors.push('Slug must be lowercase alphanumeric with hyphens');
          }
        }

        // Print results
        if (errors.length === 0 && warnings.length === 0) {
          console.log(chalk.green(`✓ ${skillSlug}`));
        } else {
          if (errors.length > 0) {
            console.log(chalk.red(`✗ ${skillSlug}`));
            hasErrors = true;
            for (const error of errors) {
              console.log(chalk.red(`    Error: ${error}`));
            }
          } else {
            console.log(chalk.yellow(`⚠ ${skillSlug}`));
          }

          for (const warning of warnings) {
            console.log(chalk.yellow(`    Warning: ${warning}`));
          }
        }
      }

      if (hasErrors) {
        process.exit(1);
      }
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });
