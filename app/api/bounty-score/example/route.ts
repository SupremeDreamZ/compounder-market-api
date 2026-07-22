import { NextResponse } from "next/server";
import { EXAMPLE_INPUT, EXAMPLE_OUTPUT } from "@/lib/product";

export const dynamic = "force-static";

export async function GET() {
  return NextResponse.json(
    {
      free: true,
      kind: "fixed-example",
      input: EXAMPLE_INPUT,
      output: EXAMPLE_OUTPUT,
    },
    { headers: { "Cache-Control": "public, max-age=300, s-maxage=3600" } },
  );
}
