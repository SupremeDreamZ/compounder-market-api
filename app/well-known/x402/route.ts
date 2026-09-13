import { NextResponse } from "next/server";
import { X402_WELLKNOWN_HEADERS, X402_WELLKNOWN_MANIFEST } from "@/lib/x402-wellknown";

export const dynamic = "force-static";

export async function GET() {
  return NextResponse.json(X402_WELLKNOWN_MANIFEST, { headers: { ...X402_WELLKNOWN_HEADERS } });
}
