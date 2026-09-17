import { NextResponse } from "next/server";
import { INDEX402_VERIFICATION_HASH } from "@/lib/product";

export const dynamic = "force-static";

/**
 * 402index.io domain-ownership proof. Serves the registered verification hash
 * verbatim as text/plain; 402index fetches this file to compare the SHA-256
 * hash and grant the domain-verified tier. Reachable at
 * /.well-known/402index-verify.txt via the rewrite in next.config.ts.
 */
export async function GET() {
  return new NextResponse(INDEX402_VERIFICATION_HASH, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=300, s-maxage=3600",
    },
  });
}
