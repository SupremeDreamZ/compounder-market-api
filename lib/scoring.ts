export type BountyInput = {
  title?: string;
  payoutUsd: number;
  hoursEstimate: number;
  daysToDeadline: number;
  daysToPayout?: number;
  existingSubmissions?: number;
  fit?: number;
  paymentCertainty?: number;
  aiLeverage?: number;
  reuseValue?: number;
  cashCostUsd?: number;
  requiresAccount?: boolean;
  requiresPublicPost?: boolean;
  requiresPurchase?: boolean;
  agentAccessible?: boolean;
  humanSupportAvailable?: boolean;
  verifiableOutput?: boolean;
};

export type NormalizedBountyInput = Required<BountyInput>;

type DimensionName =
  | "paymentCertainty"
  | "fit"
  | "aiLeverage"
  | "reuseValue"
  | "timeToCash"
  | "payoutQuality"
  | "platformFriction"
  | "competition";

export type BountyAssessment = {
  version: "1.0.0";
  input: NormalizedBountyInput;
  result: {
    score: number;
    verdict: "pursue_now" | "pursue_if_capacity" | "watch_or_reframe" | "skip";
    payoutPerHourUsd: number;
    expectedNetUsd: number;
    estimatedSuccessProbability: number;
    expectedValueUsd: number;
    breakdown: Record<DimensionName, { score: number; weight: number; contribution: number }>;
    penalties: Array<{ reason: string; points: number }>;
    hardStops: string[];
    strengths: string[];
    risks: string[];
    recommendedAction: string;
  };
  method: {
    principle: string;
    weights: Record<DimensionName, number>;
  };
};

const WEIGHTS: Record<DimensionName, number> = {
  paymentCertainty: 20,
  fit: 17,
  aiLeverage: 15,
  reuseValue: 14,
  timeToCash: 12,
  payoutQuality: 12,
  platformFriction: 7,
  competition: 3,
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

function requireObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Request body must be a JSON object.");
  }
  return value as Record<string, unknown>;
}

function numberField(
  source: Record<string, unknown>,
  name: string,
  options: { required?: boolean; defaultValue?: number; min: number; max: number },
): number {
  const raw = source[name];
  if (raw === undefined || raw === null || raw === "") {
    if (options.required) throw new Error(`${name} is required.`);
    return options.defaultValue as number;
  }
  const value = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(value) || value < options.min || value > options.max) {
    throw new Error(`${name} must be a number from ${options.min} to ${options.max}.`);
  }
  return value;
}

function booleanField(source: Record<string, unknown>, name: string, defaultValue: boolean): boolean {
  const value = source[name];
  if (value === undefined || value === null) return defaultValue;
  if (typeof value !== "boolean") throw new Error(`${name} must be true or false.`);
  return value;
}

function normalizeInput(raw: unknown): NormalizedBountyInput {
  const source = requireObject(raw);
  const titleRaw = source.title;
  const title = titleRaw === undefined ? "Untitled opportunity" : String(titleRaw).trim();
  if (!title || title.length > 160) throw new Error("title must contain 1 to 160 characters.");

  return {
    title,
    payoutUsd: numberField(source, "payoutUsd", { required: true, min: 0, max: 10_000_000 }),
    hoursEstimate: numberField(source, "hoursEstimate", {
      required: true,
      min: 0.1,
      max: 10_000,
    }),
    daysToDeadline: numberField(source, "daysToDeadline", {
      required: true,
      min: 0,
      max: 3_650,
    }),
    daysToPayout: numberField(source, "daysToPayout", {
      defaultValue: 30,
      min: 0,
      max: 3_650,
    }),
    existingSubmissions: numberField(source, "existingSubmissions", {
      defaultValue: 0,
      min: 0,
      max: 10_000_000,
    }),
    fit: numberField(source, "fit", { defaultValue: 3, min: 1, max: 5 }),
    paymentCertainty: numberField(source, "paymentCertainty", {
      defaultValue: 3,
      min: 1,
      max: 5,
    }),
    aiLeverage: numberField(source, "aiLeverage", { defaultValue: 3, min: 1, max: 5 }),
    reuseValue: numberField(source, "reuseValue", { defaultValue: 3, min: 1, max: 5 }),
    cashCostUsd: numberField(source, "cashCostUsd", {
      defaultValue: 0,
      min: 0,
      max: 10_000_000,
    }),
    requiresAccount: booleanField(source, "requiresAccount", false),
    requiresPublicPost: booleanField(source, "requiresPublicPost", false),
    requiresPurchase: booleanField(source, "requiresPurchase", false),
    agentAccessible: booleanField(source, "agentAccessible", true),
    humanSupportAvailable: booleanField(source, "humanSupportAvailable", false),
    verifiableOutput: booleanField(source, "verifiableOutput", true),
  };
}

function payoutQuality(payoutPerHourUsd: number): number {
  if (payoutPerHourUsd < 5) return 1;
  if (payoutPerHourUsd < 15) return 2;
  if (payoutPerHourUsd < 35) return 3;
  if (payoutPerHourUsd < 75) return 4;
  return 5;
}

function timeToCash(days: number): number {
  if (days <= 7) return 5;
  if (days <= 14) return 4;
  if (days <= 30) return 3;
  if (days <= 60) return 2;
  return 1;
}

function competitionScore(submissions: number): number {
  if (submissions <= 5) return 5;
  if (submissions <= 20) return 4;
  if (submissions <= 50) return 3;
  if (submissions <= 100) return 2;
  return 1;
}

function platformFriction(input: NormalizedBountyInput): number {
  let score = 5;
  if (input.requiresAccount) score -= 1;
  if (input.requiresPublicPost) score -= 1;
  if (input.requiresPurchase) score -= 2;
  if (!input.agentAccessible) score -= 2;
  if (!input.agentAccessible && input.humanSupportAvailable) score += 1;
  return clamp(score, 1, 5);
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function scoreBounty(raw: unknown): BountyAssessment {
  const input = normalizeInput(raw);
  const payoutPerHourUsd = input.payoutUsd / input.hoursEstimate;
  const expectedNetUsd = input.payoutUsd - input.cashCostUsd;

  const scores: Record<DimensionName, number> = {
    paymentCertainty: input.paymentCertainty,
    fit: input.fit,
    aiLeverage: input.aiLeverage,
    reuseValue: input.reuseValue,
    timeToCash: timeToCash(input.daysToPayout),
    payoutQuality: payoutQuality(payoutPerHourUsd),
    platformFriction: platformFriction(input),
    competition: competitionScore(input.existingSubmissions),
  };

  const breakdown = Object.fromEntries(
    (Object.keys(WEIGHTS) as DimensionName[]).map((name) => {
      const contribution = (scores[name] / 5) * WEIGHTS[name];
      return [
        name,
        {
          score: scores[name],
          weight: WEIGHTS[name],
          contribution: Math.round(contribution * 10) / 10,
        },
      ];
    }),
  ) as BountyAssessment["result"]["breakdown"];

  const penalties: Array<{ reason: string; points: number }> = [];
  if (input.payoutUsd > 0 && input.cashCostUsd / input.payoutUsd > 0.25) {
    penalties.push({ reason: "Cash cost exceeds 25% of headline payout.", points: 10 });
  } else if (input.payoutUsd > 0 && input.cashCostUsd / input.payoutUsd > 0.1) {
    penalties.push({ reason: "Cash cost exceeds 10% of headline payout.", points: 5 });
  }
  if (input.requiresPurchase) {
    penalties.push({ reason: "Opportunity requires buying before earning.", points: 10 });
  }
  if (!input.verifiableOutput) {
    penalties.push({ reason: "Deliverable cannot be independently verified.", points: 15 });
  }
  if (!input.agentAccessible && !input.humanSupportAvailable) {
    penalties.push({ reason: "Execution requires an unavailable human-only step.", points: 20 });
  }

  const hardStops: string[] = [];
  if (expectedNetUsd <= 0) hardStops.push("Expected net payout is zero or negative.");
  if (input.paymentCertainty <= 1) hardStops.push("Payment certainty is too low.");
  if (input.daysToDeadline <= 0) hardStops.push("Deadline has passed or is immediate.");
  if (input.hoursEstimate > Math.max(input.daysToDeadline, 0) * 8) {
    hardStops.push("Estimated work exceeds an eight-hour-per-day deadline capacity.");
  }
  if (!input.verifiableOutput) hardStops.push("No verifiable artifact can prove completion.");
  if (!input.agentAccessible && !input.humanSupportAvailable) {
    hardStops.push("Required human-only access is unavailable.");
  }

  const baseScore = (Object.keys(WEIGHTS) as DimensionName[]).reduce(
    (total, name) => total + (scores[name] / 5) * WEIGHTS[name],
    0,
  );
  const penaltyPoints = penalties.reduce((total, penalty) => total + penalty.points, 0);
  const score = hardStops.length ? 0 : Math.round(clamp(baseScore - penaltyPoints, 0, 100));

  let verdict: BountyAssessment["result"]["verdict"];
  if (hardStops.length || score < 50) verdict = "skip";
  else if (score >= 80) verdict = "pursue_now";
  else if (score >= 65) verdict = "pursue_if_capacity";
  else verdict = "watch_or_reframe";

  const certaintyProbability = [0, 0.15, 0.35, 0.55, 0.75, 0.9][
    Math.round(input.paymentCertainty)
  ];
  const competitionFactor = [0, 0.35, 0.5, 0.65, 0.82, 0.95][scores.competition];
  const fitFactor = 0.75 + scores.fit * 0.05;
  const estimatedSuccessProbability = hardStops.length
    ? 0
    : clamp(certaintyProbability * competitionFactor * fitFactor, 0.02, 0.95);

  const strengths: string[] = [];
  const risks: string[] = [];
  if (scores.paymentCertainty >= 4) strengths.push("Payment path appears credible.");
  if (scores.aiLeverage >= 4) strengths.push("AI can materially compress delivery time.");
  if (scores.reuseValue >= 4) strengths.push("Work can become a reusable asset or template.");
  if (scores.fit >= 4) strengths.push("Opportunity matches the operator's demonstrated strengths.");
  if (payoutPerHourUsd >= 35) strengths.push("Headline payout per estimated hour is attractive.");
  if (scores.competition <= 2) risks.push("Competition is already crowded.");
  if (scores.platformFriction <= 2) risks.push("Account, posting, purchase, or human-access friction is high.");
  if (input.daysToPayout > 30) risks.push("Time to cash is long.");
  if (input.cashCostUsd > 0) risks.push("Capital is at risk before payment.");
  if (!risks.length) risks.push("No major structural risk was declared; verify sponsor and rules manually.");

  const actionByVerdict: Record<BountyAssessment["result"]["verdict"], string> = {
    pursue_now:
      "Claim or apply now. Produce a verifiable artifact first, then polish the submission around the sponsor's rubric.",
    pursue_if_capacity:
      "Pursue only if it displaces a lower-scoring task. Reuse an existing template and cap delivery time.",
    watch_or_reframe:
      "Do not commit yet. Reduce scope, increase reuse, or improve payment certainty before proceeding.",
    skip: "Skip this version. Preserve capital and attention for a verifiable, lower-friction opportunity.",
  };

  return {
    version: "1.0.0",
    input,
    result: {
      score,
      verdict,
      payoutPerHourUsd: roundMoney(payoutPerHourUsd),
      expectedNetUsd: roundMoney(expectedNetUsd),
      estimatedSuccessProbability: Math.round(estimatedSuccessProbability * 1000) / 1000,
      expectedValueUsd: roundMoney(expectedNetUsd * estimatedSuccessProbability),
      breakdown,
      penalties,
      hardStops,
      strengths,
      risks,
      recommendedAction: actionByVerdict[verdict],
    },
    method: {
      principle:
        "Weight payment certainty and fit above headline payout; prefer short, verifiable, AI-leveraged work that compounds into reusable assets.",
      weights: WEIGHTS,
    },
  };
}
