import Link from "next/link";
import Mark from "@/components/Mark";
import { SITE } from "@/lib/site";
import s from "./plain.module.css";

export const metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <main className={s.page}>
      <Link href="/" className={s.brand}><Mark />{SITE.name}</Link>
      <h1>That page is not on the map.</h1>
      <p>The address may be mistyped, or the report may never have been disclosed publicly.</p>
      <p><Link href="/">Open the map</Link></p>
    </main>
  );
}
