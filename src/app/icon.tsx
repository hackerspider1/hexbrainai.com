import { ImageResponse } from "next/og";
import { markDataUri } from "@/lib/site";

export const size = { width: 96, height: 96 };
export const contentType = "image/png";

// The browser-tab icon. A PNG, because some browsers do not show SVG icons.
export default function Icon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#13120e", borderRadius: 20, alignItems: "center", justifyContent: "center" }}>
        <img src={markDataUri(false)} width={92} height={92} alt="" />
      </div>
    ),
    size
  );
}
