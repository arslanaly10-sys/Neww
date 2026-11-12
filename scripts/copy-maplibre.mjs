// MapLibre's web worker must be a real same-origin file (strict CSP, no blob: script). Copy it into public/.
import { mkdirSync, copyFileSync } from "node:fs";
mkdirSync("public/maplibre", { recursive: true });
for (const f of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) copyFileSync(`node_modules/maplibre-gl/dist/${f}`, `public/maplibre/${f}`);
