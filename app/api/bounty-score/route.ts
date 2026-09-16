import { NextRequest, NextResponse } from "next/server";
import { withX402 } from "@x402/next";
import { scoreBounty } from "@/lib/scoring";
import { BOUNTY_ROUTE_CONFIG } from "@/lib/bounty-route";
import { NETWORK, paymentServer } from "@/lib/x402";
import {
  BOUNTY_PRICE_LABEL,
  BOUNTY_SCORER_NAME,
  BOUNTY_SCORER_VERSION,
  EXAMPLE_INPUT,
  EXAMPLE_OUTPUT,
  PUBLIC_BASE_URL,
} from "@/lib/product";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    service: BOUNTY_SCORER_NAME,
    version: BOUNTY_SCORER_VERSION,
    price: BOUNTY_PRICE_LABEL,
    network: NETWORK,
    method: "POST",
    paymentProtocol: "x402 v2 exact",
    description:
      "Scores paid opportunities by certainty, operator fit, AI leverage, reuse, time-to-cash, payout quality, friction, and competition.",
    discovery: {
      openapi: `${PUBLIC_BASE_URL}/openapi.json`,
      llms: `${PUBLIC_BASE_URL}/llms.txt`,
      x402: `${PUBLIC_BASE_URL}/.well-known/x402`,
      freeExample: `${PUBLIC_BASE_URL}/api/bounty-score/example`,
    },
    exampleInput: EXAMPLE_INPUT,
    exampleOutput: EXAMPLE_OUTPUT,
  });
}

const paidHandler = async (request: NextRequest): Promise<NextResponse> => {
  try {
    const body = await request.json();
    return NextResponse.json(scoreBounty(body));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid request.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
};

export const POST = withX402(paidHandler, BOUNTY_ROUTE_CONFIG, paymentServer);
