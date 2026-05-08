import { readFileSync } from "fs";

export interface CliPackageMetadata {
  name: string;
  version: string;
}

export function getCliPackageMetadata(): CliPackageMetadata {
  const packageJsonUrl = new URL("../../package.json", import.meta.url);
  const packageJson = JSON.parse(
    readFileSync(packageJsonUrl, "utf-8"),
  ) as CliPackageMetadata;

  return packageJson;
}
