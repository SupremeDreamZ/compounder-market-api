import { scoreBounty, type BountyInput } from "./scoring";

export const PUBLIC_BASE_URL = "https://compounder-market-api.vercel.app";
export const SERVICE_NAME = "Compounder Market API";
export const SERVICE_VERSION = "0.1.0";
export const BOUNTY_SCORER_NAME = "Compounder Bounty Fit Scorer";
export const BOUNTY_SCORER_VERSION = "1.0.0";
export const BOUNTY_PRICE_USD = "0.01";
export const BOUNTY_PRICE_LABEL = "$0.01 USDC";
export const BOUNTY_RESOURCE_URL = `${PUBLIC_BASE_URL}/api/bounty-score`;
export const PRODUCT_TAGS = ["bounty", "scoring", "agents", "base", "opportunities"] as const;

export const EXAMPLE_INPUT = {
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
} satisfies BountyInput;

export const EXAMPLE_OUTPUT = scoreBounty(EXAMPLE_INPUT);

export const BOUNTY_INPUT_PROPERTIES = {
  title: {
    type: "string",
    minLength: 1,
    maxLength: 160,
    description: "Short opportunity title",
  },
  payoutUsd: {
    type: "number",
    minimum: 0,
    maximum: 10_000_000,
    description: "Headline payout in USD",
  },
  hoursEstimate: {
    type: "number",
    minimum: 0.1,
    maximum: 10_000,
    description: "Estimated delivery hours",
  },
  daysToDeadline: {
    type: "number",
    minimum: 0,
    maximum: 3_650,
    description: "Calendar days until deadline",
  },
  daysToPayout: {
    type: "number",
    minimum: 0,
    maximum: 3_650,
    default: 30,
    description: "Expected days until payment",
  },
  existingSubmissions: {
    type: "number",
    minimum: 0,
    maximum: 10_000_000,
    default: 0,
    description: "Known competing submissions or applicants",
  },
  fit: {
    type: "number",
    minimum: 1,
    maximum: 5,
    default: 3,
    description: "Operator fit from 1 to 5",
  },
  paymentCertainty: {
    type: "number",
    minimum: 1,
    maximum: 5,
    default: 3,
    description: "Confidence that valid work gets paid, from 1 to 5",
  },
  aiLeverage: {
    type: "number",
    minimum: 1,
    maximum: 5,
    default: 3,
    description: "How much AI compresses delivery time, from 1 to 5",
  },
  reuseValue: {
    type: "number",
    minimum: 1,
    maximum: 5,
    default: 3,
    description: "Future template or asset reuse value, from 1 to 5",
  },
  cashCostUsd: {
    type: "number",
    minimum: 0,
    maximum: 10_000_000,
    default: 0,
    description: "Cash required before earning",
  },
  requiresAccount: {
    type: "boolean",
    default: false,
    description: "Requires a platform account",
  },
  requiresPublicPost: {
    type: "boolean",
    default: false,
    description: "Requires posting from a public social identity",
  },
  requiresPurchase: {
    type: "boolean",
    default: false,
    description: "Requires buying an asset or product first",
  },
  agentAccessible: {
    type: "boolean",
    default: true,
    description: "Can an autonomous agent execute the workflow directly",
  },
  humanSupportAvailable: {
    type: "boolean",
    default: false,
    description: "A human can complete unavoidable access steps",
  },
  verifiableOutput: {
    type: "boolean",
    default: true,
    description: "Completion can be proved with an artifact, link, or transaction",
  },
} as const;

export const BOUNTY_INPUT_SCHEMA = {
  type: "object",
  properties: BOUNTY_INPUT_PROPERTIES,
  required: ["payoutUsd", "hoursEstimate", "daysToDeadline"],
} as const;

const DIMENSION_SCHEMA = {
  type: "object",
  properties: {
    score: { type: "number", minimum: 1, maximum: 5 },
    weight: { type: "number", minimum: 0, maximum: 100 },
    contribution: { type: "number", minimum: 0, maximum: 100 },
  },
  required: ["score", "weight", "contribution"],
} as const;

export const BOUNTY_OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    version: { type: "string", const: BOUNTY_SCORER_VERSION },
    input: BOUNTY_INPUT_SCHEMA,
    result: {
      type: "object",
      properties: {
        score: { type: "integer", minimum: 0, maximum: 100 },
        verdict: {
          type: "string",
          enum: ["pursue_now", "pursue_if_capacity", "watch_or_reframe", "skip"],
        },
        payoutPerHourUsd: { type: "number" },
        expectedNetUsd: { type: "number" },
        estimatedSuccessProbability: { type: "number", minimum: 0, maximum: 1 },
        expectedValueUsd: { type: "number" },
        breakdown: {
          type: "object",
          additionalProperties: DIMENSION_SCHEMA,
        },
        penalties: {
          type: "array",
          items: {
            type: "object",
            properties: {
              reason: { type: "string" },
              points: { type: "number" },
            },
            required: ["reason", "points"],
          },
        },
        hardStops: { type: "array", items: { type: "string" } },
        strengths: { type: "array", items: { type: "string" } },
        risks: { type: "array", items: { type: "string" } },
        recommendedAction: { type: "string" },
      },
      required: [
        "score",
        "verdict",
        "payoutPerHourUsd",
        "expectedNetUsd",
        "estimatedSuccessProbability",
        "expectedValueUsd",
        "breakdown",
        "penalties",
        "hardStops",
        "strengths",
        "risks",
        "recommendedAction",
      ],
    },
    method: {
      type: "object",
      properties: {
        principle: { type: "string" },
        weights: { type: "object", additionalProperties: { type: "number" } },
      },
      required: ["principle", "weights"],
    },
  },
  required: ["version", "input", "result", "method"],
} as const;
