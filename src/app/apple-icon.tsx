import { ImageResponse } from "next/og";
import { markDataUri } from "@/lib/site";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#13120e", alignItems: "center", justifyContent: "center" }}>
        <img src={markDataUri(false)} width={150} height={150} alt="" />
      </div>
    ),
    size
  );
}
