import { NextResponse } from "next/server";
import { FACILITATOR_URL, NETWORK, PAY_TO_ADDRESS } from "@/lib/x402";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "Compounder Market API",
    version: "0.1.0",
    network: NETWORK,
    payTo: PAY_TO_ADDRESS,
    facilitator: FACILITATOR_URL,
    paidEndpoints: ["POST /api/bounty-score"],
  });
}
