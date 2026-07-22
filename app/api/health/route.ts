import { NextResponse } from "next/server";
import { FACILITATOR_URL, NETWORK, PAY_TO_ADDRESS, USDC_ADDRESS } from "@/lib/x402";
import { PUBLIC_BASE_URL, SERVICE_NAME, SERVICE_VERSION } from "@/lib/product";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: SERVICE_NAME,
    version: SERVICE_VERSION,
    network: NETWORK,
    asset: USDC_ADDRESS,
    payTo: PAY_TO_ADDRESS,
    facilitator: FACILITATOR_URL,
    paidEndpoints: ["POST /api/bounty-score"],
    discovery: {
      openapi: `${PUBLIC_BASE_URL}/openapi.json`,
      llms: `${PUBLIC_BASE_URL}/llms.txt`,
      x402: `${PUBLIC_BASE_URL}/.well-known/x402`,
      freeExample: `${PUBLIC_BASE_URL}/api/bounty-score/example`,
    },
  });
}
