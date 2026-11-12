import type { MetadataRoute } from "next";
import { classPath, programPath } from "@/lib/browse";
import { db, getGraph } from "@/lib/db";
import { SITE } from "@/lib/site";

export const dynamic = "force-dynamic";

// The map, the about page, and every report that is still public.
export default function sitemap(): MetadataRoute.Sitemap {
  const rows = db().prepare("SELECT id, disclosed_at FROM reports WHERE COALESCE(detail_status, 200) = 200 ORDER BY votes DESC LIMIT 45000").all() as { id: number; disclosed_at: string | null }[];
  const g = getGraph();
  return [
    { url: `${SITE.url}/`, changeFrequency: "daily", priority: 1 },
    { url: `${SITE.url}/browse`, changeFrequency: "daily", priority: 0.9 },
    { url: `${SITE.url}/about`, changeFrequency: "monthly", priority: 0.5 },
    ...g.classes.map((c) => ({ url: SITE.url + classPath(c.id), changeFrequency: "weekly" as const, priority: 0.8 })),
    ...g.topPrograms.map((p) => ({ url: SITE.url + programPath(p.name), changeFrequency: "weekly" as const, priority: 0.7 })),
    ...rows.map((r) => ({ url: `${SITE.url}/report/${r.id}`, lastModified: r.disclosed_at ? new Date(r.disclosed_at) : undefined, changeFrequency: "yearly" as const, priority: 0.6 })),
  ];
}
