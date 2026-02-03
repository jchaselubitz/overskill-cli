import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import * as api from '../lib/api.js';

export const registryCommand = new Command('registry')
  .description('Manage registries');

// List registries
registryCommand
  .command('list')
  .description('List all accessible registries')
  .action(async () => {
    try {
      const spinner = ora('Fetching registries...').start();
      const registries = await api.listRegistries();
      spinner.stop();

      if (registries.length === 0) {
        console.log(chalk.yellow('No registries found.'));
        return;
      }

      console.log(chalk.bold('Your Registries:'));
      console.log('');

      for (const registry of registries) {
        const type = registry.type === 'personal' ? chalk.gray('(personal)') : chalk.cyan('(org)');
        const role = chalk.gray(`[${registry.role}]`);

        console.log(`  ${chalk.cyan(registry.slug.padEnd(20))} ${type} ${role}`);
        if (registry.description) {
          console.log(chalk.gray(`    ${registry.description}`));
        }
      }
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// Create registry
registryCommand
  .command('create')
  .description('Create a new organization registry')
  .argument('<slug>', 'Registry slug')
  .option('-n, --name <name>', 'Registry name')
  .option('-d, --description <desc>', 'Registry description')
  .action(async (slug: string, options) => {
    try {
      const spinner = ora('Creating registry...').start();

      const registry = await api.createRegistry(slug, options.name || slug, {
        description: options.description,
        type: 'organization',
      });

      spinner.succeed(`Created registry ${chalk.cyan(registry.slug)}`);
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// List members
registryCommand
  .command('members')
  .description('List members of a registry')
  .argument('<slug>', 'Registry slug')
  .action(async (slug: string) => {
    try {
      const spinner = ora('Fetching members...').start();
      const members = await api.listMembers(slug);
      spinner.stop();

      if (members.length === 0) {
        console.log(chalk.yellow('No members found.'));
        return;
      }

      console.log(chalk.bold(`Members of ${slug}:`));
      console.log('');

      for (const member of members) {
        const roleColor = member.role === 'admin' ? chalk.red : member.role === 'contributor' ? chalk.yellow : chalk.gray;
        console.log(`  ${member.username.padEnd(20)} ${roleColor(member.role)}`);
      }
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// Invite member
registryCommand
  .command('invite')
  .description('Invite a user to a registry')
  .argument('<slug>', 'Registry slug')
  .requiredOption('-e, --email <email>', 'Email of user to invite')
  .option('-r, --role <role>', 'Role to assign (member, contributor, admin)', 'member')
  .action(async (slug: string, options) => {
    try {
      const validRoles = ['member', 'contributor', 'admin'];
      if (!validRoles.includes(options.role)) {
        console.log(chalk.red(`Error: Invalid role '${options.role}'`));
        console.log(`Valid roles: ${validRoles.join(', ')}`);
        process.exit(1);
      }

      const spinner = ora('Sending invitation...').start();
      await api.inviteMember(slug, options.email, options.role as 'member' | 'contributor' | 'admin');
      spinner.succeed(`Invited ${chalk.cyan(options.email)} as ${options.role} to ${slug}`);
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// List invitations (for current user)
registryCommand
  .command('invitations')
  .description('List pending invitations for your account')
  .action(async () => {
    try {
      const spinner = ora('Fetching invitations...').start();
      const invitations = await api.listInvitations();
      spinner.stop();

      if (invitations.length === 0) {
        console.log(chalk.gray('No pending invitations.'));
        return;
      }

      console.log(chalk.bold('Pending Invitations:'));
      console.log('');

      for (const inv of invitations) {
        console.log(`  ${chalk.cyan(inv.registry_name)} (${inv.registry_slug})`);
        console.log(chalk.gray(`    Role: ${inv.role} | Invited by: ${inv.invited_by}`));
        console.log(chalk.gray(`    Expires: ${new Date(inv.expires_at).toLocaleDateString()}`));
        console.log(`    Accept: ${chalk.cyan(`skills registry accept ${inv.registry_slug} ${inv.id}`)}`);
        console.log('');
      }
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// Accept invitation
registryCommand
  .command('accept')
  .description('Accept a pending invitation')
  .argument('<registry>', 'Registry slug')
  .argument('<invitation-id>', 'Invitation ID')
  .action(async (registry: string, invitationId: string) => {
    try {
      const spinner = ora('Accepting invitation...').start();
      await api.acceptInvitation(registry, invitationId);
      spinner.succeed(`Joined registry ${chalk.cyan(registry)}`);
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// Decline invitation
registryCommand
  .command('decline')
  .description('Decline a pending invitation')
  .argument('<registry>', 'Registry slug')
  .argument('<invitation-id>', 'Invitation ID')
  .action(async (registry: string, invitationId: string) => {
    try {
      const spinner = ora('Declining invitation...').start();
      await api.declineInvitation(registry, invitationId);
      spinner.succeed('Invitation declined');
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });
