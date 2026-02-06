import { Command } from 'commander';
import { createServer } from 'http';
import chalk from 'chalk';
import open from 'open';
import { ofetch } from 'ofetch';
import * as auth from '../lib/auth.js';

const CALLBACK_PORT = 9876;

/**
 * Get the web app URL for authentication.
 * Falls back to deriving from API URL if not explicitly configured.
 */
function getAuthUrl(): string | null {
  // Check for explicit web app URL first
  const webAppUrl = auth.getWebAppUrl();
  if (webAppUrl) {
    return webAppUrl;
  }

  // Fall back to default local development URL
  return 'http://localhost:3000';
}

export const loginCommand = new Command('login')
  .description('Authenticate with the skills platform')
  .option('--manual', 'Use manual code entry instead of browser redirect')
  .action(async (options) => {
    try {
      const webAppUrl = getAuthUrl();
      if (!webAppUrl) {
        console.log(chalk.red('Error: Web app URL not configured.'));
        console.log(`Run ${chalk.cyan('skills config web_app_url <url>')} first.`);
        process.exit(1);
      }

      // Build login URL for web app
      const redirectUri = `http://localhost:${CALLBACK_PORT}/callback`;
      const state = Math.random().toString(36).substring(7);

      const authorizeUrl = new URL(`${webAppUrl}/login`);
      authorizeUrl.searchParams.set('cli', 'true');
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

        await exchangeCodeForTokens(webAppUrl, code);
      } else {
        // Browser flow with local callback server
        console.log('Opening browser for authentication...');

        const code = await new Promise<string>((resolve, reject) => {
          let timeoutId: NodeJS.Timeout | undefined;
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
                if (timeoutId) clearTimeout(timeoutId);
                return;
              }

              if (!authCode) {
                const error = url.searchParams.get('error') || 'Unknown error';
                res.writeHead(400, { 'Content-Type': 'text/html' });
                res.end(`<h1>Error: ${error}</h1>`);
                reject(new Error(error));
                server.close();
                if (timeoutId) clearTimeout(timeoutId);
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
              if (timeoutId) clearTimeout(timeoutId);
            }
          });

          server.listen(CALLBACK_PORT, () => {
            open(authorizeUrl.toString());
          });

          // Timeout after 5 minutes
          timeoutId = setTimeout(() => {
            server.close();
            reject(new Error('Authentication timed out'));
          }, 5 * 60 * 1000);
        });

        await exchangeCodeForTokens(webAppUrl, code);
      }
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

async function exchangeCodeForTokens(
  webAppUrl: string,
  code: string
): Promise<void> {
  console.log('Exchanging code for tokens...');

  const response = await ofetch<{
    access_token: string;
    refresh_token: string;
    expires_in?: number;
  }>(`${webAppUrl}/api/auth/token`, {
    method: 'POST',
    body: {
      grant_type: 'authorization_code',
      code,
    },
  });

  auth.setTokens(
    response.access_token,
    response.refresh_token,
    response.expires_in || 3600
  );

  console.log(chalk.green('Successfully logged in!'));

  // Exit cleanly - the HTTP server's callback connection may still be open
  process.exit(0);
}
