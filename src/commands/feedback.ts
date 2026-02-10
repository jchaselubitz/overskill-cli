import { Command } from 'commander';
import chalk from 'chalk';
import open from 'open';
import { input } from '@inquirer/prompts';

const REPO_URL = 'https://github.com/jchaselubitz/overskill-cli';

export const feedbackCommand = new Command('feedback')
  .description('Submit feedback by creating a GitHub issue')
  .option('-t, --title <title>', 'Issue title')
  .option('-b, --body <body>', 'Issue body')
  .action(async options => {
    try {
      const title =
        options.title ||
        (await input({
          message: 'Feedback title:',
          validate: val => (val.trim() ? true : 'Title is required')
        }));

      const body =
        options.body ||
        (await input({
          message: 'Description (optional, you can add more on GitHub):'
        }));

      const issueUrl = new URL(`${REPO_URL}/issues/new`);
      issueUrl.searchParams.set('title', title.trim());

      if (body && body.trim()) {
        issueUrl.searchParams.set('body', body.trim());
      }

      console.log('');
      console.log(chalk.cyan('Opening GitHub to create your issue...'));
      await open(issueUrl.toString());

      console.log(chalk.green('Done! Complete and submit the issue in your browser.'));
    } catch (error) {
      if ((error as Record<string, unknown>)?.name === 'ExitPromptError') {
        console.log(chalk.yellow('\nFeedback cancelled.'));
        return;
      }
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });
