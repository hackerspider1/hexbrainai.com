import { MARK_PATH } from "@/lib/site";

/** The site's mark, drawn in the current text colour with an orange centre. */
export default function Mark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <path d={MARK_PATH} stroke="currentColor" strokeWidth="2.7" fill="none" />
      <circle cx="32" cy="32" r="9.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="32" cy="32" r="3.4" fill="#ff6a3d" />
    </svg>
  );
}
