import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import * as config from '../lib/config.js';
import * as api from '../lib/api.js';
import type { SkillEntry } from '../types.js';

export const addCommand = new Command('add')
  .description('Add one or more skills to the project')
  .argument('<slugs...>', 'Skill slugs to add (can prefix with source: e.g., org/my-skill)')
  .option('-s, --source <name>', 'Source name to use (default: first configured source)')
  .option('-v, --version <constraint>', 'Version constraint (e.g., ">=1.0.0", "^2.0.0")')
  .option('--no-sync', 'Skip automatic sync after adding')
  .action(async (slugs: string[], options) => {
    try {
      // Check if initialized
      if (!config.configExists()) {
        console.log(chalk.red('Error: Not in a skills project.'));
        console.log(`Run ${chalk.cyan('skills init')} first.`);
        process.exit(1);
      }

      const skillsConfig = config.readConfig();
      const addedSkills: string[] = [];

      for (const input of slugs) {
        const spinner = ora(`Adding ${input}...`).start();

        try {
          // Parse source/slug format
          let sourceName: string;
          let skillSlug: string;

          if (input.includes('/')) {
            const parts = input.split('/');
            sourceName = parts[0];
            skillSlug = parts.slice(1).join('/');
          } else {
            sourceName = options.source || skillsConfig.sources[0]?.name;
            skillSlug = input;
          }

          if (!sourceName) {
            spinner.fail(`No source configured. Add a source in .skills.yaml`);
            continue;
          }

          const source = config.getSource(sourceName);
          if (!source) {
            spinner.fail(`Source '${sourceName}' not found in config`);
            continue;
          }

          // Verify skill exists
          try {
            const skill = await api.getSkill(source.registry, skillSlug);

            // Check if already added
            const existing = skillsConfig.skills.find(
              (s) => s.slug === skillSlug && s.source === sourceName
            );

            if (existing) {
              spinner.warn(`${skillSlug} already added`);
              continue;
            }

            // Add to config
            const entry: SkillEntry = {
              slug: skillSlug,
              source: sourceName,
            };

            if (options.version) {
              entry.version = options.version;
            }

            config.addSkill(entry);
            addedSkills.push(`${source.registry}/${skillSlug}`);

            spinner.succeed(
              `Added ${chalk.cyan(skillSlug)} from ${source.registry} (v${skill.version})`
            );
          } catch (error) {
            spinner.fail(
              `Skill '${skillSlug}' not found in registry '${source.registry}'`
            );
          }
        } catch (error) {
          spinner.fail(error instanceof Error ? error.message : String(error));
        }
      }

      // Sync if skills were added
      if (addedSkills.length > 0 && options.sync !== false) {
        console.log('');
        console.log('Running sync...');

        // Import sync command and run it
        const { syncCommand } = await import('./sync.js');
        await syncCommand.parseAsync(['node', 'skills', 'sync']);
      }
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });
