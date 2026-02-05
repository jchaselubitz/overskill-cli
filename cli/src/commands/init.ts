import { Command } from 'commander';
import * as path from 'path';
import chalk from 'chalk';
import * as config from '../lib/config.js';
import * as auth from '../lib/auth.js';
import { updateGitignore, ensureDir } from '../lib/fs.js';
import { ensureRegistryStructure } from '../lib/local-registry/index.js';
import type { SkillsConfig, SkillSource } from '../types.js';

export const initCommand = new Command('init')
  .description('Initialize a new skills configuration in the current directory')
  .option('--cloud', 'Include a cloud registry source')
  .option('-u, --url <url>', 'API URL for the cloud registry (requires --cloud)')
  .option('-r, --registry <slug>', 'Cloud registry slug (requires --cloud)')
  .option('-p, --path <path>', 'Install path for skills', '.skills')
  .action(async (options) => {
    try {
      // Check if already initialized
      if (config.configExists()) {
        console.log(chalk.yellow('Skills configuration already exists in this directory.'));
        console.log('Use `skills sync` to sync skills or edit .skills.yaml manually.');
        return;
      }

      const installPath = options.path || auth.getDefaultInstallPath();

      // Build sources list
      const sources: SkillSource[] = [];

      // Always add local source as default
      sources.push(config.createLocalSource('local'));

      // Optionally add cloud source
      if (options.cloud) {
        const apiUrl = options.url || auth.getApiUrl();
        if (!apiUrl) {
          console.log(chalk.red('Error: API URL is required for cloud source.'));
          console.log('Provide it with --url or set it globally with `skills config api_url <url>`');
          process.exit(1);
        }

        const registry = options.registry;
        if (!registry) {
          console.log(chalk.red('Error: Registry slug is required for cloud source.'));
          console.log('Provide it with --registry <slug>');
          process.exit(1);
        }

        sources.push(config.createCloudSource('cloud', registry, apiUrl));
      }

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

      // Ensure local registry structure exists
      ensureRegistryStructure();

      // Update .gitignore
      updateGitignore(installPath);

      console.log(chalk.green('Initialized skills configuration!'));
      console.log('');
      console.log('Created files:');
      console.log(`  ${chalk.cyan('.skills.yaml')} - Configuration file`);
      console.log(`  ${chalk.cyan(installPath + '/')} - Skills install directory`);
      console.log('');
      console.log('Next steps:');
      console.log(`  ${chalk.cyan('skills new <slug>')}      Create a new skill`);
      console.log(`  ${chalk.cyan('skills add <slug>')}      Add an existing skill from cache`);
      console.log(`  ${chalk.cyan('skills sync')}            Install skills to ${installPath}/`);

      if (options.cloud) {
        console.log('');
        console.log('Cloud registry configured:');
        console.log(`  ${chalk.cyan('skills login')}           Authenticate with cloud registry`);
        console.log(`  ${chalk.cyan('skills cache pull')}      Pull skills from cloud to local cache`);
      }
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });
