import { Command } from "commander";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { spawn } from "child_process";
import chalk from "chalk";
import ora from "ora";
import * as localRegistry from "../lib/local-registry/index.js";
import * as auth from "../lib/auth.js";
import * as readline from "readline";
import { parseEditorCommand } from "../lib/editor.js";

/**
 * Prompt user for input
 */
async function prompt(
  question: string,
  defaultValue?: string,
): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    const displayDefault = defaultValue ? ` [${defaultValue}]` : "";
    rl.question(`${question}${displayDefault}: `, (answer) => {
      rl.close();
      resolve(answer.trim() || defaultValue || "");
    });
  });
}

/**
 * Open content in the user's preferred editor
 */
async function openInEditor(content: string): Promise<string> {
  const editor = auth.getEditor();
  const tempFile = path.join(os.tmpdir(), `skill-${Date.now()}.md`);

  // Write initial content to temp file
  fs.writeFileSync(tempFile, content, "utf-8");

  return new Promise((resolve, reject) => {
    let command: string;
    let args: string[];

    try {
      const parsed = parseEditorCommand(editor);
      command = parsed.command;
      args = parsed.args;
    } catch (error) {
      fs.unlinkSync(tempFile);
      reject(error);
      return;
    }

    const child = spawn(command, [...args, tempFile], { stdio: "inherit" });

    child.on("error", (err) => {
      fs.unlinkSync(tempFile);
      reject(
        new Error(
          `Failed to open editor. Ensure your editor is properly configured by running ${chalk.cyan("skill config show")} to view your current configuration and ${chalk.cyan("skill config editor <name>")} to set your preferred editor. Error message: ${err.message}`,
        ),
      );
    });

    child.on("exit", (code) => {
      if (code !== 0) {
        fs.unlinkSync(tempFile);
        reject(new Error(`Editor exited with code ${code}`));
        return;
      }

      // Read the edited content
      const editedContent = fs.readFileSync(tempFile, "utf-8");
      fs.unlinkSync(tempFile);
      resolve(editedContent);
    });
  });
}

export const publishCommand = new Command("publish")
  .description(
    "Update a skill's content in the local registry",
  )
  .argument("<slug>", "Skill slug")
  .option("--content <file>", "Read new content from file")
  .option("--no-editor", "Skip editor (use current content)")
  .action(async (slug: string, options) => {
    try {
      // Check if skill exists
      if (!localRegistry.skillExists(slug)) {
        console.log(
          chalk.red(`Error: Skill '${slug}' not found in local registry.`),
        );
        console.log(
          `Use ${chalk.cyan(`skill new ${slug}`)} to create it first.`,
        );
        process.exit(1);
      }

      // Get current skill info
      const skillInfo = localRegistry.getSkillInfo(slug);
      if (!skillInfo) {
        console.log(chalk.red(`Error: Could not read skill '${slug}'.`));
        process.exit(1);
      }

      const currentSkill = localRegistry.getSkill(slug);
      if (!currentSkill) {
        console.log(
          chalk.red(`Error: Could not read current content for '${slug}'.`),
        );
        process.exit(1);
      }

      // Get content
      let content: string;

      if (options.content) {
        // Read from file
        if (!fs.existsSync(options.content)) {
          console.log(chalk.red(`Error: File not found: ${options.content}`));
          process.exit(1);
        }
        content = fs.readFileSync(options.content, "utf-8");
      } else if (options.editor === false) {
        // Use current content without editing
        content = currentSkill.content;
      } else {
        // Open editor with current content
        console.log(chalk.gray("Opening editor with current content..."));
        try {
          content = await openInEditor(currentSkill.content);
        } catch (error) {
          console.log(
            chalk.red("Error:"),
            error instanceof Error ? error.message : error,
          );
          process.exit(1);
        }
      }

      // Validate content
      if (!content.trim()) {
        console.log(chalk.red("Error: Skill content cannot be empty."));
        process.exit(1);
      }

      // Check if content actually changed
      if (content === currentSkill.content) {
        console.log(chalk.yellow("No changes detected."));
        return;
      }

      const spinner = ora(`Saving ${slug}...`).start();

      try {
        // Save to local registry
        const { sha256 } = localRegistry.putSkill({
          slug,
          content,
          meta: {
            name: skillInfo.meta.name,
            description: skillInfo.meta.description,
            tags: skillInfo.meta.tags,
            compat: skillInfo.meta.compat,
          },
        });

        spinner.succeed(`Saved ${chalk.cyan(slug)}`);

        console.log("");
        console.log("Details:");
        console.log(
          `  ${chalk.bold("SHA256:")}      ${sha256.substring(0, 16)}...`,
        );

        console.log("");
        console.log("Next steps:");
        console.log(
          `  ${chalk.cyan(`skill sync`)}             Update projects using this skill`,
        );
        console.log(
          `  ${chalk.cyan(`skill info ${slug}`)}     View skill details`,
        );
      } catch (error) {
        spinner.fail("Failed to save");
        throw error;
      }
    } catch (error) {
      console.error(
        chalk.red("Error:"),
        error instanceof Error ? error.message : error,
      );
      process.exit(1);
    }
  });
