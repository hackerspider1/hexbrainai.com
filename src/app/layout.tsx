import type { Metadata, Viewport } from "next";
import { Recursive } from "next/font/google";
import { SITE } from "@/lib/site";
import "./globals.css";

const recursive = Recursive({ subsets: ["latin"], axes: ["MONO"], variable: "--font-recursive", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: { default: `${SITE.name}: every disclosed bug bounty report, mapped`, template: `%s · ${SITE.name}` },
  authors: [{ name: SITE.name, url: SITE.url }], creator: SITE.name, publisher: SITE.name, category: "security",
  description: SITE.description,
  applicationName: SITE.name,
  keywords: ["bug bounty", "bug bounty reports", "HackerOne disclosed reports", "hacktivity", "bug bounty write-ups", "vulnerability write-ups", "XSS", "SSRF", "IDOR", "SQL injection", "account takeover", "security research", "pentest", "AI security"],
  alternates: { canonical: "/" },
  openGraph: { type: "website", siteName: SITE.name, title: `${SITE.name}: ${SITE.tagline}`, description: SITE.description, url: "/" },
  twitter: { card: "summary_large_image", title: `${SITE.name}: ${SITE.tagline}`, description: SITE.description },
  robots: { index: true, follow: true, googleBot: { index: true, follow: true, "max-snippet": -1, "max-image-preview": "large" } },
  formatDetection: { telephone: false, email: false, address: false },
};
export const dynamic = "force-dynamic"; // every page carries a fresh security code, so none are built ahead of time
export const viewport: Viewport = { themeColor: "#13120e", colorScheme: "dark" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={recursive.variable}>
      <body>{children}</body>
    </html>
  );
}
