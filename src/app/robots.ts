import type { MetadataRoute } from "next";
/** A sample-data demo should not be indexed. */
export default function robots(): MetadataRoute.Robots { return { rules: { userAgent: "*", disallow: "/" } }; }
