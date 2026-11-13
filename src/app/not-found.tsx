import Link from "next/link";
import Sheet from "@/components/Sheet";
import s from "./plain.module.css";

export const metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <Sheet className={s.page}>
      <h1>That page is not on the map.</h1>
      <p>The address may be mistyped, or the report may never have been disclosed publicly.</p>
      <p><Link href="/">Open the map</Link></p>
    </Sheet>
  );
}
