import { FACILITATOR_URL, NETWORK, PAY_TO_ADDRESS, USDC_ADDRESS } from "./x402";
import {
  BOUNTY_INPUT_SCHEMA,
  BOUNTY_OUTPUT_SCHEMA,
  BOUNTY_PRICE_LABEL,
  BOUNTY_PRICE_USD,
  BOUNTY_RESOURCE_URL,
  BOUNTY_SCORER_NAME,
  BOUNTY_SCORER_VERSION,
  EXAMPLE_INPUT,
  EXAMPLE_OUTPUT,
  PRODUCT_TAGS,
  PUBLIC_BASE_URL,
  SERVICE_NAME,
  SERVICE_VERSION,
} from "./product";

export const OWNERSHIP_PROOF =
  "0x56f7faf1bf7c3bb03a1463ef9bf381412fee8646b78f01eaa7f91ddde8c997eb389896e62ea62117bdc787648b40caf803df09552183e66b152f95e6424118231b";

export const X402_DISCOVERY_DOCUMENT = {
  version: 1,
  resources: [BOUNTY_RESOURCE_URL],
  ownershipProofs: [OWNERSHIP_PROOF],
  instructions:
    "Fetch /openapi.json for the canonical contract. GET /api/bounty-score/example returns a free fixed sample; POST /api/bounty-score is paid through x402.",
} as const;

export const OPENAPI_DOCUMENT = {
  openapi: "3.1.0",
  info: {
    title: SERVICE_NAME,
    version: SERVICE_VERSION,
    description:
      "Deterministic decision tools for autonomous operators, settled in USDC on Base through x402 v2.",
    contact: {
      name: "Compounder Market API",
      url: "https://github.com/SupremeDreamZ/compounder-market-api",
    },
    "x-guidance":
      "Use GET /api/bounty-score/example to inspect a fixed free result. Use POST /api/bounty-score with a JSON opportunity body for a paid assessment. On HTTP 402, satisfy the x402 v2 exact-payment challenge and retry the same request.",
  },
  servers: [{ url: PUBLIC_BASE_URL, description: "Production" }],
  externalDocs: {
    description: "Source, tests, and operations documentation",
    url: "https://github.com/SupremeDreamZ/compounder-market-api",
  },
  tags: [
    { name: "Scoring", description: "Opportunity scoring and evidence-gated decisions" },
    { name: "Discovery", description: "Free schemas, examples, and service health" },
  ],
  "x-discovery": {
    ownershipProofs: [OWNERSHIP_PROOF],
  },
  paths: {
    "/api/health": {
      get: {
        operationId: "getHealth",
        summary: "Inspect service and payment configuration",
        tags: ["Discovery"],
        security: [],
        responses: {
          "200": {
            description: "Service is healthy",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Health" },
              },
            },
          },
        },
      },
    },
    "/api/bounty-score": {
      get: {
        operationId: "getBountyScoreDocumentation",
        summary: "Inspect Bounty Fit Scorer documentation",
        tags: ["Discovery"],
        security: [],
        responses: {
          "200": {
            description: "Scorer documentation, schema links, and fixed example",
            content: {
              "application/json": {
                schema: { type: "object" },
              },
            },
          },
        },
      },
      post: {
        operationId: "scoreBounty",
        summary: "Score a bounty or paid opportunity",
        description:
          "Returns a deterministic 0-100 score, pursue/skip verdict, expected value, breakdown, hard stops, risks, strengths, and recommended action.",
        tags: ["Scoring"],
        security: [],
        "x-payment-info": {
          price: { mode: "fixed", currency: "USD", amount: BOUNTY_PRICE_USD },
          protocols: [
            {
              x402: {
                version: 2,
                scheme: "exact",
                network: NETWORK,
                asset: USDC_ADDRESS,
                payTo: PAY_TO_ADDRESS,
                facilitator: FACILITATOR_URL,
              },
            },
          ],
        },
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/BountyInput" },
              example: EXAMPLE_INPUT,
            },
          },
        },
        responses: {
          "200": {
            description: "Successful paid assessment",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/BountyAssessment" },
                example: EXAMPLE_OUTPUT,
              },
            },
          },
          "400": {
            description: "Invalid opportunity input; payment is not settled",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
              },
            },
          },
          "402": {
            description: `Payment Required — ${BOUNTY_PRICE_LABEL} on Base Mainnet`,
            headers: {
              "Payment-Required": {
                description: "Base64-encoded x402 v2 payment requirements",
                schema: { type: "string" },
              },
            },
          },
        },
      },
    },
    "/api/bounty-score/example": {
      get: {
        operationId: "getBountyScoreExample",
        summary: "Inspect a free fixed input and output sample",
        tags: ["Discovery"],
        security: [],
        responses: {
          "200": {
            description: "Fixed sample generated by the production scoring core",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/FixedExample" },
              },
            },
          },
        },
      },
    },
  },
  components: {
    schemas: {
      BountyInput: BOUNTY_INPUT_SCHEMA,
      BountyAssessment: BOUNTY_OUTPUT_SCHEMA,
      FixedExample: {
        type: "object",
        properties: {
          free: { type: "boolean", const: true },
          kind: { type: "string", const: "fixed-example" },
          input: BOUNTY_INPUT_SCHEMA,
          output: BOUNTY_OUTPUT_SCHEMA,
        },
        required: ["free", "kind", "input", "output"],
      },
      Health: {
        type: "object",
        properties: {
          ok: { type: "boolean", const: true },
          service: { type: "string", const: SERVICE_NAME },
          version: { type: "string", const: SERVICE_VERSION },
          network: { type: "string", const: NETWORK },
          payTo: { type: "string", const: PAY_TO_ADDRESS },
        },
        required: ["ok", "service", "version", "network", "payTo"],
      },
      Error: {
        type: "object",
        properties: { error: { type: "string" } },
        required: ["error"],
      },
    },
  },
} as const;

export const LLMS_TEXT = `# ${SERVICE_NAME}

> Deterministic decision tools for autonomous operators, paid in USDC on Base through x402 v2.

Canonical origin: ${PUBLIC_BASE_URL}
Source: https://github.com/SupremeDreamZ/compounder-market-api
OpenAPI 3.1: ${PUBLIC_BASE_URL}/openapi.json
x402 discovery: ${PUBLIC_BASE_URL}/.well-known/x402

## Free discovery

- Health and payment configuration: GET ${PUBLIC_BASE_URL}/api/health
- Bounty scorer documentation: GET ${BOUNTY_RESOURCE_URL}
- Fixed input/output sample: GET ${PUBLIC_BASE_URL}/api/bounty-score/example

## Paid tool: ${BOUNTY_SCORER_NAME} ${BOUNTY_SCORER_VERSION}

Endpoint: POST ${BOUNTY_RESOURCE_URL}
Price: ${BOUNTY_PRICE_LABEL}
Network: Base Mainnet (${NETWORK})
Token: USDC (${USDC_ADDRESS})
Scheme: x402 v2 exact
Authentication: no API key or account

The scorer evaluates paid opportunities by payment certainty, operator fit, AI leverage, reuse value, time-to-cash, payout quality, execution friction, and competition. It returns a 0-100 score, pursue/skip verdict, expected value, weighted breakdown, hard stops, risks, strengths, and a recommended action.

Required JSON fields: payoutUsd, hoursEstimate, daysToDeadline.
Optional fields and limits are defined in the OpenAPI document.

## Payment flow

1. POST the JSON opportunity body without payment.
2. Read the HTTP 402 Payment-Required header.
3. Satisfy the Base USDC x402 v2 exact-payment requirement.
4. Retry the identical POST with PAYMENT-SIGNATURE.
5. Payment settles only after successful scoring; invalid handler input returns 400 without settlement.

## Trust and ownership

Payee: ${PAY_TO_ADDRESS}
The OpenAPI and /.well-known/x402 documents include an EIP-191 ownership proof signed by this payee over the canonical origin.
The server contains no wallet private key and requires no buyer API key.
`;
