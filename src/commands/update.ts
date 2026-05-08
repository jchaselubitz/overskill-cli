import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { confirm } from "@inquirer/prompts";
import { spawn } from "child_process";
import semver from "semver";
import { ofetch } from "ofetch";
import { getCliPackageMetadata } from "../lib/cli-metadata.js";

async function getLatestVersion(packageName: string): Promise<string> {
  const response = await ofetch<{ version: string }>(
    `https://registry.npmjs.org/${packageName}/latest`,
    {
      timeout: 10_000,
    },
  );

  return response.version;
}

async function installLatestVersion(packageName: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn("npm", ["install", "-g", `${packageName}@latest`], {
      stdio: "inherit",
    });

    child.on("error", (error) => {
      reject(error);
    });

    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`npm exited with code ${code ?? "unknown"}`));
    });
  });
}

export const updateCommand = new Command("update")
  .description("Check for a new Overskill version and update the CLI")
  .action(async () => {
    try {
      const { name, version: currentVersion } = getCliPackageMetadata();

      let latestVersion: string;
      try {
        latestVersion = await getLatestVersion(name);
      } catch (error) {
        throw new Error(
          `Unable to check npm for updates: ${error instanceof Error ? error.message : String(error)}`,
        );
      }

      if (!semver.valid(currentVersion) || !semver.valid(latestVersion)) {
        throw new Error(
          `Invalid semver value detected (current: ${currentVersion}, latest: ${latestVersion})`,
        );
      }

      const comparison = semver.compare(currentVersion, latestVersion);

      if (comparison === 0) {
        console.log(
          chalk.green(`You are on the latest version (${currentVersion}).`),
        );
        return;
      }

      if (comparison > 0) {
        console.log(
          chalk.green(
            `You are already ahead of the published latest version (${currentVersion} > ${latestVersion}).`,
          ),
        );
        return;
      }

      console.log(
        `Current version: ${chalk.bold(currentVersion)}\nLatest version:  ${chalk.bold(latestVersion)}`,
      );

      const proceed = await confirm({
        message: `Update to ${latestVersion}?`,
        default: true,
      });

      if (!proceed) {
        console.log(chalk.gray("Update canceled."));
        return;
      }

      const spinner = ora(`Updating ${name}...`).start();

      try {
        await installLatestVersion(name);
        spinner.succeed(`Updated to ${chalk.cyan(latestVersion)}`);
      } catch (error) {
        spinner.fail("Update failed");
        throw error;
      }
    } catch (error) {
      console.error(
        chalk.red("Error:"),
        error instanceof Error ? error.message : String(error),
      );
      process.exit(1);
    }
  });
