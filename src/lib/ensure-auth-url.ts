/**
 * next-auth llama `new URL(NEXTAUTH_URL)` y falla si está vacío.
 * Usamos notación de corchetes para que el bundler NO reemplace
 * `process.env.NEXTAUTH_URL` por un literal (eso rompe el assign → "Assigning to rvalue").
 */
export function ensureAuthUrl() {
  const env = process.env;
  const current = env["NEXTAUTH_URL"]?.trim();
  if (current) return;

  const vercel = env["VERCEL_URL"]?.trim();
  if (vercel) {
    env["NEXTAUTH_URL"] = vercel.startsWith("http")
      ? vercel
      : `https://${vercel}`;
    return;
  }

  env["NEXTAUTH_URL"] = "http://localhost:3000";
}

ensureAuthUrl();
