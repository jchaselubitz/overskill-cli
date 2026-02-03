#!/usr/bin/env node

import { Command } from 'commander';
import { initCommand } from './commands/init.js';
import { loginCommand } from './commands/login.js';
import { syncCommand } from './commands/sync.js';
import { addCommand } from './commands/add.js';
import { removeCommand } from './commands/remove.js';
import { listCommand } from './commands/list.js';
import { searchCommand } from './commands/search.js';
import { infoCommand } from './commands/info.js';
import { diffCommand } from './commands/diff.js';
import { editCommand } from './commands/edit.js';
import { pushCommand } from './commands/push.js';
import { validateCommand } from './commands/validate.js';
import { bundleCommand } from './commands/bundle.js';
import { configCommand } from './commands/config.js';
import { registryCommand } from './commands/registry.js';
import { updateCommand } from './commands/update.js';

const program = new Command();

program
  .name('skills')
  .description('CLI tool for managing agent skills across repositories')
  .version('0.1.0');

// Register all commands
program.addCommand(initCommand);
program.addCommand(loginCommand);
program.addCommand(syncCommand);
program.addCommand(addCommand);
program.addCommand(removeCommand);
program.addCommand(listCommand);
program.addCommand(searchCommand);
program.addCommand(infoCommand);
program.addCommand(diffCommand);
program.addCommand(editCommand);
program.addCommand(pushCommand);
program.addCommand(validateCommand);
program.addCommand(bundleCommand);
program.addCommand(configCommand);
program.addCommand(registryCommand);
program.addCommand(updateCommand);

program.parse();
