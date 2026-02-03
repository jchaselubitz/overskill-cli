import { Command } from 'commander';
import { createServer } from 'http';
import chalk from 'chalk';
import open from 'open';
import { ofetch } from 'ofetch';
import * as auth from '../lib/auth.js';

const CALLBACK_PORT = 9876;

export const loginCommand = new Command('login')
  .description('Authenticate with the skills platform')
  .option('--manual', 'Use manual code entry instead of browser redirect')
  .action(async (options) => {
    try {
      const apiUrl = auth.getApiUrl();
      if (!apiUrl) {
        console.log(chalk.red('Error: API URL not configured.'));
        console.log(`Run ${chalk.cyan('skills config api_url <url>')} first.`);
        process.exit(1);
      }

      // Build OAuth URL
      const oauthBaseUrl = apiUrl.replace('/api', '/oauth');
      const redirectUri = `http://localhost:${CALLBACK_PORT}/callback`;
      const state = Math.random().toString(36).substring(7);

      const authorizeUrl = new URL(`${oauthBaseUrl}/authorize`);
      authorizeUrl.searchParams.set('client_id', 'cli');
      authorizeUrl.searchParams.set('redirect_uri', redirectUri);
      authorizeUrl.searchParams.set('state', state);

      if (options.manual) {
        // Manual flow - user copies code
        console.log('Open this URL in your browser to log in:');
        console.log('');
        console.log(chalk.cyan(authorizeUrl.toString()));
        console.log('');

        const readline = await import('readline');
        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout,
        });

        const code = await new Promise<string>((resolve) => {
          rl.question('Enter the authorization code: ', (answer) => {
            rl.close();
            resolve(answer.trim());
          });
        });

        await exchangeCodeForTokens(oauthBaseUrl, code, redirectUri);
      } else {
        // Browser flow with local callback server
        console.log('Opening browser for authentication...');

        const code = await new Promise<string>((resolve, reject) => {
          const server = createServer((req, res) => {
            const url = new URL(req.url || '', `http://localhost:${CALLBACK_PORT}`);

            if (url.pathname === '/callback') {
              const authCode = url.searchParams.get('code');
              const returnedState = url.searchParams.get('state');

              if (returnedState !== state) {
                res.writeHead(400, { 'Content-Type': 'text/html' });
                res.end('<h1>Error: Invalid state</h1>');
                reject(new Error('Invalid state'));
                server.close();
                return;
              }

              if (!authCode) {
                const error = url.searchParams.get('error') || 'Unknown error';
                res.writeHead(400, { 'Content-Type': 'text/html' });
                res.end(`<h1>Error: ${error}</h1>`);
                reject(new Error(error));
                server.close();
                return;
              }

              res.writeHead(200, { 'Content-Type': 'text/html' });
              res.end(`
                <html>
                  <head>
                    <style>
                      body { font-family: sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); }
                      .container { background: white; padding: 40px; border-radius: 12px; text-align: center; }
                      h1 { color: #333; margin-bottom: 10px; }
                      p { color: #666; }
                    </style>
                  </head>
                  <body>
                    <div class="container">
                      <h1>Authentication Successful!</h1>
                      <p>You can close this window and return to the terminal.</p>
                    </div>
                  </body>
                </html>
              `);

              resolve(authCode);
              server.close();
            }
          });

          server.listen(CALLBACK_PORT, () => {
            open(authorizeUrl.toString());
          });

          // Timeout after 5 minutes
          setTimeout(() => {
            server.close();
            reject(new Error('Authentication timed out'));
          }, 5 * 60 * 1000);
        });

        await exchangeCodeForTokens(oauthBaseUrl, code, redirectUri);
      }
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

async function exchangeCodeForTokens(
  oauthBaseUrl: string,
  code: string,
  redirectUri: string
): Promise<void> {
  console.log('Exchanging code for tokens...');

  const response = await ofetch<{
    access_token: string;
    refresh_token: string;
    expires_in?: number;
  }>(`${oauthBaseUrl}/token`, {
    method: 'POST',
    body: {
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: 'cli',
    },
  });

  auth.setTokens(
    response.access_token,
    response.refresh_token,
    response.expires_in || 3600
  );

  console.log(chalk.green('Successfully logged in!'));
}
