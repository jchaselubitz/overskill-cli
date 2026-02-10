import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import * as api from "../lib/api.js";
import * as localRegistry from "../lib/local-registry/index.js";

export const deleteCommand = new Command("delete")
  .description("Delete a skill from a registry (default: local)")
  .argument(
    "<skill>",
    "Skill to delete, format: <slug> (local) or <registry>/<slug> (remote)",
  )
  .action(async (skill: string) => {
    try {
      // Parse the skill argument to determine if it's local or remote
      const parts = skill.split("/");

      if (parts.length === 1) {
        // Local delete: skills delete my-skill
        const slug = parts[0];

        if (!localRegistry.skillExists(slug)) {
          console.log(
            chalk.red(`Error: Skill '${slug}' not found in local registry.`),
          );
          process.exit(1);
        }

        const spinner = ora(
          `Deleting ${chalk.cyan(slug)} from local registry...`,
        ).start();

        try {
          const deleted = localRegistry.deleteSkill(slug);
          if (deleted) {
            spinner.succeed(`Deleted ${chalk.cyan(slug)} from local registry`);
            console.log("");
            console.log(
              chalk.gray(
                `Note: You may also need to run ${chalk.cyan(`skill remove ${slug}`)} from any projects that use this skill.`,
              ),
            );
          } else {
            spinner.fail("Failed to delete skill");
            process.exit(1);
          }
        } catch (error) {
          spinner.fail("Failed to delete skill");
          throw error;
        }
      } else if (parts.length === 2) {
        // Remote delete: skills delete my-registry/my-skill
        const [registrySlug, skillSlug] = parts;

        const spinner = ora(
          `Deleting ${chalk.cyan(skillSlug)} from registry ${chalk.cyan(registrySlug)}...`,
        ).start();

        try {
          await api.deleteSkill(registrySlug, skillSlug);
          spinner.succeed(
            `Deleted ${chalk.cyan(skillSlug)} from registry ${chalk.cyan(registrySlug)}`,
          );
          console.log("");
          console.log(
            chalk.gray(
              `Note: You may also need to run ${chalk.cyan(`skill remove ${skillSlug}`)} from any projects that use this skill.`,
            ),
          );
        } catch (error) {
          spinner.fail("Failed to delete skill");
          throw error;
        }
      } else {
        console.log(chalk.red("Error: Invalid skill format."));
        console.log(
          `Use: ${chalk.cyan("skill delete <slug>")} (local) or ${chalk.cyan("skill delete <registry>/<slug>")} (remote)`,
        );
        process.exit(1);
      }
    } catch (error) {
      console.error(
        chalk.red("Error:"),
        error instanceof Error ? error.message : error,
      );
      process.exit(1);
    }
  });
