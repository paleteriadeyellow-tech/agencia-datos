import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import type { JWT } from "next-auth/jwt";

const DESKTOP_TYP = "desktop";

function secretKey() {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("NEXTAUTH_SECRET no configurado");
  return new TextEncoder().encode(secret);
}

export type DesktopTokenClaims = {
  id: string;
  role: string;
  agencySlug: string;
  name?: string;
  email?: string;
};

export async function signDesktopToken(claims: DesktopTokenClaims) {
  return new SignJWT({
    id: claims.id,
    role: claims.role,
    agencySlug: claims.agencySlug,
    name: claims.name,
    email: claims.email,
    typ: DESKTOP_TYP,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.id)
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secretKey());
}

export async function verifyDesktopToken(
  token: string
): Promise<(JWTPayload & DesktopTokenClaims) | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey());
    if (payload.typ !== DESKTOP_TYP) return null;
    const id = (payload.id as string) || (payload.sub as string);
    const agencySlug = payload.agencySlug as string | undefined;
    const role = (payload.role as string) || "manager";
    if (!id || !agencySlug) return null;
    return {
      ...payload,
      id,
      role,
      agencySlug,
      name: payload.name as string | undefined,
      email: payload.email as string | undefined,
    };
  } catch {
    return null;
  }
}

/** Convierte claims desktop al shape que usa getScope / requireApiAuth. */
export function desktopClaimsToJwt(
  claims: DesktopTokenClaims & JWTPayload
): JWT {
  return {
    id: claims.id,
    sub: claims.id,
    role: claims.role,
    agencySlug: claims.agencySlug,
    name: claims.name,
    email: claims.email,
  };
}
