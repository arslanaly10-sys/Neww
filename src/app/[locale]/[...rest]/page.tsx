import { notFound } from "next/navigation";

/** Any unknown path under a locale lands here and renders the locale's calm 404 page. */
export default function CatchAll() { notFound(); }
