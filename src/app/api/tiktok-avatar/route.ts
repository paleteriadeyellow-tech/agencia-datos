import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type CacheEntry = { url: string; at: number };
const memory = new Map<string, CacheEntry>();
const TTL_MS = 1000 * 60 * 60 * 6;

function cleanUser(raw: string | null) {
  if (!raw) return "";
  return raw
    .trim()
    .replace(/^@/, "")
    .replace(/^tiktok:/i, "")
    .replace(/^https?:\/\/(www\.)?tiktok\.com\/@/i, "")
    .split(/[/?#]/)[0]
    .trim();
}

async function resolveAvatarUrl(user: string): Promise<string | null> {
  const cached = memory.get(user);
  if (cached && Date.now() - cached.at < TTL_MS) return cached.url;

  // API pública usada por el sitio LIVE de TikTok (incluye avatar)
  try {
    const roomUrl = `https://www.tiktok.com/api-live/user/room/?aid=1988&sourceType=54&uniqueId=${encodeURIComponent(user)}`;
    const res = await fetch(roomUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        Referer: `https://www.tiktok.com/@${user}`,
        Accept: "application/json, text/plain, */*",
      },
      signal: AbortSignal.timeout(12000),
    });
    if (res.ok) {
      const json = (await res.json()) as {
        data?: {
          user?: {
            avatarThumb?: string;
            avatarMedium?: string;
            avatarLarger?: string;
          };
        };
      };
      const u = json?.data?.user;
      const url = u?.avatarMedium || u?.avatarThumb || u?.avatarLarger || null;
      if (url) {
        memory.set(user, { url, at: Date.now() });
        return url;
      }
    }
  } catch {
    /* fallback abajo */
  }

  return null;
}

export async function GET(req: NextRequest) {
  const user = cleanUser(req.nextUrl.searchParams.get("u"));
  if (!user || user.length < 2) {
    return new NextResponse(null, { status: 404 });
  }

  const target = await resolveAvatarUrl(user);
  if (!target) return new NextResponse(null, { status: 404 });

  try {
    const img = await fetch(target, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        Referer: "https://www.tiktok.com/",
        Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(12000),
    });
    if (!img.ok || !img.body) {
      memory.delete(user);
      return new NextResponse(null, { status: 404 });
    }

    const contentType = img.headers.get("content-type") || "image/jpeg";
    if (contentType.includes("text/html") || contentType.includes("application/json")) {
      memory.delete(user);
      return new NextResponse(null, { status: 404 });
    }

    return new NextResponse(img.body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=21600, stale-while-revalidate=86400",
      },
    });
  } catch {
    memory.delete(user);
    return new NextResponse(null, { status: 404 });
  }
}
