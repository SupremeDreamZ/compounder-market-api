import type { RouteConfig } from "@x402/core/server";
import { declareDiscoveryExtension } from "@x402/extensions/bazaar";
import {
  BOUNTY_INPUT_SCHEMA,
  BOUNTY_PRICE_USD,
  BOUNTY_RESOURCE_URL,
  EXAMPLE_INPUT,
  EXAMPLE_OUTPUT,
  PRODUCT_TAGS,
  PUBLIC_BASE_URL,
  SERVICE_NAME,
} from "./product";
import { NETWORK, PAY_TO_ADDRESS } from "./x402";

/**
 * Paid route configuration for POST /api/bounty-score, shared by the production
 * route handler and the deterministic test suite so both exercise one artifact.
 *
 * The Bazaar discovery declaration is built without `method` (mandated by the
 * @x402/extensions 2.19.0 config types) and receives `method: "POST"` through
 * request-time enrichment by `bazaarResourceServerExtension`, which is registered
 * statically on `paymentServer` in lib/x402.ts. That registration is load-
 * bearing: @x402/next's own auto-registration uses a dynamic import that did
 * not execute in the production serverless bundle, which left the served
 * declaration without the required `method` and failed facilitator validation
 * ("Bazaar extension validation failed: Invalid input at info.input").
 */
export const BOUNTY_ROUTE_CONFIG: RouteConfig = {
  accepts: [
    {
      scheme: "exact",
      price: `$${BOUNTY_PRICE_USD}`,
      network: NETWORK,
      payTo: PAY_TO_ADDRESS,
    },
  ],
  resource: BOUNTY_RESOURCE_URL,
  description:
    "Score a bounty, grant, paid task, or service opportunity for payout quality, payment certainty, AI leverage, time-to-cash, reuse, and execution friction.",
  mimeType: "application/json",
  serviceName: SERVICE_NAME,
  tags: [...PRODUCT_TAGS],
  iconUrl: `${PUBLIC_BASE_URL}/icon.svg`,
  extensions: {
    ...declareDiscoveryExtension({
      bodyType: "json",
      input: EXAMPLE_INPUT,
      inputSchema: {
        properties: BOUNTY_INPUT_SCHEMA.properties,
        required: [...BOUNTY_INPUT_SCHEMA.required],
      },
      output: {
        example: EXAMPLE_OUTPUT,
      },
    }),
  },
};
