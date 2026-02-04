import { NextRequest, NextResponse } from "next/server";
import { consumeCode } from "@/lib/auth/code-store";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { grant_type, code, refresh_token } = body;

    if (grant_type === "authorization_code") {
      if (!code) {
        return NextResponse.json(
          { error: "invalid_request", error_description: "Missing code" },
          { status: 400 }
        );
      }

      // Retrieve and consume the stored tokens
      const tokens = consumeCode(code);

      if (!tokens) {
        return NextResponse.json(
          {
            error: "invalid_grant",
            error_description: "Invalid or expired code",
          },
          { status: 400 }
        );
      }

      return NextResponse.json({
        access_token: tokens.accessToken,
        refresh_token: tokens.refreshToken,
        token_type: "bearer",
        expires_in: tokens.expiresIn,
      });
    }

    if (grant_type === "refresh_token") {
      if (!refresh_token) {
        return NextResponse.json(
          {
            error: "invalid_request",
            error_description: "Missing refresh_token",
          },
          { status: 400 }
        );
      }

      // For refresh token, we need to call Supabase to refresh the session
      // The CLI should use the Supabase URL directly for refresh, but we can proxy it
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

      if (!supabaseUrl || !supabaseAnonKey) {
        return NextResponse.json(
          {
            error: "server_error",
            error_description: "Supabase not configured",
          },
          { status: 500 }
        );
      }

      const response = await fetch(
        `${supabaseUrl}/auth/v1/token?grant_type=refresh_token`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: supabaseAnonKey,
          },
          body: JSON.stringify({ refresh_token }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        return NextResponse.json(
          {
            error: "invalid_grant",
            error_description: error.error_description || "Refresh failed",
          },
          { status: 400 }
        );
      }

      const data = await response.json();

      return NextResponse.json({
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        token_type: "bearer",
        expires_in: data.expires_in,
      });
    }

    return NextResponse.json(
      { error: "unsupported_grant_type" },
      { status: 400 }
    );
  } catch (error) {
    console.error("Error in token exchange:", error);
    return NextResponse.json(
      { error: "server_error", error_description: "Internal server error" },
      { status: 500 }
    );
  }
}
