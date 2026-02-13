import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import * as nodeFs from "fs";
import * as path from "path";
import { confirm } from "@inquirer/prompts";
import {
  getSkillsDir,
  getSkillDir,
  getSkillFilePath,
  registryExists,
} from "../lib/local-registry/paths.js";
import { readObject } from "../lib/local-registry/objects.js";
import { readMeta, writeMeta } from "../lib/local-registry/skills.js";
import * as config from "../lib/config.js";
import * as localRegistry from "../lib/local-registry/index.js";
import * as fs from "../lib/fs.js";
import * as indexGen from "../lib/index-gen.js";
import { META_SKILL_CONTENT } from "../lib/meta-skill.js";
import type { SkillMeta } from "../types.js";

export const upgradeCommand = new Command("upgrade")
  .description(
    "Upgrade local registry and project to the latest Overskill format",
  )
  .action(async () => {
    try {
      // ── Phase 1: Registry migration (v1 → v2) ───────────────────────
      if (registryExists()) {
        const skillsDir = getSkillsDir();
        if (nodeFs.existsSync(skillsDir)) {
          const slugs = nodeFs.readdirSync(skillsDir).filter((name) => {
            const stat = nodeFs.statSync(path.join(skillsDir, name));
            return stat.isDirectory();
          });

          if (slugs.length > 0) {
            const spinner = ora("Upgrading registry...").start();

            let migrated = 0;
            let upToDate = 0;
            const errors: Array<{ slug: string; error: string }> = [];

            for (const slug of slugs) {
              const skillDir = getSkillDir(slug);
              const versionsPath = path.join(skillDir, "versions.yaml");
              const skillFilePath = getSkillFilePath(slug);
              const hasVersionsFile = nodeFs.existsSync(versionsPath);
              const hasSkillFile = nodeFs.existsSync(skillFilePath);

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

              const content = readObject(meta.sha256);
              if (!content) {
                errors.push({
                  slug,
                  error: `Object ${meta.sha256.slice(0, 12)}… not found in store`,
                });
                continue;
              }

              if (!hasSkillFile) {
                nodeFs.writeFileSync(skillFilePath, content, "utf-8");
              }

              writeMeta(slug, meta);

              if (hasVersionsFile) {
                nodeFs.unlinkSync(versionsPath);
              }

              migrated++;
            }

            spinner.succeed("Registry upgrade complete!");

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
                console.log(
                  `  ${chalk.red("✗")} ${error.slug}: ${error.error}`,
                );
              }
            }
          }
        }
      }

      // ── Phase 2: Project migration ───────────────────────────────────
      if (!config.configExists()) {
        console.log("");
        console.log(
          chalk.gray("No .skills.yaml found — skipping project upgrade."),
        );
        return;
      }

      const skillsConfig = config.readConfig();
      const projectRoot = config.findProjectRoot() || process.cwd();
      const currentInstallPath = skillsConfig.install_path;
      const targetInstallPath = ".claude/skills";
      const lockfilePath = path.join(projectRoot, ".skills.lock");
      const hasLockfile = nodeFs.existsSync(lockfilePath);
      const needsPathMigration = currentInstallPath !== targetInstallPath;

      if (!needsPathMigration && !hasLockfile) {
        console.log("");
        console.log(chalk.green("Project is already up-to-date!"));
        return;
      }

      // Inform the user what needs to change
      console.log("");
      console.log(chalk.yellow("Project upgrade available:"));
      if (needsPathMigration) {
        console.log(
          `  • Install path will change from ${chalk.red(currentInstallPath)} → ${chalk.green(targetInstallPath)}`,
        );
      }
      if (hasLockfile) {
        console.log(
          `  • ${chalk.red(".skills.lock")} will be removed (no longer used)`,
        );
      }
      console.log(
        `  • All skills in .skills.yaml will be synced to ${chalk.cyan(targetInstallPath + "/")}`,
      );
      console.log(`  • Agent config files will be updated`);

      const proceed = await confirm({
        message: "Proceed with project upgrade?",
        default: true,
      });

      if (!proceed) {
        console.log(chalk.gray("Skipped project upgrade."));
        return;
      }

      const spinner = ora("Upgrading project...").start();

      // Update install_path in config
      if (needsPathMigration) {
        skillsConfig.install_path = targetInstallPath;
        config.writeConfig(skillsConfig);
      }

      // Remove .skills.lock
      if (hasLockfile) {
        nodeFs.unlinkSync(lockfilePath);
      }

      // Ensure new install directory exists
      const newInstallFullPath = path.join(projectRoot, targetInstallPath);
      fs.ensureDir(newInstallFullPath);

      // Sync all skills from registry
      let synced = 0;
      const skills: SkillMeta[] = [];
      const syncedSlugs: string[] = [];
      const syncErrors: Array<{ slug: string; error: string }> = [];

      for (const skillEntry of skillsConfig.skills) {
        const { slug } = skillEntry;

        if (!localRegistry.skillExists(slug)) {
          syncErrors.push({
            slug,
            error: `Not found in local cache`,
          });
          continue;
        }

        const skillData = localRegistry.getSkill(slug);
        if (!skillData) {
          syncErrors.push({
            slug,
            error: `Failed to read from cache`,
          });
          continue;
        }

        const meta: Omit<SkillMeta, "sha256"> = {
          slug,
          name: skillData.meta.name,
          description: skillData.meta.description,
          tags: skillData.meta.tags,
          compat: skillData.meta.compat,
        };

        fs.writeSkill(
          { slug, content: skillData.content, sha256: skillData.sha256 },
          meta,
        );
        synced++;

        skills.push({ ...meta, sha256: skillData.sha256 });
        syncedSlugs.push(slug);
      }

      // Write system (meta) skill
      fs.writeSystemSkill(META_SKILL_CONTENT);

      // Generate SKILLS_INDEX.md
      indexGen.writeIndex(skills);

      // Update agent config files
      fs.updateClaudeMd();
      fs.updateAgentsMd();
      fs.updateCursorRules();

      // Sync native skill symlinks
      fs.syncClaudeNativeSkills(syncedSlugs);

      // Remove old install directory if it differs from the new one
      if (needsPathMigration) {
        const oldInstallFullPath = path.join(projectRoot, currentInstallPath);
        if (
          nodeFs.existsSync(oldInstallFullPath) &&
          path.resolve(oldInstallFullPath) !== path.resolve(newInstallFullPath)
        ) {
          nodeFs.rmSync(oldInstallFullPath, { recursive: true });
        }
      }

      spinner.succeed("Project upgrade complete!");

      console.log("");
      if (synced > 0) {
        console.log(`Synced ${chalk.cyan(synced)} skills to ${chalk.cyan(targetInstallPath + "/")}.`);
      }
      if (needsPathMigration) {
        console.log(
          `Removed old install directory ${chalk.gray(currentInstallPath + "/")}.`,
        );
      }
      if (hasLockfile) {
        console.log(`Removed ${chalk.gray(".skills.lock")}.`);
      }

      if (syncErrors.length > 0) {
        console.log("");
        console.log(chalk.red(`${syncErrors.length} skill(s) failed to sync:`));
        for (const error of syncErrors) {
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
