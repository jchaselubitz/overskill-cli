import { Command } from "commander";
import { getCliPackageMetadata } from "../lib/cli-metadata.js";

export const versionCommand = new Command("version")
  .description("Show the current Overskill CLI version")
  .action(() => {
    const { version } = getCliPackageMetadata();

    console.log(version);
  });
