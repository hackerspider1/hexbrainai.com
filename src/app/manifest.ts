import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: SITE.name, short_name: SITE.name, description: SITE.description, start_url: "/", display: "standalone",
    background_color: "#13120e", theme_color: "#13120e",
    icons: [{ src: "/icon", sizes: "96x96", type: "image/png" }, { src: "/apple-icon", sizes: "180x180", type: "image/png" }],
  };
}
