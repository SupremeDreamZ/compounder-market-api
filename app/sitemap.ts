import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = "https://compounder-market-api.vercel.app";
  return [
    { url: baseUrl, changeFrequency: "weekly", priority: 1 },
    { url: `${baseUrl}/openapi.json`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${baseUrl}/llms.txt`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${baseUrl}/api/bounty-score`, changeFrequency: "weekly", priority: 0.9 },
    { url: `${baseUrl}/api/bounty-score/example`, changeFrequency: "weekly", priority: 0.7 },
  ];
}
