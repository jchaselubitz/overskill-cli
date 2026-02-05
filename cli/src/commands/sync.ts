import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import * as config from '../lib/config.js';
import * as localRegistry from '../lib/local-registry/index.js';
import * as lockfile from '../lib/lockfile.js';
import * as fs from '../lib/fs.js';
import * as indexGen from '../lib/index-gen.js';
import { META_SKILL_CONTENT } from '../lib/meta-skill.js';
import type { SkillMeta, LockedSkill } from '../types.js';

export const syncCommand = new Command('sync')
  .description('Sync all configured skills from local registry to project')
  .option('-f, --force', 'Force re-install even if unchanged')
  .action(async (options) => {
    try {
      // Check if initialized
      if (!config.configExists()) {
        console.log(chalk.red('Error: Not in a skills project.'));
        console.log(`Run ${chalk.cyan('skills init')} first.`);
        process.exit(1);
      }

      const skillsConfig = config.readConfig();

      if (skillsConfig.skills.length === 0) {
        console.log(chalk.yellow('No skills configured.'));
        console.log(`Run ${chalk.cyan('skills add <slug>')} to add skills.`);
        return;
      }

      const spinner = ora('Syncing skills...').start();

      // Ensure install directory exists
      fs.ensureDir(config.getInstallPath());

      // Read existing lockfile
      const existingLock = lockfile.readLockfile();

      // Track statistics
      let updated = 0;
      let unchanged = 0;
      const errors: Array<{ slug: string; error: string }> = [];
      const skills: SkillMeta[] = [];
      const lockedSkills: LockedSkill[] = [];

      // Process each skill
      for (const skillEntry of skillsConfig.skills) {
        const { slug, version: constraint } = skillEntry;

        // Check if skill exists in local registry
        if (!localRegistry.skillExists(slug)) {
          errors.push({
            slug,
            error: `Not found in local cache. Run 'skills new ${slug}' or 'skills cache import'`,
          });
          continue;
        }

        // Get locked version if exists
        const locked = existingLock?.skills.find((s) => s.slug === slug);

        // Resolve version to install
        let resolvedVersion: string | null = null;

        if (locked && !options.force) {
          // Prefer locked version for reproducibility
          if (localRegistry.versionExists(slug, locked.version)) {
            resolvedVersion = locked.version;
          } else {
            // Locked version not in cache, resolve from constraint
            resolvedVersion = localRegistry.resolveVersion(slug, constraint);
          }
        } else {
          // No lock or force flag, resolve from constraint
          resolvedVersion = localRegistry.resolveVersion(slug, constraint);
        }

        if (!resolvedVersion) {
          const availableVersions = localRegistry.getVersionStrings(slug);
          errors.push({
            slug,
            error: constraint
              ? `No cached version satisfies '${constraint}'. Available: ${availableVersions.join(', ')}`
              : `No versions cached`,
          });
          continue;
        }

        // Get the skill content from local registry
        const skillData = localRegistry.getVersion(slug, resolvedVersion);
        if (!skillData) {
          errors.push({
            slug,
            error: `Failed to read version ${resolvedVersion} from cache (possibly corrupted)`,
          });
          continue;
        }

        // Check if changed
        const hasChanged =
          options.force ||
          !locked ||
          locked.sha256 !== skillData.sha256 ||
          locked.version !== resolvedVersion;

        if (hasChanged) {
          // Build metadata for project install
          const meta: Omit<SkillMeta, 'sha256'> = {
            slug,
            registry: 'local',
            version: resolvedVersion,
            name: skillData.meta.name,
            description: skillData.meta.description,
            tags: skillData.meta.tags,
            compat: skillData.meta.compat,
          };

          // Write skill to project
          fs.writeSkill(
            {
              registry: 'local',
              slug,
              version: resolvedVersion,
              content: skillData.content,
              sha256: skillData.sha256,
            },
            meta
          );
          updated++;

          skills.push({ ...meta, sha256: skillData.sha256 });
        } else {
          // Read existing metadata from project
          const existingMeta = fs.readSkillMeta(slug);
          if (existingMeta) {
            skills.push(existingMeta);
          }
          unchanged++;
        }

        // Add to lock
        lockedSkills.push({
          slug,
          registry: 'local',
          version: resolvedVersion,
          sha256: skillData.sha256,
        });
      }

      // Write system (meta) skill
      fs.writeSystemSkill(META_SKILL_CONTENT);

      // Generate SKILLS_INDEX.md
      indexGen.writeIndex(skills);

      // Write lockfile
      lockfile.writeLockfile(lockfile.createLockfile(lockedSkills));

      spinner.succeed('Sync complete!');

      // Print summary
      const totalSuccess = updated + unchanged;
      console.log('');
      console.log(`Synced ${chalk.cyan(totalSuccess)} skills.`);
      console.log(`  ${chalk.green(updated)} updated`);
      console.log(`  ${chalk.gray(unchanged)} unchanged`);

      // Print errors if any
      if (errors.length > 0) {
        console.log('');
        console.log(chalk.red(`${errors.length} skill(s) failed:`));
        for (const error of errors) {
          console.log(`  ${chalk.red('✗')} ${error.slug}: ${error.error}`);
        }
      }
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });
