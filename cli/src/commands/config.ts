import { Command } from "commander";
import chalk from "chalk";
import * as auth from "../lib/auth.js";

export const configCommand = new Command("config")
  .description("Get or set CLI configuration")
  .argument(
    "<key>",
    "Configuration key (api_url, web_app_url, editor, install_path)"
  )
  .argument("[value]", "Value to set (omit to get current value)")
  .action(async (key: string, value?: string) => {
    try {
      const validKeys = [
        "api_url",
        // "api_key",
        "web_app_url",
        "editor",
        "install_path",
      ];

      if (!validKeys.includes(key)) {
        console.log(chalk.red(`Error: Invalid config key '${key}'`));
        console.log(`Valid keys: ${validKeys.join(", ")}`);
        process.exit(1);
      }

      if (value === undefined) {
        // Get value
        let currentValue: string | undefined;

        switch (key) {
          case "api_url":
            currentValue = auth.getApiUrl();
            break;
          // case 'api_key':
          //   currentValue = auth.getApiKey();
          //   break;
          case "web_app_url":
            currentValue = auth.getWebAppUrl();
            break;
          case "editor":
            currentValue = auth.getEditor();
            break;
          case "install_path":
            currentValue = auth.getDefaultInstallPath();
            break;
        }

        if (currentValue) {
          console.log(currentValue);
        } else {
          console.log(chalk.gray("(not set)"));
        }
      } else {
        // Set value
        switch (key) {
          case "api_url":
            auth.setApiUrl(value);
            break;
          case "web_app_url":
            auth.setWebAppUrl(value);
            break;
          case "editor":
            auth.setEditor(value);
            break;
          case "install_path":
            auth.setDefaultInstallPath(value);
            break;
        }

        console.log(chalk.green(`Set ${key} = ${value}`));
      }
    } catch (error) {
      console.error(
        chalk.red("Error:"),
        error instanceof Error ? error.message : error
      );
      process.exit(1);
    }
  });

// Add subcommand to show all config
configCommand
  .command("show")
  .description("Show all configuration")
  .action(() => {
    const allConfig = auth.getAll();

    console.log(chalk.bold("CLI Configuration:"));
    console.log(`  Config file: ${chalk.gray(auth.getConfigPath())}`);
    console.log("");

    if (allConfig.api_url) {
      console.log(`  api_url:      ${allConfig.api_url}`);
    }
    if (allConfig.web_app_url) {
      console.log(`  web_app_url:  ${allConfig.web_app_url}`);
    }
    if (allConfig.editor) {
      console.log(`  editor:       ${allConfig.editor}`);
    }
    if (allConfig.install_path) {
      console.log(`  install_path: ${allConfig.install_path}`);
    }
    if (allConfig.access_token) {
      console.log(`  logged_in:    ${chalk.green("yes")}`);
    } else {
      console.log(`  logged_in:    ${chalk.gray("no")}`);
    }
  });

// Add logout subcommand
configCommand
  .command("logout")
  .description("Clear authentication tokens")
  .action(() => {
    auth.clearTokens();
    console.log(chalk.green("Logged out successfully."));
  });
