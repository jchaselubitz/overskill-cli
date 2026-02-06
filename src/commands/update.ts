import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import * as config from '../lib/config.js';
import * as api from '../lib/api.js';
import * as lockfile from '../lib/lockfile.js';
import * as fs from '../lib/fs.js';
import * as semverLib from '../lib/semver.js';
import * as indexGen from '../lib/index-gen.js';
import type { SkillMeta } from '../types.js';

export const updateCommand = new Command('update')
  .description('Update skills to their latest versions')
  .argument('[slug]', 'Skill slug to update (optional, updates all if not provided)')
  .option('--check', 'Only check for updates, do not install')
  .action(async (slug?: string, options?: { check?: boolean }) => {
    try {
      // Check if initialized
      if (!config.configExists()) {
        console.log(chalk.red('Error: Not in a skills project.'));
        console.log(`Run ${chalk.cyan('skills init')} first.`);
        process.exit(1);
      }

      const skillsConfig = config.readConfig();
      const lock = lockfile.readLockfile();

      if (!lock || lock.skills.length === 0) {
        console.log(chalk.yellow('No skills to update.'));
        console.log(`Run ${chalk.cyan('skills sync')} first.`);
        return;
      }

      const skillsToCheck = slug
        ? lock.skills.filter((s) => s.slug === slug)
        : lock.skills;

      if (skillsToCheck.length === 0) {
        console.log(chalk.yellow(`Skill '${slug}' not found.`));
        return;
      }

      const spinner = ora('Checking for updates...').start();

      interface UpdateInfo {
        slug: string;
        registry: string;
        currentVersion: string;
        latestVersion: string;
        constraint?: string;
      }

      const updates: UpdateInfo[] = [];

      for (const locked of skillsToCheck) {
        try {
          // Get skill config for version constraint
          const skillConfig = skillsConfig.skills.find((s) => s.slug === locked.slug);
          const constraint = skillConfig?.version;

          // Fetch remote skill
          const remoteSkill = await api.getSkill(locked.registry, locked.slug);

          // Check if update available
          if (semverLib.isGreaterThan(remoteSkill.version, locked.version)) {
            // Check constraint if present
            if (constraint && !semverLib.satisfies(remoteSkill.version, constraint)) {
              continue; // Latest doesn't satisfy constraint
            }

            updates.push({
              slug: locked.slug,
              registry: locked.registry,
              currentVersion: locked.version,
              latestVersion: remoteSkill.version,
              constraint,
            });
          }
        } catch {
          // Skip skills that fail to fetch
        }
      }

      spinner.stop();

      if (updates.length === 0) {
        console.log(chalk.green('All skills are up to date.'));
        return;
      }

      // Show available updates
      console.log(chalk.bold('Updates available:'));
      console.log('');

      for (const update of updates) {
        const constraintInfo = update.constraint ? chalk.gray(` (constraint: ${update.constraint})`) : '';
        console.log(
          `  ${chalk.cyan(update.slug.padEnd(25))} ${update.currentVersion} → ${chalk.green(update.latestVersion)}${constraintInfo}`
        );
      }

      console.log('');

      if (options?.check) {
        console.log(`Run ${chalk.cyan('skills update')} to install updates.`);
        return;
      }

      // Install updates
      const installSpinner = ora('Installing updates...').start();

      const updatedSkills: SkillMeta[] = [];

      for (const update of updates) {
        // Fetch full skill with content
        const remoteSkill = await api.getSkill(update.registry, update.slug);

        if (!remoteSkill.content) {
          continue;
        }

        const hash = await fs.computeHash(remoteSkill.content);

        // Write to disk
        const meta: Omit<SkillMeta, 'sha256'> = {
          slug: update.slug,
          registry: update.registry,
          version: update.latestVersion,
          name: remoteSkill.name,
          description: remoteSkill.description,
          tags: remoteSkill.tags,
          compat: remoteSkill.compat,
        };

        fs.writeSkill(
          {
            slug: update.slug,
            registry: update.registry,
            version: update.latestVersion,
            content: remoteSkill.content,
            sha256: hash,
          },
          meta
        );

        // Update lockfile
        lockfile.updateLockedSkill({
          slug: update.slug,
          registry: update.registry,
          version: update.latestVersion,
          sha256: hash,
        });

        updatedSkills.push({ ...meta, sha256: hash });
      }

      // Regenerate index
      indexGen.regenerateIndex();

      installSpinner.succeed(`Updated ${updates.length} skill(s)`);

      // Print summary
      for (const update of updates) {
        console.log(
          `  ${chalk.cyan(update.slug)}: ${update.currentVersion} → ${chalk.green(update.latestVersion)}`
        );
      }
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });
