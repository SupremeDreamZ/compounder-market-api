#!/usr/bin/env node

const BASE_URL = (process.env.COMPOUNDER_BASE_URL ?? "https://compounder-market-api.vercel.app").replace(/\/$/, "");
const EXPECTED = {
  network: "eip155:8453",
  amount: "10000",
  asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  payTo: "0xc7A7563793C3aeaCA9177a4aa2e4fd7C01F7Eb35",
  resource:
    process.env.COMPOUNDER_EXPECTED_RESOURCE_URL ??
    "https://compounder-market-api.vercel.app/api/bounty-score",
  serviceName: "Compounder Market API",
  ownershipProof:
    "0x56f7faf1bf7c3bb03a1463ef9bf381412fee8646b78f01eaa7f91ddde8c997eb389896e62ea62117bdc787648b40caf803df09552183e66b152f95e6424118231b",
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 20_000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function decodePaymentRequired(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  return JSON.parse(Buffer.from(normalized, "base64").toString("utf8"));
}

async function main() {
  const healthResponse = await fetchWithTimeout(`${BASE_URL}/api/health`, {
    headers: { accept: "application/json" },
  });
  assert(healthResponse.ok, `health returned HTTP ${healthResponse.status}`);
  const health = await healthResponse.json();
  assert(health.ok === true, "health payload is not ok");
  assert(health.network === EXPECTED.network, `unexpected health network: ${health.network}`);
  assert(health.payTo?.toLowerCase() === EXPECTED.payTo.toLowerCase(), "unexpected health payee");

  const docsResponse = await fetchWithTimeout(`${BASE_URL}/api/bounty-score`, {
    headers: { accept: "application/json" },
  });
  assert(docsResponse.ok, `free endpoint docs returned HTTP ${docsResponse.status}`);
  const docs = await docsResponse.json();
  assert(docs.service === "Compounder Bounty Fit Scorer", "free endpoint docs identify the wrong service");
  assert(docs.method === "POST", `unexpected docs method: ${docs.method}`);
  assert(docs.price === "$0.01 USDC", `unexpected docs price: ${docs.price}`);

  const [openapiResponse, discoveryResponse, llmsResponse, exampleResponse] = await Promise.all([
    fetchWithTimeout(`${BASE_URL}/openapi.json`, { headers: { accept: "application/json" } }),
    fetchWithTimeout(`${BASE_URL}/.well-known/x402`, { headers: { accept: "application/json" } }),
    fetchWithTimeout(`${BASE_URL}/llms.txt`, { headers: { accept: "text/plain" } }),
    fetchWithTimeout(`${BASE_URL}/api/bounty-score/example`, {
      headers: { accept: "application/json" },
    }),
  ]);
  assert(openapiResponse.ok, `OpenAPI returned HTTP ${openapiResponse.status}`);
  assert(discoveryResponse.ok, `x402 discovery returned HTTP ${discoveryResponse.status}`);
  assert(llmsResponse.ok, `llms.txt returned HTTP ${llmsResponse.status}`);
  assert(exampleResponse.ok, `free example returned HTTP ${exampleResponse.status}`);

  const openapi = await openapiResponse.json();
  const operation = openapi.paths?.["/api/bounty-score"]?.post;
  const paymentInfo = operation?.["x-payment-info"];
  const openapiX402 = paymentInfo?.protocols?.find((protocol) => protocol?.x402)?.x402;
  assert(openapi.openapi === "3.1.0", `unexpected OpenAPI version: ${openapi.openapi}`);
  assert(openapi.info?.["x-guidance"], "OpenAPI is missing info.x-guidance");
  assert(operation?.requestBody, "OpenAPI paid operation is missing an input schema");
  assert(operation?.responses?.["200"], "OpenAPI paid operation is missing an output schema");
  assert(operation?.responses?.["402"], "OpenAPI paid operation is missing a 402 response");
  assert(paymentInfo?.price?.amount === "0.01", "OpenAPI advertises the wrong price");
  assert(openapiX402?.network === EXPECTED.network, "OpenAPI advertises the wrong network");
  assert(openapiX402?.asset?.toLowerCase() === EXPECTED.asset.toLowerCase(), "OpenAPI advertises the wrong asset");
  assert(openapiX402?.payTo?.toLowerCase() === EXPECTED.payTo.toLowerCase(), "OpenAPI advertises the wrong payee");
  assert(
    openapi["x-discovery"]?.ownershipProofs?.includes(EXPECTED.ownershipProof),
    "OpenAPI ownership proof is missing",
  );

  const discovery = await discoveryResponse.json();
  assert(discovery.resources?.includes(EXPECTED.resource), "x402 discovery is missing the paid resource");
  assert(discovery.ownershipProofs?.includes(EXPECTED.ownershipProof), "x402 discovery ownership proof is missing");

  const llms = await llmsResponse.text();
  const canonicalOrigin = new URL(EXPECTED.resource).origin;
  assert(llms.includes(`${canonicalOrigin}/openapi.json`), "llms.txt is missing the OpenAPI URL");
  assert(llms.includes(`POST ${EXPECTED.resource}`), "llms.txt is missing the paid endpoint");

  const example = await exampleResponse.json();
  assert(example.free === true && example.kind === "fixed-example", "free example metadata is invalid");
  assert(Number.isInteger(example.output?.result?.score), "free example lacks a generated score");
  assert(example.output?.result?.recommendedAction, "free example lacks a recommended action");

  const paymentResponse = await fetchWithTimeout(`${BASE_URL}/api/bounty-score`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ payoutUsd: 250, hoursEstimate: 4, daysToDeadline: 5 }),
  });
  assert(paymentResponse.status === 402, `unpaid POST returned HTTP ${paymentResponse.status}, expected 402`);

  const paymentHeader = paymentResponse.headers.get("payment-required");
  assert(paymentHeader, "402 response is missing Payment-Required");
  const requirement = decodePaymentRequired(paymentHeader);
  const accept = requirement.accepts?.find(
    (candidate) => candidate.network === EXPECTED.network && candidate.scheme === "exact",
  );
  assert(accept, "402 response lacks an exact Base payment option");
  assert(String(accept.amount) === EXPECTED.amount, `unexpected atomic amount: ${accept.amount}`);
  assert(accept.asset?.toLowerCase() === EXPECTED.asset.toLowerCase(), "unexpected USDC contract");
  assert(accept.payTo?.toLowerCase() === EXPECTED.payTo.toLowerCase(), "unexpected payment recipient");

  const resource = requirement.resource;
  assert(resource?.url === EXPECTED.resource, `unexpected resource URL: ${resource?.url}`);
  assert(resource?.serviceName === EXPECTED.serviceName, "missing or incorrect service name");
  assert(Array.isArray(resource?.tags) && resource.tags.length > 0, "missing discovery tags");

  const bazaar = requirement.extensions?.bazaar;
  const input = bazaar?.info?.input;
  const methods = bazaar?.schema?.properties?.input?.properties?.method?.enum ?? [];
  assert(input?.bodyType === "json", `Bazaar body type is ${input?.bodyType}, expected json`);
  assert(input?.body && typeof input.body === "object", "Bazaar JSON body example is missing");
  assert(methods.includes("POST"), `Bazaar method enum does not include POST: ${methods.join(",")}`);

  console.log(
    JSON.stringify(
      {
        ok: true,
        checkedAt: new Date().toISOString(),
        baseUrl: BASE_URL,
        health: "ok",
        freeDocs: "ok",
        discovery: {
          openapi: "ok",
          x402Manifest: "ok",
          llms: "ok",
          freeExample: "ok",
          walletOwnershipProof: "present",
        },
        unpaidPostStatus: paymentResponse.status,
        x402Version: requirement.x402Version,
        payment: {
          network: accept.network,
          scheme: accept.scheme,
          amount: accept.amount,
          asset: accept.asset,
          payTo: accept.payTo,
        },
        bazaar: {
          state: "metadata-ready; cataloging requires a facilitator-processed payment",
          method: "POST",
          bodyType: input.bodyType,
          bodyFieldCount: Object.keys(input.body).length,
          serviceName: resource.serviceName,
          tags: resource.tags,
        },
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(`production verification failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
