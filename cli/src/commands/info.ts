import { Command } from 'commander';
import chalk from 'chalk';
import * as localRegistry from '../lib/local-registry/index.js';

export const infoCommand = new Command('info')
  .description('Show detailed information about a skill')
  .argument('<slug>', 'Skill slug')
  .option('-v, --version <version>', 'Show info for a specific version')
  .action(async (slug: string, options) => {
    try {
      // Check if skill exists in local registry
      if (!localRegistry.skillExists(slug)) {
        console.log(chalk.red(`Error: Skill '${slug}' not found in local cache.`));
        console.log('');
        console.log('To create this skill:');
        console.log(`  ${chalk.cyan(`skills new ${slug}`)}`);
        process.exit(1);
      }

      // Get skill info
      const skillInfo = localRegistry.getSkillInfo(slug);
      if (!skillInfo) {
        console.log(chalk.red(`Error: Could not read skill '${slug}'.`));
        process.exit(1);
      }

      const latestVersion = localRegistry.getLatestVersion(slug);

      // Display info
      console.log('');
      console.log(chalk.bold.cyan(slug));
      console.log('');
      console.log(`${chalk.bold('Name:')}        ${skillInfo.meta.name}`);
      console.log(`${chalk.bold('Latest:')}      ${latestVersion}`);

      if (skillInfo.meta.description) {
        console.log(`${chalk.bold('Description:')} ${skillInfo.meta.description}`);
      }

      if (skillInfo.meta.tags.length > 0) {
        console.log(`${chalk.bold('Tags:')}        ${skillInfo.meta.tags.join(', ')}`);
      }

      if (skillInfo.meta.compat.length > 0) {
        console.log(`${chalk.bold('Compat:')}      ${skillInfo.meta.compat.join(', ')}`);
      }

      console.log(`${chalk.bold('Updated:')}     ${new Date(skillInfo.meta.updatedAt).toLocaleString()}`);

      // Version history
      if (skillInfo.versions.length > 0) {
        console.log('');
        console.log(chalk.bold('Cached Versions:'));

        const versionsToShow = options.version
          ? skillInfo.versions.filter((v) => v.version === options.version)
          : skillInfo.versions.slice(0, 5);

        if (options.version && versionsToShow.length === 0) {
          console.log(chalk.yellow(`  Version '${options.version}' not cached.`));
          console.log(`  Available: ${skillInfo.versions.map((v) => v.version).join(', ')}`);
        } else {
          for (const ver of versionsToShow) {
            const isLatest = ver.version === latestVersion;
            const latest = isLatest ? chalk.green(' (latest)') : '';
            const date = new Date(ver.createdAt).toLocaleDateString();
            const provenance = ver.provenance.kind === 'local'
              ? chalk.gray(` [${ver.provenance.source}]`)
              : chalk.blue(` [from ${ver.provenance.source}]`);

            console.log(`  v${ver.version}${latest} - ${date}${provenance}`);

            if (ver.changelog) {
              console.log(chalk.gray(`    ${ver.changelog}`));
            }
          }

          if (!options.version && skillInfo.versions.length > 5) {
            console.log(chalk.gray(`  ... and ${skillInfo.versions.length - 5} more versions`));
          }
        }
      }

      // Show content preview for specific version
      if (options.version) {
        const versionData = localRegistry.getVersion(slug, options.version);
        if (versionData) {
          console.log('');
          console.log(chalk.bold('Content Preview:'));
          const preview = versionData.content.split('\n').slice(0, 10).join('\n');
          console.log(chalk.gray(preview));
          if (versionData.content.split('\n').length > 10) {
            console.log(chalk.gray('...'));
          }
        }
      }
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });
