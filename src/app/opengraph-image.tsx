import { ImageResponse } from "next/og";
import { getGraph } from "@/lib/db";
import { SITE, markDataUri } from "@/lib/site";

export const dynamic = "force-dynamic";
export const alt = `${SITE.name}: ${SITE.tagline}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// The preview shown when the site is shared.
export default function Image() {
  const g = getGraph(), n = (v: number) => v.toLocaleString("en-US");
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#13120e", color: "#efe6d0", padding: 72, alignItems: "center" }}>
        <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          <div style={{ fontSize: 34, letterSpacing: 12, textTransform: "uppercase" }}>{SITE.name}</div>
          <div style={{ fontSize: 62, lineHeight: 1.1, marginTop: 36, maxWidth: 640 }}>{SITE.tagline}</div>
          <div style={{ display: "flex", fontSize: 28, marginTop: 44, color: "#ff6a3d" }}>
            {n(g.total)} reports · {n(g.weaknessCount)} weaknesses · {n(g.programs)} programs
          </div>
        </div>
        <img src={markDataUri(false)} width={380} height={380} alt="" />
      </div>
    ),
    size
  );
}
