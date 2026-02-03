import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import * as config from '../lib/config.js';
import * as api from '../lib/api.js';
import * as lockfile from '../lib/lockfile.js';
import * as fs from '../lib/fs.js';
import * as indexGen from '../lib/index-gen.js';
import { META_SKILL_CONTENT } from '../lib/meta-skill.js';
import type { SkillMeta, LockedSkill } from '../types.js';

export const syncCommand = new Command('sync')
  .description('Sync all configured skills from remote registries')
  .option('-f, --force', 'Force re-download even if unchanged')
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

      // Build sync request
      const syncRequest = skillsConfig.skills.map((skill) => {
        const source = config.getSource(skill.source);
        if (!source) {
          throw new Error(`Source '${skill.source}' not found in config`);
        }
        return {
          registry: source.registry,
          slug: skill.slug,
          version: skill.version,
        };
      });

      // Call sync API
      const response = await api.sync(syncRequest);

      // Ensure install directory exists
      fs.ensureDir(config.getInstallPath());

      // Track statistics
      let updated = 0;
      let unchanged = 0;
      const skills: SkillMeta[] = [];
      const lockedSkills: LockedSkill[] = [];

      // Process each skill
      for (const skill of response.skills) {
        const source = skillsConfig.skills.find((s) => s.slug === skill.slug);
        const sourceName = source?.source || 'default';
        const sourceConfig = config.getSource(sourceName);

        // Check if changed
        const hasChanged = options.force || lockfile.hasSkillChanged(
          skill.slug,
          skill.registry,
          skill.sha256
        );

        if (hasChanged) {
          // Write skill to disk
          const meta: Omit<SkillMeta, 'sha256'> = {
            slug: skill.slug,
            registry: skill.registry,
            version: skill.version,
            name: skill.slug, // Will be updated from API if available
            tags: [],
            compat: [],
          };

          // Try to get full metadata
          try {
            const fullSkill = await api.getSkill(skill.registry, skill.slug);
            meta.name = fullSkill.name;
            meta.description = fullSkill.description;
            meta.tags = fullSkill.tags;
            meta.compat = fullSkill.compat;
          } catch {
            // Use defaults if metadata fetch fails
          }

          fs.writeSkill(skill, meta);
          updated++;

          skills.push({ ...meta, sha256: skill.sha256 });
        } else {
          // Read existing metadata
          const existingMeta = fs.readSkillMeta(skill.slug);
          if (existingMeta) {
            skills.push(existingMeta);
          }
          unchanged++;
        }

        // Add to lock
        lockedSkills.push({
          slug: skill.slug,
          registry: skill.registry,
          version: skill.version,
          sha256: skill.sha256,
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
      console.log('');
      console.log(`Synced ${chalk.cyan(response.skills.length)} skills.`);
      console.log(`  ${chalk.green(updated)} updated`);
      console.log(`  ${chalk.gray(unchanged)} unchanged`);

      // Print errors if any
      if (response.errors.length > 0) {
        console.log('');
        console.log(chalk.yellow('Warnings:'));
        for (const error of response.errors) {
          console.log(`  ${chalk.red('!')} ${error.registry}/${error.slug}: ${error.error}`);
        }
      }
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });
