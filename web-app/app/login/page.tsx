"use client";

import { useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { registerUser, loginUser } from "./auth";

export default function LoginPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const supabase = createClient();

  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // CLI flow parameters
  const isCli = searchParams.get("cli") === "true";
  const redirectUri = searchParams.get("redirect_uri");
  const state = searchParams.get("state");

  // Check if already logged in
  useEffect(() => {
    async function checkSession() {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session && !isCli) {
        router.push("/dashboard");
      }
    }
    checkSession();
  }, [supabase, router, isCli]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (isRegister) {
        const {
          session,
          error: signUpError,
          needsEmailVerification,
        } = await registerUser({
          email,
          password,
          username,
        });

        if (signUpError) {
          setError(signUpError);
          setLoading(false);
          return;
        }

        if (!session) {
          if (needsEmailVerification) {
            setError("Registration successful. Please check your email to verify your account.");
          } else {
            setError("Registration failed. Please try again.");
          }
          setLoading(false);
          return;
        }

        // Handle successful registration
        await handleSuccessfulAuth(session);
      } else {
        const { session, error: signInError } = await loginUser({
          email,
          password,
        });

        if (signInError) {
          setError(signInError);
          setLoading(false);
          return;
        }

        if (!session) {
          setError("Login failed. Please try again.");
          setLoading(false);
          return;
        }

        // Handle successful login
        await handleSuccessfulAuth(session);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      setLoading(false);
    }
  }

  async function handleSuccessfulAuth(session: {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  }) {
    if (isCli && redirectUri) {
      // CLI flow: generate code and redirect back to CLI
      try {
        const response = await fetch("/api/auth/cli-code", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            accessToken: session.access_token,
            refreshToken: session.refresh_token,
            expiresIn: session.expires_in,
          }),
        });

        if (!response.ok) {
          throw new Error("Failed to generate auth code");
        }

        const { code } = await response.json();

        // Build redirect URL back to CLI
        const callbackUrl = new URL(redirectUri);
        callbackUrl.searchParams.set("code", code);
        if (state) {
          callbackUrl.searchParams.set("state", state);
        }

        // Redirect to CLI callback
        window.location.href = callbackUrl.toString();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to complete CLI login");
        setLoading(false);
      }
    } else {
      // Normal web flow: redirect to dashboard
      router.push("/dashboard");
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-indigo-500 to-purple-600 p-5">
      <div className="w-full max-w-md animate-slide-up rounded-2xl bg-white p-12 shadow-2xl">
        <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 text-3xl font-bold text-white shadow-lg">
          S
        </div>

        <h1 className="mb-2 text-center text-3xl font-bold text-gray-900">
          {isRegister ? "Create Account" : "Welcome Back"}
        </h1>
        <p className="mb-8 text-center text-gray-500">
          {isCli
            ? "Sign in to authorize the CLI"
            : isRegister
              ? "Create your Skills Platform account"
              : "Sign in to your Skills Platform account"}
        </p>

        {error && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {isRegister && (
            <div className="mb-5">
              <label
                htmlFor="username"
                className="mb-2 block text-sm font-semibold text-gray-600"
              >
                Username
              </label>
              <input
                type="text"
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="yourname"
                required={isRegister}
                className="w-full rounded-xl border-2 border-gray-200 px-4 py-3 text-base transition-all focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>
          )}

          <div className="mb-5">
            <label
              htmlFor="email"
              className="mb-2 block text-sm font-semibold text-gray-600"
            >
              Email Address
            </label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              className="w-full rounded-xl border-2 border-gray-200 px-4 py-3 text-base transition-all focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            />
          </div>

          <div className="mb-6">
            <label
              htmlFor="password"
              className="mb-2 block text-sm font-semibold text-gray-600"
            >
              Password
            </label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              className="w-full rounded-xl border-2 border-gray-200 px-4 py-3 text-base transition-all focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 py-4 text-base font-semibold text-white shadow-lg transition-all hover:-translate-y-0.5 hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-70"
          >
            {loading ? "..." : isRegister ? "Create Account" : "Sign In"}
          </button>
        </form>

        <div className="mt-6 border-t border-gray-200 pt-6 text-center">
          <p className="mb-2 text-sm text-gray-500">
            {isRegister ? "Already have an account?" : "Don't have an account?"}
          </p>
          <button
            type="button"
            onClick={() => setIsRegister(!isRegister)}
            className="font-semibold text-indigo-600 transition-colors hover:text-purple-600"
          >
            {isRegister ? "Sign In" : "Create Account"}
          </button>
        </div>
      </div>

      <style jsx>{`
        @keyframes slide-up {
          from {
            opacity: 0;
            transform: translateY(30px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-slide-up {
          animation: slide-up 0.4s ease-out;
        }
      `}</style>
    </div>
  );
}
