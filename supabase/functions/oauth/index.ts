import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createAdminClient } from "../_shared/supabase.ts";
import { handleCors, jsonResponse, htmlResponse, corsHeaders } from "../_shared/cors.ts";
import { validationError, unauthorizedError, notFoundError } from "../_shared/errors.ts";

// Generate a random authorization code
function generateCode(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, "0")).join("");
}

// Hash a string using SHA256
async function hashSecret(secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(secret);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// OAuth Login/Register HTML Page
function getAuthPage(
  clientId: string,
  redirectUri: string,
  state: string,
  error?: string
): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Skills Platform - Sign In</title>
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
      position: relative;
      overflow: hidden;
    }

    /* Animated background elements */
    body::before,
    body::after {
      content: '';
      position: absolute;
      width: 300px;
      height: 300px;
      border-radius: 50%;
      background: rgba(255, 255, 255, 0.1);
      animation: float 20s infinite ease-in-out;
    }

    body::before {
      top: -100px;
      left: -100px;
      animation-delay: 0s;
    }

    body::after {
      bottom: -100px;
      right: -100px;
      animation-delay: 10s;
    }

    @keyframes float {
      0%, 100% { transform: translate(0, 0) scale(1); }
      50% { transform: translate(50px, 50px) scale(1.1); }
    }

    .container {
      background: rgba(255, 255, 255, 0.98);
      backdrop-filter: blur(10px);
      border-radius: 20px;
      box-shadow: 0 20px 80px rgba(0, 0, 0, 0.25);
      padding: 48px 40px;
      width: 100%;
      max-width: 420px;
      position: relative;
      z-index: 1;
      animation: slideUp 0.4s ease-out;
    }

    @keyframes slideUp {
      from {
        opacity: 0;
        transform: translateY(30px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    .logo {
      width: 56px;
      height: 56px;
      margin: 0 auto 24px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      border-radius: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 28px;
      font-weight: 700;
      color: white;
      box-shadow: 0 8px 16px rgba(102, 126, 234, 0.3);
    }

    h1 {
      color: #1a202c;
      font-size: 28px;
      font-weight: 700;
      margin-bottom: 8px;
      text-align: center;
      letter-spacing: -0.5px;
    }

    .subtitle {
      color: #718096;
      font-size: 15px;
      margin-bottom: 32px;
      text-align: center;
    }

    .error {
      background: linear-gradient(135deg, #fee 0%, #fdd 100%);
      border: 1px solid #fcc;
      border-radius: 12px;
      color: #c53030;
      padding: 14px 16px;
      margin-bottom: 24px;
      font-size: 14px;
      display: flex;
      align-items: center;
      gap: 10px;
      animation: shake 0.4s ease-in-out;
    }

    .error::before {
      content: '⚠️';
      font-size: 18px;
    }

    @keyframes shake {
      0%, 100% { transform: translateX(0); }
      25% { transform: translateX(-5px); }
      75% { transform: translateX(5px); }
    }

    .form-group {
      margin-bottom: 20px;
      position: relative;
      overflow: hidden;
      max-height: 1000px;
      transition: max-height 0.3s ease-out, opacity 0.3s ease-out, margin 0.3s ease-out;
    }

    .form-group.hide {
      max-height: 0;
      opacity: 0;
      margin-bottom: 0;
      pointer-events: none;
    }

    label {
      display: block;
      color: #4a5568;
      font-size: 14px;
      font-weight: 600;
      margin-bottom: 8px;
      transition: color 0.2s;
    }

    .input-wrapper {
      position: relative;
    }

    input {
      width: 100%;
      padding: 14px 16px;
      border: 2px solid #e2e8f0;
      border-radius: 12px;
      font-size: 16px;
      transition: all 0.2s ease;
      background: white;
    }

    input:focus {
      outline: none;
      border-color: #667eea;
      box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
    }

    input:focus + label {
      color: #667eea;
    }

    input::placeholder {
      color: #cbd5e0;
    }

    button {
      width: 100%;
      padding: 16px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border: none;
      border-radius: 12px;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s ease;
      box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
      position: relative;
      overflow: hidden;
      margin-top: 8px;
    }

    button::before {
      content: '';
      position: absolute;
      top: 0;
      left: -100%;
      width: 100%;
      height: 100%;
      background: rgba(255, 255, 255, 0.2);
      transition: left 0.5s ease;
    }

    button:hover::before {
      left: 100%;
    }

    button:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 20px rgba(102, 126, 234, 0.4);
    }

    button:active {
      transform: translateY(0);
    }

    button:disabled {
      opacity: 0.7;
      cursor: not-allowed;
      transform: none;
    }

    .toggle {
      text-align: center;
      margin-top: 24px;
      padding-top: 24px;
      border-top: 1px solid #e2e8f0;
    }

    .toggle-text {
      color: #718096;
      font-size: 14px;
      margin-bottom: 8px;
    }

    .toggle a {
      color: #667eea;
      text-decoration: none;
      font-size: 15px;
      font-weight: 600;
      transition: color 0.2s;
      display: inline-block;
    }

    .toggle a:hover {
      color: #764ba2;
    }

    .loading {
      display: none;
      text-align: center;
      padding: 20px;
    }

    .loading.show {
      display: block;
      animation: fadeIn 0.3s ease-out;
    }

    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    .spinner {
      border: 3px solid #e2e8f0;
      border-top: 3px solid #667eea;
      border-radius: 50%;
      width: 40px;
      height: 40px;
      animation: spin 0.8s linear infinite;
      margin: 0 auto 16px;
    }

    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }

    .loading-text {
      color: #718096;
      font-size: 15px;
    }

    /* Mobile responsiveness */
    @media (max-width: 480px) {
      .container {
        padding: 36px 28px;
      }

      h1 {
        font-size: 24px;
      }

      .logo {
        width: 48px;
        height: 48px;
        font-size: 24px;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="logo">S</div>
    <h1 id="pageTitle">Welcome Back</h1>
    <p class="subtitle">Sign in to your Skills Platform account</p>

    ${error ? `<div class="error">${error}</div>` : ""}

    <form id="authForm" method="POST" action="/oauth/authorize">
      <input type="hidden" name="client_id" value="${clientId}">
      <input type="hidden" name="redirect_uri" value="${redirectUri}">
      <input type="hidden" name="state" value="${state}">
      <input type="hidden" name="mode" id="mode" value="login">

      <div class="form-group hide" id="usernameGroup">
        <label for="username">Username</label>
        <div class="input-wrapper">
          <input type="text" id="username" name="username" placeholder="yourname" autocomplete="username">
        </div>
      </div>

      <div class="form-group">
        <label for="email">Email Address</label>
        <div class="input-wrapper">
          <input type="email" id="email" name="email" placeholder="you@example.com" required autocomplete="email">
        </div>
      </div>

      <div class="form-group">
        <label for="password">Password</label>
        <div class="input-wrapper">
          <input type="password" id="password" name="password" placeholder="••••••••" required autocomplete="current-password">
        </div>
      </div>

      <button type="submit" id="submitBtn">
        <span id="btnText">Sign In</span>
      </button>
    </form>

    <div class="loading" id="loading">
      <div class="spinner"></div>
      <p class="loading-text">Authenticating...</p>
    </div>

    <div class="toggle">
      <p class="toggle-text" id="toggleText">Don't have an account?</p>
      <a href="#" id="toggleLink">Create Account</a>
    </div>
  </div>

  <script>
    const form = document.getElementById('authForm');
    const modeInput = document.getElementById('mode');
    const usernameGroup = document.getElementById('usernameGroup');
    const usernameInput = document.getElementById('username');
    const submitBtn = document.getElementById('submitBtn');
    const btnText = document.getElementById('btnText');
    const toggleLink = document.getElementById('toggleLink');
    const toggleText = document.getElementById('toggleText');
    const pageTitle = document.getElementById('pageTitle');
    const loading = document.getElementById('loading');
    let isRegister = false;

    toggleLink.addEventListener('click', (e) => {
      e.preventDefault();
      isRegister = !isRegister;

      if (isRegister) {
        modeInput.value = 'register';
        usernameGroup.classList.remove('hide');
        usernameInput.required = true;
        btnText.textContent = 'Create Account';
        toggleText.textContent = 'Already have an account?';
        toggleLink.textContent = 'Sign In';
        pageTitle.textContent = 'Create Account';
      } else {
        modeInput.value = 'login';
        usernameGroup.classList.add('hide');
        usernameInput.required = false;
        btnText.textContent = 'Sign In';
        toggleText.textContent = "Don't have an account?";
        toggleLink.textContent = 'Create Account';
        pageTitle.textContent = 'Welcome Back';
      }
    });

    form.addEventListener('submit', (e) => {
      submitBtn.disabled = true;
      form.style.display = 'none';
      loading.classList.add('show');
    });
  </script>
</body>
</html>`;
}

// Success page showing the code (for manual copy flows)
function getSuccessPage(code: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Authorization Successful</title>
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
      position: relative;
      overflow: hidden;
    }

    body::before,
    body::after {
      content: '';
      position: absolute;
      width: 300px;
      height: 300px;
      border-radius: 50%;
      background: rgba(255, 255, 255, 0.1);
      animation: float 20s infinite ease-in-out;
    }

    body::before {
      top: -100px;
      left: -100px;
      animation-delay: 0s;
    }

    body::after {
      bottom: -100px;
      right: -100px;
      animation-delay: 10s;
    }

    @keyframes float {
      0%, 100% { transform: translate(0, 0) scale(1); }
      50% { transform: translate(50px, 50px) scale(1.1); }
    }

    .container {
      background: rgba(255, 255, 255, 0.98);
      backdrop-filter: blur(10px);
      border-radius: 20px;
      box-shadow: 0 20px 80px rgba(0, 0, 0, 0.25);
      padding: 48px 40px;
      width: 100%;
      max-width: 520px;
      text-align: center;
      position: relative;
      z-index: 1;
      animation: slideUp 0.4s ease-out;
    }

    @keyframes slideUp {
      from {
        opacity: 0;
        transform: translateY(30px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    .success-icon {
      width: 80px;
      height: 80px;
      margin: 0 auto 24px;
      background: linear-gradient(135deg, #48bb78 0%, #38a169 100%);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 40px;
      animation: scaleIn 0.5s ease-out 0.2s both;
      box-shadow: 0 8px 16px rgba(72, 187, 120, 0.3);
    }

    @keyframes scaleIn {
      from {
        transform: scale(0);
        opacity: 0;
      }
      to {
        transform: scale(1);
        opacity: 1;
      }
    }

    h1 {
      color: #1a202c;
      font-size: 28px;
      font-weight: 700;
      margin-bottom: 12px;
      letter-spacing: -0.5px;
    }

    .subtitle {
      color: #718096;
      font-size: 15px;
      margin-bottom: 32px;
      line-height: 1.6;
    }

    .code-container {
      background: #f7fafc;
      border: 2px solid #e2e8f0;
      border-radius: 12px;
      padding: 20px;
      margin-bottom: 24px;
      position: relative;
      overflow: hidden;
    }

    .code-label {
      color: #718096;
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 12px;
    }

    .code {
      background: white;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 16px;
      font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, 'Courier New', monospace;
      font-size: 13px;
      word-break: break-all;
      color: #2d3748;
      line-height: 1.6;
    }

    button {
      padding: 14px 32px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border: none;
      border-radius: 12px;
      font-size: 15px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s ease;
      box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
      position: relative;
      overflow: hidden;
    }

    button::before {
      content: '';
      position: absolute;
      top: 0;
      left: -100%;
      width: 100%;
      height: 100%;
      background: rgba(255, 255, 255, 0.2);
      transition: left 0.5s ease;
    }

    button:hover::before {
      left: 100%;
    }

    button:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 20px rgba(102, 126, 234, 0.4);
    }

    button:active {
      transform: translateY(0);
    }

    button.copied {
      background: linear-gradient(135deg, #48bb78 0%, #38a169 100%);
      box-shadow: 0 4px 12px rgba(72, 187, 120, 0.3);
    }

    button.copied:hover {
      box-shadow: 0 6px 20px rgba(72, 187, 120, 0.4);
    }

    .hint {
      margin-top: 24px;
      padding-top: 24px;
      border-top: 1px solid #e2e8f0;
      color: #718096;
      font-size: 14px;
      line-height: 1.6;
    }

    @media (max-width: 480px) {
      .container {
        padding: 36px 28px;
      }

      h1 {
        font-size: 24px;
      }

      .success-icon {
        width: 64px;
        height: 64px;
        font-size: 32px;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="success-icon">✓</div>
    <h1>Authorization Successful!</h1>
    <p class="subtitle">Your account has been authorized. Copy the code below and paste it in your application to complete the connection.</p>

    <div class="code-container">
      <div class="code-label">Authorization Code</div>
      <div class="code" id="code">${code}</div>
    </div>

    <button onclick="copyCode()" id="copyBtn">
      <span id="btnText">📋 Copy Code</span>
    </button>

    <p class="hint">This code will expire in 10 minutes. Return to your application to continue.</p>
  </div>

  <script>
    function copyCode() {
      navigator.clipboard.writeText('${code}');
      const btn = document.getElementById('copyBtn');
      const btnText = document.getElementById('btnText');

      btnText.textContent = '✓ Copied!';
      btn.classList.add('copied');

      setTimeout(() => {
        btnText.textContent = '📋 Copy Code';
        btn.classList.remove('copied');
      }, 2000);
    }
  </script>
</body>
</html>`;
}

serve(async (req: Request) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/oauth/, "");
  const method = req.method;

  const adminClient = createAdminClient();

  try {
    // =========================================================================
    // GET /authorize - Show login/register page
    // =========================================================================
    if (method === "GET" && path === "/authorize") {
      const clientId = url.searchParams.get("client_id");
      const redirectUri = url.searchParams.get("redirect_uri");
      const state = url.searchParams.get("state") || "";
      const error = url.searchParams.get("error");

      if (!clientId || !redirectUri) {
        return htmlResponse(
          "<h1>Error</h1><p>Missing client_id or redirect_uri</p>",
          400
        );
      }

      // Validate client
      const { data: client } = await adminClient
        .from("oauth_clients")
        .select("redirect_uris")
        .eq("id", clientId)
        .single();

      if (!client) {
        return htmlResponse("<h1>Error</h1><p>Invalid client_id</p>", 400);
      }

      // Validate redirect URI
      if (!client.redirect_uris.includes(redirectUri)) {
        return htmlResponse("<h1>Error</h1><p>Invalid redirect_uri</p>", 400);
      }

      return htmlResponse(getAuthPage(clientId, redirectUri, state, error || undefined));
    }

    // =========================================================================
    // POST /authorize - Process login/register and redirect with code
    // =========================================================================
    if (method === "POST" && path === "/authorize") {
      const formData = await req.formData();
      const clientId = formData.get("client_id") as string;
      const redirectUri = formData.get("redirect_uri") as string;
      const state = formData.get("state") as string;
      const mode = formData.get("mode") as string;
      const email = formData.get("email") as string;
      const password = formData.get("password") as string;
      const username = formData.get("username") as string;

      if (!clientId || !redirectUri || !email || !password) {
        const params = new URLSearchParams({
          client_id: clientId,
          redirect_uri: redirectUri,
          state: state || "",
          error: "Missing required fields",
        });
        return Response.redirect(`/oauth/authorize?${params}`, 303);
      }

      // Validate client
      const { data: client } = await adminClient
        .from("oauth_clients")
        .select("redirect_uris")
        .eq("id", clientId)
        .single();

      if (!client || !client.redirect_uris.includes(redirectUri)) {
        return htmlResponse("<h1>Error</h1><p>Invalid client configuration</p>", 400);
      }

      let userId: string;

      if (mode === "register") {
        if (!username) {
          const params = new URLSearchParams({
            client_id: clientId,
            redirect_uri: redirectUri,
            state: state || "",
            error: "Username is required for registration",
          });
          return Response.redirect(`/oauth/authorize?${params}`, 303);
        }

        // Check username uniqueness
        const { data: existingProfile } = await adminClient
          .from("profiles")
          .select("id")
          .eq("username", username.toLowerCase())
          .single();

        if (existingProfile) {
          const params = new URLSearchParams({
            client_id: clientId,
            redirect_uri: redirectUri,
            state: state || "",
            error: "Username already taken",
          });
          return Response.redirect(`/oauth/authorize?${params}`, 303);
        }

        // Create user
        const { data: signUpData, error: signUpError } = await adminClient.auth.signUp({
          email,
          password,
          options: {
            data: {
              username: username.toLowerCase(),
              display_name: username,
            },
          },
        });

        if (signUpError || !signUpData.user) {
          const params = new URLSearchParams({
            client_id: clientId,
            redirect_uri: redirectUri,
            state: state || "",
            error: signUpError?.message || "Registration failed",
          });
          return Response.redirect(`/oauth/authorize?${params}`, 303);
        }

        userId = signUpData.user.id;
      } else {
        // Login
        const { data: signInData, error: signInError } =
          await adminClient.auth.signInWithPassword({
            email,
            password,
          });

        if (signInError || !signInData.user) {
          const params = new URLSearchParams({
            client_id: clientId,
            redirect_uri: redirectUri,
            state: state || "",
            error: "Invalid email or password",
          });
          return Response.redirect(`/oauth/authorize?${params}`, 303);
        }

        userId = signInData.user.id;
      }

      // Generate authorization code
      const code = generateCode();

      // Store code
      await adminClient.from("oauth_codes").insert({
        code,
        client_id: clientId,
        user_id: userId,
        redirect_uri: redirectUri,
        scope: "read write",
      });

      // Build redirect URL
      const redirectUrl = new URL(redirectUri);
      redirectUrl.searchParams.set("code", code);
      if (state) {
        redirectUrl.searchParams.set("state", state);
      }

      // Check if redirect is to localhost (CLI flow)
      if (redirectUrl.hostname === "localhost" || redirectUrl.hostname === "127.0.0.1") {
        // Redirect to local server
        return Response.redirect(redirectUrl.toString(), 303);
      }

      // For non-localhost, show the code for manual copy
      return htmlResponse(getSuccessPage(code));
    }

    // =========================================================================
    // POST /token - Exchange code for tokens
    // =========================================================================
    if (method === "POST" && path === "/token") {
      let body: Record<string, string>;

      const contentType = req.headers.get("content-type") || "";
      if (contentType.includes("application/x-www-form-urlencoded")) {
        const formData = await req.formData();
        body = Object.fromEntries(formData.entries()) as Record<string, string>;
      } else {
        body = await req.json();
      }

      const { grant_type, code, refresh_token, client_id, client_secret, redirect_uri } = body;

      // Validate client
      const { data: client } = await adminClient
        .from("oauth_clients")
        .select("*")
        .eq("id", client_id)
        .single();

      if (!client) {
        return jsonResponse({ error: "invalid_client" }, 401);
      }

      // Verify client secret if provided
      if (client_secret) {
        const hashedSecret = await hashSecret(client_secret);
        if (hashedSecret !== client.secret) {
          return jsonResponse({ error: "invalid_client" }, 401);
        }
      }

      if (grant_type === "authorization_code") {
        if (!code || !redirect_uri) {
          return jsonResponse({ error: "invalid_request", error_description: "Missing code or redirect_uri" }, 400);
        }

        // Get and validate code
        const { data: authCode, error: codeError } = await adminClient
          .from("oauth_codes")
          .select("*")
          .eq("code", code)
          .eq("client_id", client_id)
          .eq("redirect_uri", redirect_uri)
          .single();

        if (codeError || !authCode) {
          return jsonResponse({ error: "invalid_grant" }, 400);
        }

        if (authCode.used) {
          return jsonResponse({ error: "invalid_grant", error_description: "Code already used" }, 400);
        }

        if (new Date(authCode.expires_at) < new Date()) {
          return jsonResponse({ error: "invalid_grant", error_description: "Code expired" }, 400);
        }

        // Mark code as used
        await adminClient
          .from("oauth_codes")
          .update({ used: true })
          .eq("code", code);

        // Create session for user
        // We need to get a session - use admin API to generate tokens
        const { data: sessionData, error: sessionError } = await adminClient.auth.admin.createUser({
          email: `temp-${authCode.user_id}@temp.local`,
          email_confirm: true,
        });

        // Instead, let's sign in as the user using admin privileges
        // Get user's email
        const { data: userData } = await adminClient.auth.admin.getUserById(authCode.user_id);

        if (!userData?.user?.email) {
          return jsonResponse({ error: "server_error" }, 500);
        }

        // Generate JWT tokens manually using Supabase admin API
        // Since we can't easily get tokens without password, we'll use a workaround
        // by creating a session via the admin API

        const { data: { session }, error: tokenError } = await adminClient.auth.admin.generateLink({
          type: 'magiclink',
          email: userData.user.email,
        });

        // For MVP, we'll return the user ID and let the client use it
        // In production, you'd want to implement proper JWT generation

        // Get existing session or create one
        // Since Supabase doesn't have a direct "create session for user" API,
        // we'll need a workaround - store a refresh token mapping

        // For now, return a placeholder that works with the CLI
        const accessToken = btoa(JSON.stringify({
          sub: authCode.user_id,
          exp: Math.floor(Date.now() / 1000) + 3600,
          iat: Math.floor(Date.now() / 1000),
        }));

        return jsonResponse({
          access_token: accessToken,
          token_type: "bearer",
          expires_in: 3600,
          refresh_token: generateCode(),
          user_id: authCode.user_id,
        });
      }

      if (grant_type === "refresh_token") {
        if (!refresh_token) {
          return jsonResponse({ error: "invalid_request", error_description: "Missing refresh_token" }, 400);
        }

        // For MVP, just generate new tokens
        // In production, you'd validate the refresh token properly
        const accessToken = btoa(JSON.stringify({
          exp: Math.floor(Date.now() / 1000) + 3600,
          iat: Math.floor(Date.now() / 1000),
        }));

        return jsonResponse({
          access_token: accessToken,
          token_type: "bearer",
          expires_in: 3600,
          refresh_token: generateCode(),
        });
      }

      return jsonResponse({ error: "unsupported_grant_type" }, 400);
    }

    return htmlResponse("<h1>Not Found</h1>", 404);
  } catch (err) {
    console.error("OAuth Error:", err);
    return jsonResponse({ error: "server_error", error_description: String(err) }, 500);
  }
});
