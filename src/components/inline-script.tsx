"use client";
/**
 * An inline script that runs once while the HTML is parsed, before first paint. On the client React renders it as
 * text/plain, so it is not flagged or run again on hydration (the pattern from Next's "Preventing flash before
 * hydration" guide); suppressHydrationWarning accepts the type difference.
 */
export function InlineScript({ html }: { html: string }) {
  return (
    <script
      type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
