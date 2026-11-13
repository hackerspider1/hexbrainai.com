import MapView from "@/components/MapView";
import { currentUser, keysRequired } from "@/lib/auth";
import { getGraph } from "@/lib/db";
import { SITE } from "@/lib/site";

export const dynamic = "force-dynamic";

export default async function Home() {
  const about = { "@context": "https://schema.org", "@type": "WebSite", name: SITE.name, url: SITE.url, description: SITE.description };
  const user = await currentUser();
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(about).replace(/</g, "\\u003c") }} />
      <MapView graph={getGraph()} viewer={user && { name: user.name, picture: user.picture }} needsKey={keysRequired()} />
    </>
  );
}
