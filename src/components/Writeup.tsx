import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Renders a researcher's write-up. The text is third-party, so: no raw HTML (react-markdown's default),
 * no remote images (they would tell an outside server who is reading), and links open in a new tab
 * without passing our address along.
 */
export default function Writeup({ children }: { children: string }) {
  return (
    <Markdown
      remarkPlugins={[remarkGfm]}
      components={{
        img: ({ src, alt }) => (typeof src === "string" && /^https?:/i.test(src)
          ? <a href={src} target="_blank" rel="noopener noreferrer nofollow">[image{alt ? `: ${alt}` : ""}]</a>
          : <span>[image{alt ? `: ${alt}` : ""}]</span>),
        a: ({ href, children: kids }) => <a href={href} target="_blank" rel="noopener noreferrer nofollow">{kids}</a>,
      }}
    >
      {children.replace(/^(#{2,6})(?=[A-Za-z])/gm, "$1 ") /* "##Heading" is a heading the author typed without the space */}
    </Markdown>
  );
}
