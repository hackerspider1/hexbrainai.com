export const money = (n: number | null | undefined) => (n ? "$" + Math.round(n).toLocaleString("en-US") : "");
export const num = (n: number) => n.toLocaleString("en-US");
export const plural = (n: number, w: string) => `${num(n)} ${w}${n === 1 ? "" : "s"}`;
export const clip = (t: string, n: number) => (t.length > n ? t.slice(0, n - 1) + "…" : t);
