import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import * as yaml from 'yaml';
import * as config from '../lib/config.js';
import * as localRegistry from '../lib/local-registry/index.js';
import * as fs from '../lib/fs.js';
import * as indexGen from '../lib/index-gen.js';

function extractDescriptionFromSkillContent(content: string): string | undefined {
  const match = content.match(/^---\n([\s\S]*?)\n---(?:\n|$)/);
  if (!match) {
    return undefined;
  }

  try {
    const frontmatter = yaml.parse(match[1]);
    if (!frontmatter || typeof frontmatter !== 'object') {
      return undefined;
    }

    for (const [key, value] of Object.entries(frontmatter as Record<string, unknown>)) {
      if (key.toLowerCase() === 'description' && typeof value === 'string') {
        return value;
      }
    }
  } catch {
    return undefined;
  }

  return undefined;
}

export const saveCommand = new Command('save')
  .description('Save local skill changes back to the registry')
  .argument('[slug]', 'Skill slug to save (optional, saves all modified if not provided)')
  .action(async (slug?: string) => {
    try {
      // Check if initialized
      if (!config.configExists()) {
        console.log(chalk.red('Error: Not in a skills project.'));
        console.log(`Run ${chalk.cyan('skill init')} first.`);
        process.exit(1);
      }

      const skillsConfig = config.readConfig();

      // Determine which skills to update
      let skillsToUpdate: string[] = [];

      if (slug) {
        // Specific skill
        if (!fs.skillExists(slug)) {
          console.log(chalk.red(`Error: Skill '${slug}' not found in project.`));
          console.log(`Run ${chalk.cyan('skill sync')} first.`);
          process.exit(1);
        }
        skillsToUpdate = [slug];
      } else {
        // All modified skills
        const localSkills = fs.listLocalSkills();
        for (const localSlug of localSkills) {
          if (fs.isSkillModified(localSlug)) {
            skillsToUpdate.push(localSlug);
          }
        }

        if (skillsToUpdate.length === 0) {
          console.log(chalk.yellow('No modified skills to update.'));
          console.log(`Edit a skill with ${chalk.cyan('skill open <slug>')} first, or specify a slug directly.`);
          return;
        }
      }

      const spinner = ora('Saving changes to registry...').start();

      let updated = 0;
      const errors: Array<{ slug: string; error: string }> = [];

      for (const skillSlug of skillsToUpdate) {
        try {
          // Read content from project
          const content = fs.readSkillContent(skillSlug);
          if (!content) {
            errors.push({ slug: skillSlug, error: 'Could not read SKILL.md from project' });
            continue;
          }

          // Get existing meta from registry (or project)
          const existingMeta = localRegistry.readMeta(skillSlug) || fs.readSkillMeta(skillSlug);
          const name = existingMeta?.name || skillSlug;
          const description = extractDescriptionFromSkillContent(content) ?? existingMeta?.description;
          const tags = existingMeta?.tags || [];
          const compat = existingMeta?.compat || [];

          // Save to local registry
          const { sha256 } = localRegistry.putSkill({
            slug: skillSlug,
            content,
            meta: {
              name,
              description,
              tags,
              compat,
            },
          });

          // Clear modified marker
          fs.unmarkSkillModified(skillSlug);

          updated++;
        } catch (error) {
          errors.push({
            slug: skillSlug,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      // Regenerate index
      indexGen.regenerateIndex();

      spinner.succeed(`Saved ${updated} skill(s) to registry`);

      // Print results
      for (const skillSlug of skillsToUpdate) {
        if (!errors.find((e) => e.slug === skillSlug)) {
          console.log(`  ${chalk.green('✓')} ${chalk.cyan(skillSlug)}`);
        }
      }

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
