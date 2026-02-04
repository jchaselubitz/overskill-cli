"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";

export default function DashboardPage() {
  const router = useRouter();
  const supabase = createClient();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function getUser() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login");
        return;
      }
      setUser(user);
      setLoading(false);
    }
    getUser();
  }, [supabase, router]);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 text-lg font-bold text-white">
              S
            </div>
            <span className="text-xl font-semibold text-gray-900">
              Skills Platform
            </span>
          </div>
          <button
            onClick={handleLogout}
            className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100"
          >
            Sign Out
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-12">
        <h1 className="mb-2 text-3xl font-bold text-gray-900">Dashboard</h1>
        <p className="mb-8 text-gray-500">
          Welcome back, {user?.user_metadata?.display_name || user?.email}
        </p>

        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">
            Getting Started
          </h2>
          <p className="mb-4 text-gray-600">
            Use the CLI to manage your skills. Run the following commands:
          </p>
          <div className="rounded-lg bg-gray-900 p-4 font-mono text-sm text-gray-100">
            <div className="mb-2">
              <span className="text-gray-400"># Configure API URL</span>
            </div>
            <div className="mb-4">
              skills config api_url http://localhost:54321/functions/v1/api
            </div>
            <div className="mb-2">
              <span className="text-gray-400"># Login to your account</span>
            </div>
            <div className="mb-4">skills login</div>
            <div className="mb-2">
              <span className="text-gray-400"># List your registries</span>
            </div>
            <div>skills registries</div>
          </div>
        </div>
      </main>
    </div>
  );
}
