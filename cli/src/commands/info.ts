import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import * as config from '../lib/config.js';
import * as api from '../lib/api.js';

export const infoCommand = new Command('info')
  .description('Show detailed information about a skill')
  .argument('<slug>', 'Skill slug')
  .option('-s, --source <name>', 'Source name')
  .action(async (slug: string, options) => {
    try {
      const spinner = ora(`Fetching info for ${slug}...`).start();

      // Determine registry
      let registrySlug: string | undefined;

      if (slug.includes('/')) {
        // Format: registry/slug
        const parts = slug.split('/');
        registrySlug = parts[0];
        slug = parts.slice(1).join('/');
      } else if (options.source) {
        const source = config.getSource(options.source);
        if (source) {
          registrySlug = source.registry;
        }
      } else if (config.configExists()) {
        // Try to find in config
        const skill = config.findSkill(slug);
        if (skill) {
          const source = config.getSource(skill.source);
          if (source) {
            registrySlug = source.registry;
          }
        }
      }

      if (!registrySlug) {
        // Search for it
        const results = await api.search(slug);
        const exact = results.find((r) => r.slug === slug);
        if (exact) {
          registrySlug = exact.registry;
        }
      }

      if (!registrySlug) {
        spinner.fail(`Could not find skill '${slug}'`);
        process.exit(1);
      }

      // Get skill details
      const skill = await api.getSkill(registrySlug, slug);
      const versions = await api.listVersions(registrySlug, slug);

      spinner.stop();

      // Display info
      console.log('');
      console.log(chalk.bold.cyan(`${registrySlug}/${skill.slug}`));
      console.log('');
      console.log(`${chalk.bold('Name:')}        ${skill.name}`);
      console.log(`${chalk.bold('Version:')}     ${skill.version}`);
      console.log(`${chalk.bold('Created by:')}  ${skill.created_by}`);

      if (skill.description) {
        console.log(`${chalk.bold('Description:')} ${skill.description}`);
      }

      if (skill.tags.length > 0) {
        console.log(`${chalk.bold('Tags:')}        ${skill.tags.join(', ')}`);
      }

      if (skill.compat.length > 0) {
        console.log(`${chalk.bold('Compat:')}      ${skill.compat.join(', ')}`);
      }

      if (skill.maintainers && skill.maintainers.length > 0) {
        console.log(`${chalk.bold('Maintainers:')} ${skill.maintainers.join(', ')}`);
      }

      console.log(`${chalk.bold('Updated:')}     ${new Date(skill.updated_at).toLocaleString()}`);

      // Version history
      if (versions.length > 0) {
        console.log('');
        console.log(chalk.bold('Version History:'));

        for (const ver of versions.slice(0, 5)) {
          const latest = ver.is_latest ? chalk.green(' (latest)') : '';
          const date = new Date(ver.created_at).toLocaleDateString();
          console.log(`  v${ver.version}${latest} - ${date} by ${ver.published_by}`);

          if (ver.changelog) {
            console.log(chalk.gray(`    ${ver.changelog}`));
          }
        }

        if (versions.length > 5) {
          console.log(chalk.gray(`  ... and ${versions.length - 5} more versions`));
        }
      }
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });
