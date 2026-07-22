# Compounder Market API

Machine-payable decision tools for autonomous operators. Payments settle as USDC on Base Mainnet through x402 v2.

For deployment, monitoring, offline recovery, wallet boundaries, and lower-model handoff, read [`OPERATIONS.md`](OPERATIONS.md). The timestamped machine-readable snapshot is [`STATUS.json`](STATUS.json).

## Live product

### Bounty Fit Scorer

- **Endpoint:** `POST /api/bounty-score`
- **Price:** `$0.01 USDC`
- **Network:** Base Mainnet (`eip155:8453`)
- **Settlement:** x402 v2 `exact`
- **Facilitator:** PayAI production facilitator
- **Payee:** `0xc7A7563793C3aeaCA9177a4aa2e4fd7C01F7Eb35`

The scorer returns a 0–100 score, pursue/skip verdict, expected value, weighted breakdown, hard stops, risks, strengths, and a next action. It weights payment certainty and operator fit above headline payout, then favors short, verifiable, AI-leveraged work that compounds into reusable assets.

A free `GET /api/bounty-score` request returns the input schema and example. `GET /api/health` returns service and payment configuration.

## Local verification

```bash
npm ci
npm run verify
npm run verify:production
npm run dev
```

Then inspect:

```bash
curl http://localhost:3000/api/health
curl http://localhost:3000/api/bounty-score
curl -i -X POST http://localhost:3000/api/bounty-score \
  -H 'Content-Type: application/json' \
  -d '{"payoutUsd":250,"hoursEstimate":4,"daysToDeadline":5}'
```

The unpaid POST should return HTTP `402 Payment Required` with x402 payment requirements.

## Continuity

```bash
npm run watchdog
npm run continuity:build
```

The watchdog uses public endpoints only and requires no LLM or wallet signer. The continuity build creates a full Git bundle and a prebuilt standalone server archive that can run without npm or internet access. Encrypted wallet recovery material is deliberately excluded from the repository and runtime archives.

## Configuration

The production-safe defaults are public and embedded for zero-secret deployment:

```dotenv
EVM_ADDRESS=0xc7A7563793C3aeaCA9177a4aa2e4fd7C01F7Eb35
FACILITATOR_URL=https://facilitator.payai.network
```

No wallet signing key is present or required on the server. The facilitator verifies and settles buyer-signed USDC authorizations directly to the payee address.

## Security model

- Server has **no custody** of wallet secrets.
- Exact payment amount only; no token allowance is granted to the service.
- The endpoint settles payment only after a successful handler response.
- Invalid requests return `400` without settlement.
- Scoring logic is deterministic, versioned, tested, and auditable.

## Roadmap

1. Confirm first external x402 payment and Bazaar discovery.
2. Add generated launch-copy and bounty-draft endpoints using a narrowly scoped inference credential.
3. Add usage telemetry that stores no buyer secrets.
4. Raise prices only after measured demand.

## License

Source available for audit. Commercial API operation is reserved by the repository owner unless a separate license is added.
