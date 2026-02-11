#!/usr/bin/env node

import { Command } from 'commander';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { initCommand } from './commands/init.js';
import { newCommand } from './commands/new.js';
import { addCommand } from './commands/add.js';
import { removeCommand } from './commands/remove.js';
import { syncCommand } from './commands/sync.js';
import { editCommand } from './commands/edit.js';
import { openCommand } from './commands/open.js';
import { updateCommand } from './commands/update.js';
import { listCommand } from './commands/list.js';
import { infoCommand } from './commands/info.js';
import { importCommand } from './commands/import.js';
import { validateCommand } from './commands/validate.js';
import { deleteCommand } from './commands/delete.js';
import { configCommand } from './commands/config.js';
import { publishCommand } from './commands/publish.js';
// Cloud-related commands
import { loginCommand } from './commands/login.js';
import { pushCommand } from './commands/push.js';
import { searchCommand } from './commands/search.js';
import { diffCommand } from './commands/diff.js';
import { bundleCommand } from './commands/bundle.js';
import { registryCommand } from './commands/registry.js';
import { feedbackCommand } from './commands/feedback.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8'));

const program = new Command();

program
  .name('skill')
  .description('Overskill CLI - manage skills across repositories')
  .version(pkg.version);

// Local commands (primary workflow)
program.addCommand(initCommand);
program.addCommand(newCommand);
program.addCommand(addCommand);
program.addCommand(removeCommand);
program.addCommand(syncCommand);
program.addCommand(editCommand);
program.addCommand(openCommand);
program.addCommand(updateCommand);
program.addCommand(listCommand);
program.addCommand(infoCommand);
program.addCommand(importCommand);
program.addCommand(validateCommand);
program.addCommand(deleteCommand);
program.addCommand(configCommand);
program.addCommand(publishCommand);

// Cloud commands
program.addCommand(loginCommand);
program.addCommand(pushCommand);
program.addCommand(searchCommand);
program.addCommand(diffCommand);
program.addCommand(bundleCommand);
program.addCommand(registryCommand);
program.addCommand(feedbackCommand);

program.parse();
