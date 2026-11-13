// Runs before every page: gives each response a content security policy with a one-time code (nonce), so only
// this site's own scripts can run even if someone manages to inject markup into a page.
import { NextResponse, type NextRequest } from "next/server";
import { tooMany } from "@/lib/rate";

export function proxy(request: NextRequest) {
  // Pages are built per request from the database, so one visitor may not ask for them without limit (stops bulk scraping).
  if (tooMany(request, "pages", 240)) return new NextResponse("Too many requests. Try again in a minute.", { status: 429, headers: { "Retry-After": "60" } });
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64"), dev = process.env.NODE_ENV !== "production";
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https://lh3.googleusercontent.com", // the last one is where Google serves account pictures
    "font-src 'self' data:",
    `connect-src 'self'${dev ? " ws: wss:" : ""}`,
    "object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'",
    ...(dev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", csp);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

// Pages only: files, images and the API do not need it.
export const config = {
  // Prefetches are counted too: a header a visitor can set must not be a way round the limit. The sitemap and the
  // share image are built on request, so they are limited as well.
  matcher: [{ source: "/((?!api|_next/static|_next/image|logos|favicon.ico|icon|apple-icon|robots.txt|manifest.webmanifest).*)" }],
};
