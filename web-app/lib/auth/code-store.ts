/**
 * Temporary in-memory store for CLI auth codes.
 * Maps auth codes to Supabase session tokens.
 *
 * In production, use Redis or database storage.
 * Codes expire after 10 minutes.
 */

interface StoredCode {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  createdAt: number;
}

const CODE_TTL_MS = 10 * 60 * 1000; // 10 minutes

const codeStore = new Map<string, StoredCode>();

/**
 * Generate a random auth code
 */
export function generateCode(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Store tokens with an auth code
 */
export function storeCode(
  code: string,
  accessToken: string,
  refreshToken: string,
  expiresIn: number
): void {
  // Clean up expired codes first
  cleanupExpiredCodes();

  codeStore.set(code, {
    accessToken,
    refreshToken,
    expiresIn,
    createdAt: Date.now(),
  });
}

/**
 * Retrieve and delete tokens by auth code (one-time use)
 */
export function consumeCode(
  code: string
): { accessToken: string; refreshToken: string; expiresIn: number } | null {
  const stored = codeStore.get(code);

  if (!stored) {
    return null;
  }

  // Check if code has expired
  if (Date.now() - stored.createdAt > CODE_TTL_MS) {
    codeStore.delete(code);
    return null;
  }

  // Delete code after retrieval (one-time use)
  codeStore.delete(code);

  return {
    accessToken: stored.accessToken,
    refreshToken: stored.refreshToken,
    expiresIn: stored.expiresIn,
  };
}

/**
 * Clean up expired codes
 */
function cleanupExpiredCodes(): void {
  const now = Date.now();
  for (const [code, stored] of codeStore.entries()) {
    if (now - stored.createdAt > CODE_TTL_MS) {
      codeStore.delete(code);
    }
  }
}
