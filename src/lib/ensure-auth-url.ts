/**
 * next-auth llama `new URL(NEXTAUTH_URL)` y falla si está vacío ("").
 * En Vercel usamos VERCEL_URL cuando falta.
 */
export function ensureAuthUrl() {
  const current = process.env.NEXTAUTH_URL?.trim();
  if (current) return;
  if (process.env.VERCEL_URL) {
    process.env.NEXTAUTH_URL = `https://${process.env.VERCEL_URL}`;
    return;
  }
  process.env.NEXTAUTH_URL = "http://localhost:3000";
}

ensureAuthUrl();
