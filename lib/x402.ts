import { HTTPFacilitatorClient, x402ResourceServer } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";

export const NETWORK = "eip155:8453" as const;
export const USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;
export const PAY_TO_ADDRESS = (process.env.EVM_ADDRESS ??
  "0xc7A7563793C3aeaCA9177a4aa2e4fd7C01F7Eb35") as `0x${string}`;
export const FACILITATOR_URL =
  process.env.FACILITATOR_URL ?? "https://facilitator.payai.network";

const facilitatorClient = new HTTPFacilitatorClient({ url: FACILITATOR_URL });

export const paymentServer = new x402ResourceServer(facilitatorClient).register(
  NETWORK,
  new ExactEvmScheme(),
);
