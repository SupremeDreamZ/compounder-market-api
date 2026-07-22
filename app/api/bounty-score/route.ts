import { NextRequest, NextResponse } from "next/server";
import { withX402 } from "@x402/next";
import { declareDiscoveryExtension } from "@x402/extensions/bazaar";
import { scoreBounty } from "@/lib/scoring";
import { NETWORK, PAY_TO_ADDRESS, paymentServer } from "@/lib/x402";

export const runtime = "nodejs";

const exampleInput = {
  title: "Write a five-post launch thread",
  payoutUsd: 250,
  hoursEstimate: 4,
  daysToDeadline: 5,
  daysToPayout: 14,
  existingSubmissions: 12,
  fit: 5,
  paymentCertainty: 4,
  aiLeverage: 5,
  reuseValue: 4,
  cashCostUsd: 0,
  requiresAccount: true,
  requiresPublicPost: false,
  requiresPurchase: false,
  agentAccessible: true,
  humanSupportAvailable: false,
  verifiableOutput: true,
};

export async function GET() {
  return NextResponse.json({
    service: "Compounder Bounty Fit Scorer",
    version: "1.0.0",
    price: "$0.01 USDC",
    network: NETWORK,
    method: "POST",
    paymentProtocol: "x402 v2 exact",
    description:
      "Scores paid opportunities by certainty, operator fit, AI leverage, reuse, time-to-cash, payout quality, friction, and competition.",
    exampleInput,
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

export const POST = withX402(
  paidHandler,
  {
    accepts: [
      {
        scheme: "exact",
        price: "$0.01",
        network: NETWORK,
        payTo: PAY_TO_ADDRESS,
      },
    ],
    resource: "https://compounder-market-api.vercel.app/api/bounty-score",
    description:
      "Score a bounty, grant, paid task, or service opportunity for payout quality, payment certainty, AI leverage, time-to-cash, reuse, and execution friction.",
    mimeType: "application/json",
    serviceName: "Compounder Market API",
    tags: ["bounty", "scoring", "agents", "base", "opportunities"],
    iconUrl: "https://compounder-market-api.vercel.app/icon.svg",
    extensions: {
      ...declareDiscoveryExtension({
        bodyType: "json",
        input: exampleInput,
        inputSchema: {
          properties: {
            title: { type: "string", description: "Short opportunity title" },
            payoutUsd: { type: "number", description: "Headline payout in USD" },
            hoursEstimate: { type: "number", description: "Estimated delivery hours" },
            daysToDeadline: { type: "number", description: "Calendar days until deadline" },
            daysToPayout: { type: "number", description: "Expected days until payment" },
            existingSubmissions: {
              type: "number",
              description: "Known competing submissions or applicants",
            },
            fit: { type: "number", description: "Operator fit from 1 to 5" },
            paymentCertainty: {
              type: "number",
              description: "Confidence that valid work gets paid, from 1 to 5",
            },
            aiLeverage: {
              type: "number",
              description: "How much AI compresses delivery time, from 1 to 5",
            },
            reuseValue: {
              type: "number",
              description: "Future template or asset reuse value, from 1 to 5",
            },
            cashCostUsd: { type: "number", description: "Cash required before earning" },
            requiresAccount: { type: "boolean", description: "Requires a platform account" },
            requiresPublicPost: {
              type: "boolean",
              description: "Requires posting from a public social identity",
            },
            requiresPurchase: {
              type: "boolean",
              description: "Requires buying an asset or product first",
            },
            agentAccessible: {
              type: "boolean",
              description: "Can an autonomous agent execute the workflow directly",
            },
            humanSupportAvailable: {
              type: "boolean",
              description: "A human can complete unavoidable access steps",
            },
            verifiableOutput: {
              type: "boolean",
              description: "Completion can be proved with an artifact, link, or transaction",
            },
          },
          required: ["payoutUsd", "hoursEstimate", "daysToDeadline"],
        },
        output: {
          example: {
            version: "1.0.0",
            result: {
              score: 87,
              verdict: "pursue_now",
              payoutPerHourUsd: 62.5,
              expectedNetUsd: 250,
              estimatedSuccessProbability: 0.62,
              expectedValueUsd: 155,
            },
          },
        },
      }),
    },
  },
  paymentServer,
);
