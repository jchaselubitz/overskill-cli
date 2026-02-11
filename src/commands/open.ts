import { Command } from 'commander';
import { spawn } from 'child_process';
import chalk from 'chalk';
import * as localRegistry from '../lib/local-registry/index.js';
import * as auth from '../lib/auth.js';
import { parseEditorCommand } from '../lib/editor.js';

export const openCommand = new Command('open')
  .description('Open a skill in your editor (works globally, no project required)')
  .argument('<slug>', 'Skill slug to open')
  .option('-e, --editor <editor>', 'Editor to use')
  .action(async (slug: string, options) => {
    try {
      // Check if skill exists in local registry
      if (!localRegistry.skillExists(slug)) {
        console.log(chalk.red(`Error: Skill '${slug}' not found in local registry.`));
        console.log('');
        console.log('Available skills:');
        const skills = localRegistry.listSkills();
        if (skills.length === 0) {
          console.log(chalk.yellow('  No skills in local registry.'));
          console.log(`  Run ${chalk.cyan('skill new <slug>')} to create one.`);
        } else {
          for (const skill of skills.slice(0, 10)) {
            console.log(`  ${chalk.cyan(skill.slug)}`);
          }
          if (skills.length > 10) {
            console.log(chalk.gray(`  ... and ${skills.length - 10} more`));
          }
        }
        process.exit(1);
      }

      // Ensure the SKILL.md working copy exists in the registry
      const skillData = localRegistry.getSkill(slug);
      if (!skillData) {
        console.log(chalk.red(`Error: Could not read skill '${slug}' from registry.`));
        process.exit(1);
      }

      // The getSkill call ensures SKILL.md exists via putSkill/migration,
      // but let's also ensure it's written at the registry path
      const skillFilePath = localRegistry.getSkillFilePath(slug);

      // Determine editor
      const editor = options.editor || auth.getEditor();

      console.log(`Opening ${chalk.cyan(skillFilePath)} in ${editor}...`);

      // Open editor
      let command: string;
      let args: string[];

      try {
        const parsed = parseEditorCommand(editor);
        command = parsed.command;
        args = parsed.args;
      } catch (error) {
        console.error(chalk.red('Error:'), error instanceof Error ? error.message : error);
        console.log(`Try setting a different editor with ${chalk.cyan('skill config editor <name>')}`);
        process.exit(1);
      }

      const child = spawn(command, [...args, skillFilePath], {
        stdio: 'ignore',
        detached: true,
      });

      // Detach so the CLI doesn't wait for the editor to close
      child.unref();

      child.on('error', (err) => {
        console.error(chalk.red(`Error opening editor: ${err.message}`));
        console.log(`Try setting a different editor with ${chalk.cyan('skill config editor <name>')}`);
        process.exit(1);
      });
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });
