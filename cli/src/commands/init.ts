import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import * as config from '../lib/config.js';
import * as auth from '../lib/auth.js';
import { updateGitignore, ensureDir } from '../lib/fs.js';
import type { SkillsConfig, SkillSource } from '../types.js';

export const initCommand = new Command('init')
  .description('Initialize a new skills configuration in the current directory')
  .option('-u, --url <url>', 'API URL for the skills platform')
  .option('-r, --registry <slug>', 'Default registry slug')
  .option('-p, --path <path>', 'Install path for skills', '.skills')
  .action(async (options) => {
    try {
      // Check if already initialized
      if (config.configExists()) {
        console.log(chalk.yellow('Skills configuration already exists in this directory.'));
        console.log('Use `skills sync` to sync skills or edit .skills.yaml manually.');
        return;
      }

      // Get API URL
      let apiUrl = options.url || auth.getApiUrl();
      if (!apiUrl) {
        console.log(chalk.red('Error: API URL is required.'));
        console.log('Provide it with --url or set it globally with `skills config api_url <url>`');
        process.exit(1);
      }

      // Get registry
      const registry = options.registry;
      if (!registry) {
        console.log(chalk.red('Error: Registry slug is required.'));
        console.log('Provide it with --registry <slug>');
        process.exit(1);
      }

      const installPath = options.path || auth.getDefaultInstallPath();

      // Create sources
      const sources: SkillSource[] = [
        {
          name: 'default',
          registry: registry,
          url: apiUrl,
        },
      ];

      // Create config
      const skillsConfig: SkillsConfig = {
        sources,
        install_path: installPath,
        skills: [],
      };

      // Write config
      config.writeConfig(skillsConfig);

      // Create install directory
      const fullInstallPath = path.join(process.cwd(), installPath);
      ensureDir(fullInstallPath);

      // Update .gitignore
      updateGitignore(installPath);

      console.log(chalk.green('Initialized skills configuration!'));
      console.log('');
      console.log('Created files:');
      console.log(`  ${chalk.cyan('.skills.yaml')} - Configuration file`);
      console.log(`  ${chalk.cyan(installPath + '/')} - Skills install directory`);
      console.log('');
      console.log('Next steps:');
      console.log(`  1. Run ${chalk.cyan('skills login')} to authenticate`);
      console.log(`  2. Run ${chalk.cyan('skills list')} to see available skills`);
      console.log(`  3. Run ${chalk.cyan('skills add <slug>')} to add a skill`);
      console.log(`  4. Run ${chalk.cyan('skills sync')} to download skills`);
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });
