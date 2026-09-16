import test from "node:test";
import assert from "node:assert/strict";
import {
  bazaarResourceServerExtension,
  validateDiscoveryExtension,
  validateDiscoveryExtensionSpec,
} from "@x402/extensions/bazaar";
import { BOUNTY_ROUTE_CONFIG } from "../lib/bounty-route";
import { paymentServer } from "../lib/x402";

/**
 * Regression gates for the served Bazaar discovery declaration.
 *
 * Background: the production deployment served a declaration whose
 * `info.input` was missing `method` (request-time enrichment did not run in
 * the serverless bundle because @x402/next's dynamic bazaar auto-registration
 * was skipped), while the declaration's own embedded schema required
 * ["type", "method", "bodyType", "body"]. PayAI's facilitator validated the
 * declaration against that schema and rejected cataloging with
 * "Bazaar extension validation failed: Invalid input at info.input".
 *
 * Fix: the bazaar resource-server extension is registered statically on
 * `paymentServer` (lib/x402.ts), so request-time enrichment runs in every
 * bundle. These tests pin the registration, the enriched serving form, and the
 * validator verdicts so the defect cannot ship again unnoticed.
 */

type DiscoveryExtensionArg = Parameters<typeof validateDiscoveryExtension>[0];

const declaration = BOUNTY_ROUTE_CONFIG.extensions?.bazaar as unknown as DiscoveryExtensionArg;

function serveEnriched() {
  return bazaarResourceServerExtension.enrichDeclaration!(
    structuredClone(declaration),
    { method: "POST", adapter: {} } as never,
  ) as unknown as DiscoveryExtensionArg;
}

test("bazaar extension is registered on the payment server (static registration)", () => {
  assert.equal(paymentServer.hasExtension("bazaar"), true);
});

test("the served (enriched) declaration carries method POST and passes the ecosystem validator", () => {
  const served = serveEnriched();
  const input = (served as { info?: { input?: Record<string, unknown> } }).info?.input;
  assert.equal(input?.type, "http");
  assert.equal(input?.method, "POST");
  assert.equal(input?.bodyType, "json");
  assert.ok(input?.body && typeof input.body === "object", "JSON body example is missing");
  const spec = validateDiscoveryExtensionSpec(served as unknown as Record<string, unknown>);
  assert.equal(spec.valid, true, `spec errors: ${(spec.errors ?? []).join(", ")}`);
  const schema = validateDiscoveryExtension(served);
  assert.equal(schema.valid, true, `schema errors: ${(schema.errors ?? []).join(", ")}`);
});

test("the raw declaration without enrichment is invalid — enrichment is load-bearing", () => {
  const result = validateDiscoveryExtension(structuredClone(declaration));
  assert.equal(result.valid, false, "expected the un-enriched declaration to fail (missing method)");
});

test("gauntlet: declarations violating the required input keys are rejected", () => {
  // Each mutation reproduces a class of invalid served declarations; every one
  // must fail validation so a regression is caught before deployment.
  const violations: Array<[string, (ext: DiscoveryExtensionArg) => unknown]> = [
    [
      "missing method (the 2026-09 production regression)",
      (ext) => {
        const copy = structuredClone(ext) as { info: { input: Record<string, unknown> } };
        delete copy.info.input.method;
        return copy;
      },
    ],
    [
      "missing bodyType",
      (ext) => {
        const copy = structuredClone(ext) as { info: { input: Record<string, unknown> } };
        delete copy.info.input.bodyType;
        return copy;
      },
    ],
    [
      "missing body example",
      (ext) => {
        const copy = structuredClone(ext) as { info: { input: Record<string, unknown> } };
        delete copy.info.input.body;
        return copy;
      },
    ],
    [
      "body method replaced with a query method",
      (ext) => {
        const copy = structuredClone(ext) as { info: { input: Record<string, unknown> } };
        copy.info.input.method = "GET";
        return copy;
      },
    ],
  ];

  for (const [label, mutate] of violations) {
    const mutated = mutate(serveEnriched());
    const result = validateDiscoveryExtension(mutated as DiscoveryExtensionArg);
    assert.equal(result.valid, false, `expected rejection: ${label}`);
  }
});
