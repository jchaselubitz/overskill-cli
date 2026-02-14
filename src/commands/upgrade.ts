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
import { syncCommand } from "./sync.js";

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

      const projectRoot = config.findProjectRoot() || process.cwd();
      const skillsConfig = config.readConfig();
      const currentInstallPath = skillsConfig.install_path;
      const targetInstallPath = ".claude/skills";
      const lockfilePath = path.join(projectRoot, ".skills.lock");
      const legacySkillDir = path.join(projectRoot, ".skill");
      const targetInstallFullPath = path.join(projectRoot, targetInstallPath);
      const hasLockfile = nodeFs.existsSync(lockfilePath);
      const needsPathMigration = currentInstallPath !== targetInstallPath;
      const hasLegacySkillDir = nodeFs.existsSync(legacySkillDir);
      const hasExistingClaudeSkills = nodeFs.existsSync(targetInstallFullPath);

      // Inform the user what this reset+sync upgrade will do.
      console.log("");
      console.log(chalk.yellow("Project upgrade actions:"));
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
      if (hasLegacySkillDir) {
        console.log(
          `  • Legacy ${chalk.red(".skill/")} will be removed after sync`,
        );
      }
      if (hasExistingClaudeSkills) {
        console.log(
          `  • Existing ${chalk.red(targetInstallPath + "/")} will be deleted`,
        );
      } else {
        console.log(
          `  • ${chalk.gray(targetInstallPath + "/")} does not exist and will be created by sync`,
        );
      }
      console.log(
        `  • Run ${chalk.cyan("skill sync")} to rebuild skills from ${chalk.cyan(".skills.yaml")}`,
      );

      const proceed = await confirm({
        message: "Proceed with project upgrade?",
        default: true,
      });

      if (!proceed) {
        console.log(chalk.gray("Skipped project upgrade."));
        return;
      }

      const spinner = ora("Preparing project upgrade...").start();

      // Update install_path in config
      if (needsPathMigration) {
        skillsConfig.install_path = targetInstallPath;
        config.writeConfig(skillsConfig);
      }

      // Remove .skills.lock
      if (hasLockfile) {
        nodeFs.unlinkSync(lockfilePath);
      }

      // Reset .claude/skills and delegate all writes to the sync command.
      if (hasExistingClaudeSkills) {
        nodeFs.rmSync(targetInstallFullPath, { recursive: true, force: true });
      }

      spinner.succeed("Project reset complete.");
      console.log("");
      console.log(chalk.gray("Running skill sync..."));
      await syncCommand.parseAsync(["node", "skill", "sync"]);

      // Remove legacy install directory only after sync succeeds.
      if (hasLegacySkillDir) {
        nodeFs.rmSync(legacySkillDir, { recursive: true, force: true });
      }
    } catch (error) {
      console.error(
        chalk.red("Error:"),
        error instanceof Error ? error.message : error,
      );
      process.exit(1);
    }
  });
