import { NextRequest, NextResponse } from "next/server";
import { generateCode, storeCode } from "@/lib/auth/code-store";

export async function POST(request: NextRequest) {
  try {
    const { accessToken, refreshToken, expiresIn } = await request.json();

    if (!accessToken || !refreshToken) {
      return NextResponse.json(
        { error: "Missing required tokens" },
        { status: 400 }
      );
    }

    // Generate a one-time auth code
    const code = generateCode();

    // Store the tokens with the code
    storeCode(code, accessToken, refreshToken, expiresIn || 3600);

    return NextResponse.json({ code });
  } catch (error) {
    console.error("Error generating CLI code:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
