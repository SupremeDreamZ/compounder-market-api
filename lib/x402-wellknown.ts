import { FACILITATOR_URL, NETWORK, PAY_TO_ADDRESS, USDC_ADDRESS } from "./x402";
import {
  BOUNTY_PRICE_LABEL,
  BOUNTY_PRICE_USD,
  BOUNTY_RESOURCE_URL,
  BOUNTY_SCORER_NAME,
  BOUNTY_SCORER_VERSION,
  PUBLIC_BASE_URL,
  SERVICE_NAME,
} from "./product";

export const OWNERSHIP_PROOF =
  "0x56f7faf1bf7c3bb03a1463ef9bf381412fee8646b78f01eaa7f91ddde8c997eb389896e62ea62117bdc787648b40caf803df09552183e66b152f95e6424118231b";

/**
 * Discovery manifest served at https://<host>/.well-known/x402.
 *
 * Shape follows draft-hawkins-x402-dns-discovery-03 (successor to the expired
 * draft-jeftovic-x402-dns-discovery-00, with a matching extension specification
 * under review in the x402 Foundation). That revision is not final, so the
 * manifest deliberately keeps only these forward-compatible fields:
 *
 *   - x402Version, kind, name, description, resources, attestation, docs, updated
 *     are the draft's fields; unknown fields MUST be ignored by consumers.
 *   - ownershipProofs and instructions are additional fields kept from the
 *     earlier ad-hoc manifest so existing directory registrations and the
 *     x402scan record keep resolving.
 *
 * Bump X402_WELLKNOWN_MANIFEST_UPDATED whenever any value below changes:
 * `updated` is the draft's last-manifest-change timestamp, not a build timestamp.
 */
export const X402_WELLKNOWN_MANIFEST_UPDATED = "2026-09-13T00:00:00Z";

export const X402_WELLKNOWN_MANIFEST = {
  x402Version: 2,
  kind: "resource-server",
  name: SERVICE_NAME,
  description:
    "Deterministic decision tools for autonomous operators: scores a bounty, grant, paid task, or service opportunity for payout quality, payment certainty, AI leverage, time-to-cash, reuse, and execution friction, and returns a structured JSON verdict.",
  resources: [
    {
      url: BOUNTY_RESOURCE_URL,
      method: "POST",
      description: `${BOUNTY_SCORER_NAME} ${BOUNTY_SCORER_VERSION}: returns a 0-100 score, pursue/skip verdict, expected value, breakdown, hard stops, risks, strengths, and a recommended action. Free fixed sample at ${PUBLIC_BASE_URL}/api/bounty-score/example.`,
      price: {
        scheme: "exact",
        network: NETWORK,
        asset: USDC_ADDRESS,
        amountUsd: BOUNTY_PRICE_USD,
        amountLabel: BOUNTY_PRICE_LABEL,
        payTo: PAY_TO_ADDRESS,
        facilitator: FACILITATOR_URL,
      },
    },
  ],
  attestation: { type: "none" },
  docs: PUBLIC_BASE_URL,
  updated: X402_WELLKNOWN_MANIFEST_UPDATED,
  ownershipProofs: [OWNERSHIP_PROOF],
  instructions:
    "Fetch /openapi.json for the canonical contract. GET /api/bounty-score/example returns a free fixed sample; POST /api/bounty-score is paid through x402 v2 exact settlement in USDC on Base Mainnet.",
} as const;

const KINDS = ["facilitator", "resource-server", "both"] as const;
const RFC3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
const SIGNATURE = /^0x[0-9a-f]{130}$/i;
const FORBIDDEN_KEY = /^(privatekey|mnemonic|seed|seedphrase|apikey|api_key|secret|password|passphrase|keystore|recovery|token|authorization|signature)$/i;
const PRIVATE_HOST = /^(localhost|.*\.local|.*\.internal|.*\.localhost|0\.0\.0\.0|\[?::1\]?)$/i;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function httpsUrl(value: unknown): URL | null {
  if (typeof value !== "string") return null;
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:") return null;
  if (parsed.username || parsed.password) return null;
  if (PRIVATE_HOST.test(parsed.hostname)) return null;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(parsed.hostname)) return null;
  return parsed;
}

function sameOrSubdomain(host: string, expected: string): boolean {
  return host === expected || host.endsWith(`.${expected}`);
}

function walkForSecrets(value: unknown, path: string, problems: string[]): void {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => walkForSecrets(entry, `${path}[${index}]`, problems));
    return;
  }
  if (!isPlainObject(value)) return;
  for (const [key, entry] of Object.entries(value)) {
    if (FORBIDDEN_KEY.test(key)) problems.push(`${path}.${key}: secret-bearing field is not allowed in a public manifest`);
    walkForSecrets(entry, `${path}.${key}`, problems);
  }
}

/**
 * Adversarial contract check for the public well-known manifest. Returns an empty
 * array only when the manifest is safe to serve: required draft fields present,
 * every resource URL https on the manifest's own host, no private or link-local
 * destinations (the draft forbids a manifest from turning crawlers into an SSRF
 * vector), and no secret-bearing field names anywhere in the document.
 */
export function validateX402WellKnownManifest(value: unknown, expectedHost: string): string[] {
  const problems: string[] = [];
  if (!isPlainObject(value)) return ["manifest: not a JSON object"];

  if (value.x402Version !== 2) problems.push(`x402Version: expected 2, got ${JSON.stringify(value.x402Version)}`);
  if (!KINDS.includes(value.kind as (typeof KINDS)[number])) {
    problems.push(`kind: expected one of ${KINDS.join(", ")}, got ${JSON.stringify(value.kind)}`);
  }
  for (const field of ["name", "description"] as const) {
    if (typeof value[field] !== "string" || (value[field] as string).trim() === "") problems.push(`${field}: missing or empty`);
  }
  if (typeof value.updated !== "string" || !RFC3339.test(value.updated)) {
    problems.push(`updated: expected an RFC3339 timestamp, got ${JSON.stringify(value.updated)}`);
  }
  const docs = httpsUrl(value.docs);
  if (!docs) problems.push("docs: expected a public https URL");

  if (value.kind === "facilitator" || value.kind === "both") {
    const facilitator = value.facilitator;
    const baseUrl = isPlainObject(facilitator) ? httpsUrl(facilitator.baseUrl) : null;
    if (!baseUrl) problems.push("facilitator.baseUrl: required when kind includes facilitator");
    else if (!sameOrSubdomain(baseUrl.hostname, expectedHost)) {
      problems.push(`facilitator.baseUrl: host ${baseUrl.hostname} is not ${expectedHost} or a subdomain of it`);
    }
  } else if (value.facilitator !== undefined) {
    problems.push("facilitator: must be omitted when kind is resource-server");
  }

  if (!Array.isArray(value.resources) || value.resources.length === 0) {
    problems.push("resources: expected a non-empty array of resource objects");
  } else {
    value.resources.forEach((entry, index) => {
      const label = `resources[${index}]`;
      if (!isPlainObject(entry)) {
        problems.push(`${label}: expected an object with url, method, and description`);
        return;
      }
      const url = httpsUrl(entry.url);
      if (!url) problems.push(`${label}.url: expected a public https URL`);
      else if (!sameOrSubdomain(url.hostname, expectedHost)) {
        problems.push(`${label}.url: host ${url.hostname} is not ${expectedHost} or a subdomain of it`);
      }
      for (const field of ["method", "description"] as const) {
        if (typeof entry[field] !== "string" || (entry[field] as string).trim() === "") {
          problems.push(`${label}.${field}: missing or empty`);
        }
      }
      if (isPlainObject(entry.price)) {
        if (entry.price.network !== NETWORK) problems.push(`${label}.price.network: expected ${NETWORK}`);
        if (String(entry.price.asset ?? "").toLowerCase() !== USDC_ADDRESS.toLowerCase()) {
          problems.push(`${label}.price.asset: expected the canonical Base USDC contract`);
        }
        if (String(entry.price.payTo ?? "").toLowerCase() !== PAY_TO_ADDRESS.toLowerCase()) {
          problems.push(`${label}.price.payTo: does not match the configured receiving address`);
        }
      }
    });
  }

  if (!Array.isArray(value.ownershipProofs) || value.ownershipProofs.length === 0) {
    problems.push("ownershipProofs: expected a non-empty array");
  } else if (!value.ownershipProofs.every((proof) => typeof proof === "string" && SIGNATURE.test(proof))) {
    problems.push("ownershipProofs: every entry must be a 65-byte hex EIP-191 signature");
  }

  walkForSecrets(value, "manifest", problems);
  return problems;
}

export const X402_WELLKNOWN_HEADERS = {
  "Cache-Control": "public, max-age=300, s-maxage=3600",
  "Access-Control-Allow-Origin": "*",
  "X-Content-Type-Options": "nosniff",
} as const;
