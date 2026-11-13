// Name, wording and address of the site, in one place.
export const SITE = {
  name: "HexBrain",
  domain: "hexbrainai.com",
  tagline: "Every disclosed bug, mapped to how it was found.",
  description:
    "An interactive map of publicly disclosed HackerOne bug bounty reports, grouped by vulnerability class, weakness and program, with every write-up in full. Connect Claude, ChatGPT or any AI assistant to search it while you test.",
  // Public address, used for links in search results, previews and the sitemap.
  // In production this is the real domain unless HEXBRAIN_PUBLIC_URL says otherwise.
  url: (process.env.HEXBRAIN_PUBLIC_URL || (process.env.NODE_ENV === "production" ? "https://hexbrainai.com" : "http://localhost:3210")).replace(/\/$/, ""),
};

/** The mark: a dial of report strips round a ring, with one signal at the centre. */
export const MARK_PATH = "M32.0 17.0L32.0 4.0M36.6 17.7L39.4 9.2M40.8 19.9L44.3 15.0M44.1 23.2L53.0 16.7M46.3 27.4L52.9 25.2M47.0 32.0L51.0 32.0M46.3 36.6L54.8 39.4M44.1 40.8L53.8 47.9M40.8 44.1L44.3 49.0M36.6 46.3L38.2 51.0M32.0 47.0L32.0 57.0M27.4 46.3L25.2 52.9M23.2 44.1L20.8 47.4M19.9 40.8L13.4 45.5M17.7 36.6L7.3 40.0M17.0 32.0L11.0 32.0M17.7 27.4L9.2 24.6M19.9 23.2L15.8 20.2M23.2 19.9L16.1 10.2M27.4 17.7L25.2 11.1";
const markSvg = (bg = true) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${bg ? '<rect width="64" height="64" rx="14" fill="#13120e"/>' : ""}<path d="${MARK_PATH}" stroke="#efe6d0" stroke-width="2.7" fill="none"/><circle cx="32" cy="32" r="9.5" fill="none" stroke="#efe6d0" stroke-width="1.6"/><circle cx="32" cy="32" r="3.4" fill="#ff6a3d"/></svg>`;
export const markDataUri = (bg = true) => `data:image/svg+xml;base64,${Buffer.from(markSvg(bg)).toString("base64")}`;
