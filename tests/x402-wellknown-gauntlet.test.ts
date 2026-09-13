/**
 * Versioned gauntlet for the public discovery manifest at /.well-known/x402.
 *
 * Deterministic, offline, no network: it runs the shipped artifact
 * (X402_WELLKNOWN_MANIFEST imported verbatim) through the same validator the
 * production verifier applies to the live response, then replays adversarial
 * scenarios that each violate exactly one rule of
 * draft-hawkins-x402-dns-discovery-03. Any scenario that slips past the
 * validator fails the build, so a regression cannot ship to the live surface.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  X402_WELLKNOWN_MANIFEST,
  X402_WELLKNOWN_MANIFEST_UPDATED,
  validateX402WellKnownManifest,
} from "../lib/x402-wellknown";
import { BOUNTY_RESOURCE_URL, PUBLIC_BASE_URL } from "../lib/product";
import { NETWORK, PAY_TO_ADDRESS, USDC_ADDRESS } from "../lib/x402";

const HOST = new URL(PUBLIC_BASE_URL).host;
const clone = () => JSON.parse(JSON.stringify(X402_WELLKNOWN_MANIFEST)) as Record<string, unknown>;

test("gauntlet: shipped manifest is clean against the draft contract", () => {
  assert.deepEqual(validateX402WellKnownManifest(X402_WELLKNOWN_MANIFEST, HOST), []);
});

test("gauntlet: manifest advertises the live paid resource and its exact terms", () => {
  const [resource] = X402_WELLKNOWN_MANIFEST.resources;
  assert.equal(resource.url, BOUNTY_RESOURCE_URL);
  assert.equal(resource.method, "POST");
  assert.equal(resource.price.network, NETWORK);
  assert.equal(resource.price.asset, USDC_ADDRESS);
  assert.equal(resource.price.payTo, PAY_TO_ADDRESS);
  assert.equal(resource.price.scheme, "exact");
  assert.equal(resource.price.amountUsd, "0.01");
  assert.equal(X402_WELLKNOWN_MANIFEST.kind, "resource-server");
  assert.equal(X402_WELLKNOWN_MANIFEST.x402Version, 2);
  assert.match(X402_WELLKNOWN_MANIFEST_UPDATED, /^\d{4}-\d{2}-\d{2}T/);
});

test("gauntlet: identity must not drift from the service contract", () => {
  assert.equal(X402_WELLKNOWN_MANIFEST.name, "Compounder Market API");
  assert.equal(X402_WELLKNOWN_MANIFEST.docs, PUBLIC_BASE_URL);
  assert.equal(X402_WELLKNOWN_MANIFEST.attestation.type, "none");
  assert.ok(X402_WELLKNOWN_MANIFEST.description.length > 40);
});

const scenarios: Array<[string, (manifest: Record<string, unknown>) => void, RegExp]> = [
  [
    "wrong protocol version",
    (m) => {
      m.x402Version = 1;
    },
    /x402Version/,
  ],
  [
    "missing role declaration",
    (m) => {
      delete m.kind;
    },
    /kind/,
  ],
  [
    "role declared as facilitator without a same-host facilitator block",
    (m) => {
      m.kind = "facilitator";
    },
    /facilitator\.baseUrl/,
  ],
  [
    "facilitator block pointing at a third party",
    (m) => {
      m.kind = "both";
      m.facilitator = { baseUrl: "https://facilitator.example.com" };
    },
    /not .*subdomain/,
  ],
  [
    "resource listed as a bare string",
    (m) => {
      m.resources = [BOUNTY_RESOURCE_URL];
    },
    /resources\[0\]/,
  ],
  [
    "resource on a foreign domain",
    (m) => {
      (m.resources as Array<Record<string, unknown>>)[0].url = "https://evil.example.com/api/bounty-score";
    },
    /not .*subdomain/,
  ],
  [
    "resource served over plain http",
    (m) => {
      (m.resources as Array<Record<string, unknown>>)[0].url = `http://${HOST}/api/bounty-score`;
    },
    /public https URL/,
  ],
  [
    "resource pointing at a link-local or private destination",
    (m) => {
      (m.resources as Array<Record<string, unknown>>)[0].url = "https://169.254.169.254/latest/meta-data";
    },
    /public https URL/,
  ],
  [
    "resource pointing at localhost",
    (m) => {
      (m.resources as Array<Record<string, unknown>>)[0].url = "https://localhost:4021/api/bounty-score";
    },
    /public https URL/,
  ],
  [
    "resource missing its method",
    (m) => {
      delete (m.resources as Array<Record<string, unknown>>)[0].method;
    },
    /method/,
  ],
  [
    "price advertised on the wrong network",
    (m) => {
      ((m.resources as Array<Record<string, unknown>>)[0].price as Record<string, unknown>).network = "eip155:1";
    },
    /price\.network/,
  ],
  [
    "price settling to a swapped payee",
    (m) => {
      ((m.resources as Array<Record<string, unknown>>)[0].price as Record<string, unknown>).payTo =
        "0x900060ab59F8a9d9B528C2E26AFb5841639DC019";
    },
    /price\.payTo/,
  ],
  [
    "stale non-RFC3339 timestamp",
    (m) => {
      m.updated = "2026-09-13";
    },
    /updated/,
  ],
  [
    "ownership proof replaced with a malformed value",
    (m) => {
      m.ownershipProofs = ["0xdeadbeef"];
    },
    /ownershipProofs/,
  ],
  [
    "ownership proof removed entirely",
    (m) => {
      delete m.ownershipProofs;
    },
    /ownershipProofs/,
  ],
  [
    "secret-bearing field smuggled into the public manifest",
    (m) => {
      (m.resources as Array<Record<string, unknown>>)[0].apiKey = "not-a-real-key";
    },
    /secret-bearing field/,
  ],
  [
    "empty description",
    (m) => {
      m.description = "   ";
    },
    /description/,
  ],
  [
    "no resources at all",
    (m) => {
      m.resources = [];
    },
    /resources/,
  ],
];

for (const [name, mutate, expected] of scenarios) {
  test(`gauntlet: rejects ${name}`, () => {
    const manifest = clone();
    mutate(manifest);
    const problems = validateX402WellKnownManifest(manifest, HOST);
    assert.ok(problems.length > 0, `validator accepted a manifest with ${name}`);
    assert.match(problems.join("\n"), expected);
  });
}

test("gauntlet: validator fails closed on non-object input", () => {
  for (const value of [null, undefined, 42, "manifest", []]) {
    assert.ok(validateX402WellKnownManifest(value, HOST).length > 0, `accepted ${JSON.stringify(value)}`);
  }
});
