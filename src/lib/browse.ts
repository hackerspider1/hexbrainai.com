// Helpers for the text pages (browse, class, program) that search engines and people without the map can read.
export const programPath = (name: string) => `/program/${encodeURIComponent(name)}`;
export const classPath = (id: string) => `/class/${id.toLowerCase()}`;
export const n = (v: number) => v.toLocaleString("en-US");
export const usd = (v: number | null | undefined) => (v ? "$" + Math.round(v).toLocaleString("en-US") : "");
export const jsonLd = (data: unknown) => JSON.stringify(data).replace(/</g, "\\u003c");
