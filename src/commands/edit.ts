import { Command } from 'commander';
import { spawn } from 'child_process';
import * as path from 'path';
import chalk from 'chalk';
import * as config from '../lib/config.js';
import * as fs from '../lib/fs.js';
import * as auth from '../lib/auth.js';
import { parseEditorCommand } from '../lib/editor.js';

export const editCommand = new Command('edit')
  .description('Open a skill for editing in your default editor')
  .argument('<slug>', 'Skill slug to edit')
  .option('-e, --editor <editor>', 'Editor to use')
  .action(async (slug: string, options) => {
    try {
      // Check if initialized
      if (!config.configExists()) {
        console.log(chalk.red('Error: Not in a skills project.'));
        console.log(`Run ${chalk.cyan('skill init')} first.`);
        process.exit(1);
      }

      // Check if skill exists locally
      if (!fs.skillExists(slug)) {
        console.log(chalk.red(`Error: Skill '${slug}' not found locally.`));
        console.log(`Run ${chalk.cyan('skill sync')} first.`);
        process.exit(1);
      }

      const skillDir = fs.getSkillDir(slug);
      const skillPath = path.join(skillDir, 'SKILL.md');

      // Determine editor
      const editor = options.editor || auth.getEditor();

      console.log(`Opening ${chalk.cyan(skillPath)} in ${editor}...`);

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

      const child = spawn(command, [...args, skillPath], { stdio: 'inherit' });

      child.on('exit', (code) => {
        if (code === 0) {
          // Mark as modified
          fs.markSkillModified(slug);

          console.log('');
          console.log(chalk.green(`Edited ${slug} locally.`));
          console.log(`Run ${chalk.cyan(`skill update ${slug}`)} to save changes to the registry.`);
        } else {
          console.log(chalk.yellow('Editor exited with non-zero code.'));
        }
      });

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
