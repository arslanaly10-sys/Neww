# Known gaps

Updated each stage. Governance shows the security-related ones inside the app.

## Not built yet (planned stages)
- Stage 5: alerts, approvals queue, audit log view with "verify chain" and demo tamper button, real-time simulated feed, deploy.

## Known limitations today
- Sign-in is a role picker with a signed cookie. It is not authentication. Production: SSO/OIDC with MFA.
- Rent is hidden from investors by the data-access layer (`src/lib/access.ts`), because RLS is row-level, not column-level. Production: a view without rent for the investor role.
- The Content-Security-Policy allows inline scripts, which Next.js needs without nonces. Production: nonce-based CSP.
- Embedded PGlite is per server process. On Vercel, set `DATABASE_URL` (Neon) or each serverless instance holds its own copy.
- Audit events are written on the privileged connection; production should use a SECURITY DEFINER function.
- The map is schematic: districts are laid out roughly by compass position, not to scale, with no tiles. Comparables are synthetic.
- The portfolio net-yield headline for the Investor role is an aggregate read on the privileged connection; per-asset income and costs stay hidden from investors. A production design would expose it through a dedicated aggregate view.
- The investor updates feed is a static list until the simulated real-time feed arrives in stage 5. Updates are not yet linked to an asset page.
- MapLibre's worker is copied into `public/maplibre/` by `prebuild`/`predev` (git-ignored).
- Risk weights and thresholds are sample values in `AS-RISK-1.0.0`, not calibrated to any real portfolio.
- Open Fig popovers and the open command bar are not yet covered by the axe scan.
- Axe scans cover the main screens in light and dark, EN and AR. They do not yet cover open popovers or the open command bar.
- Mobile uses a six-item bottom tab bar instead of four tabs plus a More sheet.

## Added in stage 3
- **The live model path has not been run against the real Anthropic API.** This sandbox has no key. It is tested end to end with a fake client (tool loop, request shape, grounding, refusals, fallbacks), and the scripted path is tested for real. First live run needs `ANTHROPIC_API_KEY`; check a few answers by eye.
- Horus answers are returned whole, not streamed.
- The number-grounding check is token-level: every number in a claim must appear in a tool result. It stops invented and computed numbers, but cannot catch a real number attached to the wrong thing, and it can drop a valid answer that rounds differently. It is deliberately strict.
- Refusals and errors fall back to the scripted answer. The server-side `fallbacks` parameter is not used.
- The Horus rate limit (20 per hour) is in memory per server instance.
- Saved Horus drafts store the same text in both language fields until someone edits the other. The approvals queue for drafts arrives in stage 5; until then drafts are visible to managers in the portfolio feed.
- New valuation and approval ids are allocated as max+1 and are not safe under concurrent writes.
- With only two sample managers, a manager-proposed adjustment above 10% cannot reach two approvers and stays at "0 of 2". An investor-proposed one can be approved by both managers.
- Land plots have no comparable sales in the sample data, so their valuations carry low confidence and a widest range, on purpose.
- The address field is not geocoded; it only matches the names of sample compounds.

## Added in stage 4
- **Document reading is not general.** It reads only the three bundled sample PDFs, recognised by SHA-256, and refuses anything else. Text extraction from Arabic PDFs is lossy (letters and ligatures come out garbled, for example the currency word), so Arabic labels are matched fuzzily and Arabic-only fields carry a lower confidence. It is rule-based, not a model.
- Confirming a document updates lease dates, rent, indexation, deposit, clause codes, the asset area and the document status. Party names and premises are kept with the document but do not change the tenant or asset records.
- **Scenario coefficients are sample values, not a forecast.** The cap-rate, income-weight, rent-growth and dollar-linkage numbers are mine and uncalibrated. Recalculation is a server round trip (debounced 140 ms), not computed in the browser, because per-asset income must never reach the client of an investor.
- The risk model gained a sixth driver, value pressure (risk set `AS-RISK-1.1.0`), so base risk scores differ slightly from stage 2. The two roles that can see per-asset yield are managers only; investors get aggregates.
- A saved scenario is reproducible from its inputs and assumption version. If the portfolio data changed since (for example a confirmed valuation) the result differs by design, and the screen says so.
- Only managers can publish a new assumption version. There is no approval step for assumption changes yet.
- **Pack PDF.** Arabic fonts are subsets without Latin letters, digits or punctuation, so Latin-only text is set in Manrope; percentages inside Arabic sentences are written in words because react-pdf's bidirectional ordering misplaces a "%" there. Arabic layout was checked by rendering pages to images, not in a native Arabic reader.
- Pack generation takes a couple of seconds, writes an audit event and a verification record on a GET request (guarded by a same-origin check). Generation on Vercel needs the traced font files; that is configured but not yet tested on Vercel.
- Pack verification confirms issue and chain position. It does not store or compare the PDF's own bytes.
- The pack excerpt lists finance-related audit events only; the full log stays administrator-only.

## Added in stage 5
- **Deployment.** The Neon path and the Vercel build have not been exercised: the `pg` driver is proven over the wire protocol against PGlite only, and font/migration file tracing for react-pdf is configured but untested on Vercel. Without `DATABASE_URL`, each serverless instance gets its own in-memory PGlite, so state is not shared.
- The live feed is simulated and never stored. SSE on Vercel is bounded by function duration; the client reconnects.
- "Reset demo" (admin) wipes shared state for everyone. The tamper demo deliberately breaks the chain until restored.
- A role-change approval records the decision only; it does not change any user's role.
- Approval and draft ids are max+1 and can race under concurrent writes.
- `SESSION_SECRET` falls back to a constant if unset. The CSP still allows inline scripts (Next requirement here).
- Live Horus remains untested against the real API.
- Arabic PDF layout checked via rendered images only; no manual screen-reader pass was done (axe reports 0 violations, keyboard flow checked by script).
- `docs/` screenshots are about 41 MB; trim before publishing the repository.
- zmnhoof.com was not fetched; styling is from the brief.
