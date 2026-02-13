import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import * as config from "../lib/config.js";
import * as localRegistry from "../lib/local-registry/index.js";
import * as fs from "../lib/fs.js";
import * as indexGen from "../lib/index-gen.js";
import { META_SKILL_CONTENT } from "../lib/meta-skill.js";
import type { SkillMeta } from "../types.js";

export const syncCommand = new Command("sync")
  .description("Sync all configured skills from local registry to project")
  .action(async () => {
    try {
      // Check if initialized
      if (!config.configExists()) {
        console.log(chalk.red("Error: Not in a skills project."));
        console.log(`Run ${chalk.cyan("skill init")} first.`);
        process.exit(1);
      }

      const skillsConfig = config.readConfig();

      if (skillsConfig.skills.length === 0) {
        console.log(chalk.yellow("No skills configured."));
        console.log(`Run ${chalk.cyan("skill add <slug>")} to add skills.`);
        return;
      }

      const spinner = ora("Syncing skills...").start();

      // Ensure install directory exists
      fs.ensureDir(config.getInstallPath());

      // Track statistics
      let updated = 0;
      const errors: Array<{ slug: string; error: string }> = [];
      const skills: SkillMeta[] = [];
      const syncedSlugs: string[] = [];

      // Process each skill — always install latest from registry
      for (const skillEntry of skillsConfig.skills) {
        const { slug } = skillEntry;

        // Check if skill exists in local registry
        if (!localRegistry.skillExists(slug)) {
          errors.push({
            slug,
            error: `Not found in local cache. Run ${chalk.cyan(`skill new ${slug}`)} or ${chalk.cyan("skill import")}`,
          });
          continue;
        }

        // Get the skill content from local registry
        const skillData = localRegistry.getSkill(slug);
        if (!skillData) {
          errors.push({
            slug,
            error: `Failed to read from cache (possibly corrupted)`,
          });
          continue;
        }

        // Build metadata for project install
        const meta: Omit<SkillMeta, "sha256"> = {
          slug,
          name: skillData.meta.name,
          description: skillData.meta.description,
          tags: skillData.meta.tags,
          compat: skillData.meta.compat,
        };

        // Write skill to project
        fs.writeSkill(
          {
            slug,
            content: skillData.content,
            sha256: skillData.sha256,
          },
          meta,
        );
        updated++;

        skills.push({ ...meta, sha256: skillData.sha256 });
        syncedSlugs.push(slug);
      }

      // Write system (meta) skill
      fs.writeSystemSkill(META_SKILL_CONTENT);

      // Generate SKILLS_INDEX.md
      indexGen.writeIndex(skills);

      // Update agent config files with skills discovery section
      fs.updateClaudeMd();
      fs.updateAgentsMd();
      fs.updateCursorRules();

      // Sync skills to .claude/skills/ as symlinks for native agent loading
      fs.syncClaudeNativeSkills(syncedSlugs);

      spinner.succeed("Sync complete!");

      // Print summary
      console.log("");
      console.log(`Synced ${chalk.cyan(updated)} skills.`);

      // Print errors if any
      if (errors.length > 0) {
        console.log("");
        console.log(chalk.red(`${errors.length} skill(s) failed:`));
        for (const error of errors) {
          console.log(`  ${chalk.red("✗")} ${error.slug}: ${error.error}`);
        }
      }
    } catch (error) {
      console.error(
        chalk.red("Error:"),
        error instanceof Error ? error.message : error,
      );
      process.exit(1);
    }
  });
