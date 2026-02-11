import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import * as fs from "fs";
import * as path from "path";
import * as yaml from "yaml";
import {
  getSkillsDir,
  getSkillDir,
  getSkillFilePath,
  registryExists,
} from "../lib/local-registry/paths.js";
import { readObject } from "../lib/local-registry/objects.js";
import { readMeta, writeMeta } from "../lib/local-registry/skills.js";

export const upgradeCommand = new Command("upgrade")
  .description(
    "Migrate local registry from v1 (versions in objects/) to v2 (SKILL.md in skill folders)",
  )
  .action(async () => {
    try {
      if (!registryExists()) {
        console.log(chalk.yellow("No local registry found. Nothing to upgrade."));
        return;
      }

      const skillsDir = getSkillsDir();
      if (!fs.existsSync(skillsDir)) {
        console.log(chalk.yellow("No skills in registry. Nothing to upgrade."));
        return;
      }

      const slugs = fs.readdirSync(skillsDir).filter((name) => {
        const stat = fs.statSync(path.join(skillsDir, name));
        return stat.isDirectory();
      });

      if (slugs.length === 0) {
        console.log(chalk.yellow("No skills in registry. Nothing to upgrade."));
        return;
      }

      const spinner = ora("Upgrading registry...").start();

      let migrated = 0;
      let upToDate = 0;
      const errors: Array<{ slug: string; error: string }> = [];

      for (const slug of slugs) {
        const skillDir = getSkillDir(slug);
        const versionsPath = path.join(skillDir, "versions.yaml");
        const skillFilePath = getSkillFilePath(slug);
        const hasVersionsFile = fs.existsSync(versionsPath);
        const hasSkillFile = fs.existsSync(skillFilePath);

        // readMeta handles sha256 backfill from versions.yaml automatically
        const meta = readMeta(slug);

        if (!meta || !meta.sha256) {
          errors.push({
            slug,
            error: "No metadata or sha256 found — cannot migrate",
          });
          continue;
        }

        const needsMigration = hasVersionsFile || !hasSkillFile;

        if (!needsMigration) {
          upToDate++;
          continue;
        }

        // Read content from object store
        const content = readObject(meta.sha256);
        if (!content) {
          errors.push({
            slug,
            error: `Object ${meta.sha256.slice(0, 12)}… not found in store`,
          });
          continue;
        }

        // Write SKILL.md working copy
        if (!hasSkillFile) {
          fs.writeFileSync(skillFilePath, content, "utf-8");
        }

        // Ensure meta.yaml has sha256 (readMeta already did writeMeta if needed,
        // but let's be explicit)
        writeMeta(slug, meta);

        // Remove legacy versions.yaml
        if (hasVersionsFile) {
          fs.unlinkSync(versionsPath);
        }

        migrated++;
      }

      spinner.succeed("Upgrade complete!");

      console.log("");
      console.log(`Processed ${chalk.cyan(slugs.length)} skills.`);
      if (migrated > 0) {
        console.log(`  ${chalk.green(migrated)} migrated to v2`);
      }
      if (upToDate > 0) {
        console.log(`  ${chalk.gray(upToDate)} already up-to-date`);
      }

      if (errors.length > 0) {
        console.log("");
        console.log(chalk.red(`${errors.length} skill(s) had errors:`));
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
