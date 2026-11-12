"use client";

import Link from "next/link";
import { SITE } from "@/lib/site";
import s from "./plain.module.css";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className={s.page}>
      <Link href="/" className={s.brand}>{SITE.name}</Link>
      <h1>This page could not be loaded.</h1>
      <p>Something failed on our side while preparing it. Trying again usually works.</p>
      <p><button onClick={reset}>Try again</button> or <Link href="/">open the map</Link></p>
    </main>
  );
}
