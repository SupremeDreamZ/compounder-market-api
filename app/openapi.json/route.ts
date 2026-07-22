import { NextResponse } from "next/server";
import { OPENAPI_DOCUMENT } from "@/lib/discovery";

export const dynamic = "force-static";

export async function GET() {
  return NextResponse.json(OPENAPI_DOCUMENT, {
    headers: { "Cache-Control": "public, max-age=300, s-maxage=3600" },
  });
}
