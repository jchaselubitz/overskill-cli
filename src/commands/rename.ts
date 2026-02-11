import { Command } from 'commander';
import * as nodeFs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';
import * as readline from 'readline';
import chalk from 'chalk';
import ora from 'ora';
import * as localRegistry from '../lib/local-registry/index.js';
import * as projectConfig from '../lib/config.js';
import * as projectFs from '../lib/fs.js';
import * as indexGen from '../lib/index-gen.js';

function createQuestionInterface(): readline.Interface {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
}

async function promptForNewName(params: { currentName: string }): Promise<string> {
  const { currentName } = params;
  const rl = createQuestionInterface();

  const question = (prompt: string): Promise<string> =>
    new Promise(resolve => {
      rl.question(prompt, answer => resolve(answer));
    });

  const answer = await question(`New name [${currentName}]: `);
  rl.close();

  const trimmed = answer.trim();
  return trimmed || currentName;
}

function slugFromName(params: { name: string }): string {
  const { name } = params;
  const normalized = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return normalized.replace(/^-+|-+$/g, '');
}

function validateSlug(params: { slug: string }): void {
  const { slug } = params;

  if (!slug) {
    throw new Error('Slug cannot be empty after normalization.');
  }

  if (!/^[a-z0-9-]+$/.test(slug)) {
    throw new Error(
      "Slug must be lowercase alphanumeric with hyphens only (generated from the new name)."
    );
  }
}

function renameInRegistry(params: { oldSlug: string; newSlug: string; newName: string }): void {
  const { oldSlug, newSlug, newName } = params;

  const existingMeta = localRegistry.readMeta(oldSlug);
  if (!existingMeta) {
    throw new Error(`Could not read metadata for '${oldSlug}' in local registry.`);
  }

  // Rename the skill directory if the slug changed
  if (oldSlug !== newSlug) {
    const oldDir = localRegistry.getSkillDir(oldSlug);
    const newDir = localRegistry.getSkillDir(newSlug);

    if (!nodeFs.existsSync(oldDir)) {
      throw new Error(`Skill directory not found in registry: ${oldDir}`);
    }

    if (nodeFs.existsSync(newDir)) {
      throw new Error(
        `Target slug '${newSlug}' already exists in registry at ${newDir}. Choose a different name.`
      );
    }

    nodeFs.renameSync(oldDir, newDir);
  }

  const updatedMeta = {
    ...existingMeta,
    slug: newSlug,
    name: newName
  };

  localRegistry.writeMeta(newSlug, updatedMeta);
}

function renameInProject(params: { oldSlug: string; newSlug: string; newName: string }): void {
  const { oldSlug, newSlug, newName } = params;

  if (!projectConfig.configExists()) {
    return;
  }

  const skillsConfig = projectConfig.readConfig();
  let configChanged = false;

  const updatedSkills = skillsConfig.skills.map(skill => {
    if (skill.slug !== oldSlug) {
      return skill;
    }

    configChanged = true;
    return {
      ...skill,
      slug: newSlug
    };
  });

  if (configChanged) {
    projectConfig.writeConfig({
      ...skillsConfig,
      skills: updatedSkills
    });
  }

  // Rename installed skill directory in the project, if present
  const projectOldDir = projectFs.getSkillDir(oldSlug);
  const projectNewDir = projectFs.getSkillDir(newSlug);

  if (nodeFs.existsSync(projectOldDir)) {
    if (nodeFs.existsSync(projectNewDir)) {
      throw new Error(
        `Cannot rename project skill directory: target '${newSlug}' already exists at ${projectNewDir}.`
      );
    }

    nodeFs.renameSync(projectOldDir, projectNewDir);

    // Update project meta.yaml slug and name
    const projectMeta = projectFs.readSkillMeta(newSlug);
    if (projectMeta) {
      const updatedProjectMeta = {
        ...projectMeta,
        slug: newSlug,
        name: newName
      };
      const metaPath = path.join(projectFs.getSkillDir(newSlug), 'meta.yaml');
      const content = yaml.stringify(updatedProjectMeta, { lineWidth: 0 });
      nodeFs.writeFileSync(metaPath, content, 'utf-8');
    }
  }

  // Regenerate SKILLS_INDEX.md if we are in a project
  indexGen.regenerateIndex();
}

export const renameCommand = new Command('rename')
  .description('Rename a skill (updates slug and display name)')
  .argument('<slug>', 'Current skill slug')
  .action(async (slug: string) => {
    try {
      if (!localRegistry.skillExists(slug)) {
        console.log(chalk.red(`Error: Skill '${slug}' not found in local registry.`));
        console.log('');
        console.log('To create this skill:');
        console.log(`  ${chalk.cyan(`skill new ${slug}`)}`);
        process.exit(1);
      }

      const skillInfo = localRegistry.getSkillInfo(slug);
      if (!skillInfo) {
        console.log(chalk.red(`Error: Could not read skill '${slug}' from local registry.`));
        process.exit(1);
      }

      const currentName = skillInfo.meta.name || slug;
      console.log('');
      console.log(chalk.bold('Rename skill'));
      console.log(`  ${chalk.bold('Current slug:')} ${chalk.cyan(slug)}`);
      console.log(`  ${chalk.bold('Current name:')} ${currentName}`);
      console.log('');

      const newName = await promptForNewName({ currentName });
      if (newName === currentName) {
        console.log(chalk.yellow('Name unchanged. Nothing to do.'));
        return;
      }

      const newSlug = slugFromName({ name: newName });

      try {
        validateSlug({ slug: newSlug });
      } catch (error) {
        console.log(
          chalk.red(
            `Error: Could not derive a valid slug from '${newName}'. ` +
              (error instanceof Error ? error.message : String(error))
          )
        );
        process.exit(1);
      }

      if (newSlug !== slug && localRegistry.skillExists(newSlug)) {
        console.log(
          chalk.red(
            `Error: A skill with slug '${newSlug}' already exists in the local registry. ` +
              'Choose a different name.'
          )
        );
        process.exit(1);
      }

      const spinner = ora('Renaming skill...').start();

      try {
        renameInRegistry({ oldSlug: slug, newSlug, newName });
        renameInProject({ oldSlug: slug, newSlug, newName });

        spinner.succeed(`Renamed skill to ${chalk.cyan(newSlug)}`);
        console.log('');
        console.log('Updated details:');
        console.log(`  ${chalk.bold('Slug:')}        ${chalk.cyan(newSlug)}`);
        console.log(`  ${chalk.bold('Name:')}        ${newName}`);
      } catch (error) {
        spinner.fail('Failed to rename skill');
        throw error;
      }
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

