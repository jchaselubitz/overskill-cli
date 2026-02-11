import { Command } from 'commander';
import * as nodefs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import * as config from '../lib/config.js';
import * as fs from '../lib/fs.js';
export const bundleCommand = new Command('bundle')
  .description('Bundle all or selected skills into a single markdown file')
  .argument('[slugs...]', 'Skill slugs to bundle (optional, bundles all if not provided)')
  .option('-o, --output <path>', 'Output file path', 'skills-bundle.md')
  .action(async (slugs: string[], options) => {
    try {
      // Check if initialized
      if (!config.configExists()) {
        console.log(chalk.red('Error: Not in a skills project.'));
        console.log(`Run ${chalk.cyan('skills init')} first.`);
        process.exit(1);
      }

      const skillsToBundle = slugs.length > 0 ? slugs : fs.listLocalSkills();

      if (skillsToBundle.length === 0) {
        console.log(chalk.yellow('No skills to bundle.'));
        return;
      }

      const bundleLines: string[] = [];

      for (const slug of skillsToBundle) {
        const content = fs.readSkillContent(slug);
        if (!content) {
          console.log(chalk.yellow(`Skipping ${slug}: not found locally`));
          continue;
        }

        // Add separator and skill content
        bundleLines.push(`<!-- === SKILL: ${slug} === -->`);
        bundleLines.push('');
        bundleLines.push(content.trim());
        bundleLines.push('');
        bundleLines.push('');
      }

      // Write bundle file
      const projectRoot = config.findProjectRoot() || process.cwd();
      const outputPath = path.isAbsolute(options.output)
        ? options.output
        : path.join(projectRoot, options.output);

      const bundleContent = bundleLines.join('\n');
      nodefs.writeFileSync(outputPath, bundleContent, 'utf-8');

      const sizeKb = (Buffer.byteLength(bundleContent, 'utf-8') / 1024).toFixed(1);

      console.log(
        chalk.green(
          `Bundled ${skillsToBundle.length} skills into ${chalk.cyan(options.output)} (${sizeKb} KB)`
        )
      );
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });
