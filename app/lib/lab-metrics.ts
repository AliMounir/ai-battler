/**
 * Pure comparison math for the model lab.
 *
 * All nullable inputs are deliberate: an unknown value is never treated as zero.
 * Prices are expressed in cents per token, and durations are expressed in ms.
 */

export type RunOutcome = "succeeded" | "failed";
export type EvidenceStatus = "ok" | "insufficient_evidence";

export interface RunTimingInput {
  outcome: RunOutcome;
  startedAtMs: number | null;
  firstTokenAtMs: number | null;
  completedAtMs: number | null;
  outputTokens: number | null;
}

export type RunMetricIssue =
  | "failed_run"
  | "missing_started_at"
  | "invalid_started_at"
  | "missing_first_token_at"
  | "invalid_first_token_at"
  | "missing_completed_at"
  | "invalid_completed_at"
  | "missing_output_tokens"
  | "invalid_output_tokens"
  | "first_token_before_start"
  | "completion_before_start"
  | "completion_before_first_token"
  | "non_positive_generation_duration"
  | "invalid_timing_range"
  | "invalid_throughput";

export interface RunMetrics {
  state: "complete" | "partial" | "excluded";
  ttftMs: number | null;
  e2eMs: number | null;
  generationMs: number | null;
  throughputTokensPerSecond: number | null;
  issues: RunMetricIssue[];
}

export interface TokenUsage {
  inputTokens: number | null;
  outputTokens: number | null;
}

export interface CatalogTokenPrices {
  inputCentsPerToken: number | null;
  outputCentsPerToken: number | null;
}

export type CostIssue =
  | "missing_input_tokens"
  | "invalid_input_tokens"
  | "missing_output_tokens"
  | "invalid_output_tokens"
  | "missing_input_price"
  | "invalid_input_price"
  | "missing_output_price"
  | "invalid_output_price"
  | "input_cost_overflow"
  | "output_cost_overflow"
  | "total_cost_overflow";

export interface CatalogCost {
  status: "complete" | "insufficient_data" | "invalid_data";
  inputCostCents: number | null;
  outputCostCents: number | null;
  totalCostCents: number | null;
  issues: CostIssue[];
}

export type FitMetric = "quality" | "cost" | "ttft" | "throughput";
export type MetricDirection = "higher_is_better" | "lower_is_better";

export interface FitWeights {
  quality: number;
  cost: number;
  ttft: number;
  throughput: number;
}

/** Quality leads by default; the other 45% rewards deployability. */
export const DEFAULT_FIT_WEIGHTS: Readonly<FitWeights> = Object.freeze({
  quality: 0.55,
  cost: 0.2,
  ttft: 0.1,
  throughput: 0.15,
});

export interface ComparisonCandidate {
  id: string;
  outcome: RunOutcome;
  quality: number | null;
  costCents: number | null;
  ttftMs: number | null;
  throughputTokensPerSecond: number | null;
}

export type CandidateExclusionReason =
  | "failed_run"
  | "missing_quality"
  | "invalid_quality"
  | "missing_cost"
  | "invalid_cost"
  | "missing_ttft"
  | "invalid_ttft"
  | "missing_throughput"
  | "invalid_throughput";

export interface CandidateExclusion {
  candidateId: string;
  reasons: CandidateExclusionReason[];
}

export interface FitDimensionSummary {
  metric: FitMetric;
  direction: MetricDirection;
  availability: "active" | "zero_weight" | "missing_values";
  requestedWeight: number;
  effectiveWeight: number;
  minimum: number | null;
  maximum: number | null;
}

export interface FitContribution {
  metric: FitMetric;
  rawValue: number;
  desirability: number;
  effectiveWeight: number;
  contributionPoints: number;
}

export interface CandidateFitScore {
  candidateId: string;
  /** A normalized 0–100 score relative to this comparison cohort. */
  score: number;
  rank: number;
  isWinner: boolean;
  contributions: FitContribution[];
}

export interface FitScoreResult {
  status: EvidenceStatus;
  reason: string | null;
  scores: CandidateFitScore[];
  dimensions: FitDimensionSummary[];
  excluded: CandidateExclusion[];
}

export interface ParetoOptions {
  /** Relative tolerance from 0 to 1 used for floating-point comparisons. */
  relativeTolerance?: number;
}

export interface ParetoFrontierResult {
  status: EvidenceStatus;
  reason: string | null;
  frontierIds: string[];
  dominatedIds: string[];
  excluded: CandidateExclusion[];
}

export type WinnerLabelKind =
  | "quality_leader"
  | "cost_leader"
  | "ttft_leader"
  | "throughput_leader"
  | "best_fit"
  | "pareto_frontier";

export interface WinnerLabel {
  kind: WinnerLabelKind;
  label: string;
  value: number | null;
}

export interface CandidateWinnerLabels {
  candidateId: string;
  labels: WinnerLabel[];
}

export interface WinnerGroup {
  kind: WinnerLabelKind;
  status: EvidenceStatus;
  winnerIds: string[];
  value: number | null;
}

export interface WinnerLabelsResult {
  status: EvidenceStatus;
  reason: string | null;
  candidates: CandidateWinnerLabels[];
  groups: WinnerGroup[];
}

export interface WinnerOptions extends ParetoOptions {
  weights?: Partial<FitWeights>;
}

const FIT_METRICS: readonly FitMetric[] = [
  "quality",
  "cost",
  "ttft",
  "throughput",
];

const METRIC_DIRECTIONS: Readonly<Record<FitMetric, MetricDirection>> = {
  quality: "higher_is_better",
  cost: "lower_is_better",
  ttft: "lower_is_better",
  throughput: "higher_is_better",
};

const DEFAULT_RELATIVE_TOLERANCE = 1e-9;

function isFiniteNumber(value: number | null): value is number {
  return value !== null && Number.isFinite(value);
}

function isNonNegativeFinite(value: number | null): value is number {
  return isFiniteNumber(value) && value >= 0;
}

function isTokenCount(value: number | null): value is number {
  return isNonNegativeFinite(value) && Number.isSafeInteger(value);
}

function pushPresenceIssue<I extends string>(
  issues: I[],
  value: number | null,
  missingIssue: I,
  invalidIssue: I,
  validator: (candidate: number | null) => boolean,
): void {
  if (value === null) {
    issues.push(missingIssue);
  } else if (!validator(value)) {
    issues.push(invalidIssue);
  }
}

/**
 * Computes TTFT, end-to-end latency, and streamed generation throughput.
 * Throughput is output tokens divided by the time from first token to completion.
 */
export function computeRunMetrics(input: RunTimingInput): RunMetrics {
  if (input.outcome === "failed") {
    return {
      state: "excluded",
      ttftMs: null,
      e2eMs: null,
      generationMs: null,
      throughputTokensPerSecond: null,
      issues: ["failed_run"],
    };
  }

  const issues: RunMetricIssue[] = [];
  pushPresenceIssue(
    issues,
    input.startedAtMs,
    "missing_started_at",
    "invalid_started_at",
    isFiniteNumber,
  );
  pushPresenceIssue(
    issues,
    input.firstTokenAtMs,
    "missing_first_token_at",
    "invalid_first_token_at",
    isFiniteNumber,
  );
  pushPresenceIssue(
    issues,
    input.completedAtMs,
    "missing_completed_at",
    "invalid_completed_at",
    isFiniteNumber,
  );
  pushPresenceIssue(
    issues,
    input.outputTokens,
    "missing_output_tokens",
    "invalid_output_tokens",
    isTokenCount,
  );

  const startedAtMs = isFiniteNumber(input.startedAtMs)
    ? input.startedAtMs
    : null;
  const firstTokenAtMs = isFiniteNumber(input.firstTokenAtMs)
    ? input.firstTokenAtMs
    : null;
  const completedAtMs = isFiniteNumber(input.completedAtMs)
    ? input.completedAtMs
    : null;
  const outputTokens = isTokenCount(input.outputTokens)
    ? input.outputTokens
    : null;

  let ttftMs: number | null = null;
  if (startedAtMs !== null && firstTokenAtMs !== null) {
    const duration = firstTokenAtMs - startedAtMs;
    if (!Number.isFinite(duration)) {
      issues.push("invalid_timing_range");
    } else if (duration >= 0) {
      ttftMs = duration;
    } else {
      issues.push("first_token_before_start");
    }
  }

  let e2eMs: number | null = null;
  if (startedAtMs !== null && completedAtMs !== null) {
    const duration = completedAtMs - startedAtMs;
    if (!Number.isFinite(duration)) {
      issues.push("invalid_timing_range");
    } else if (duration >= 0) {
      e2eMs = duration;
    } else {
      issues.push("completion_before_start");
    }
  }

  let generationMs: number | null = null;
  if (firstTokenAtMs !== null && completedAtMs !== null) {
    const duration = completedAtMs - firstTokenAtMs;
    if (!Number.isFinite(duration)) {
      issues.push("invalid_timing_range");
    } else if (duration >= 0) {
      generationMs = duration;
    } else {
      issues.push("completion_before_first_token");
    }
  }

  // When all timestamps exist, an impossible chronology invalidates every
  // timing-derived value because it is not knowable which timestamp is wrong.
  const invalidGlobalChronology =
    startedAtMs !== null &&
    firstTokenAtMs !== null &&
    completedAtMs !== null &&
    (startedAtMs > firstTokenAtMs ||
      firstTokenAtMs > completedAtMs ||
      !Number.isFinite(completedAtMs - startedAtMs));
  if (invalidGlobalChronology) {
    ttftMs = null;
    e2eMs = null;
    generationMs = null;
  }

  let throughputTokensPerSecond: number | null = null;
  if (generationMs !== null && outputTokens !== null) {
    if (generationMs > 0) {
      const throughput = outputTokens / (generationMs / 1_000);
      if (Number.isFinite(throughput)) {
        throughputTokensPerSecond = throughput;
      } else {
        issues.push("invalid_throughput");
      }
    } else {
      issues.push("non_positive_generation_duration");
    }
  }

  const complete =
    ttftMs !== null &&
    e2eMs !== null &&
    throughputTokensPerSecond !== null;

  return {
    state: complete ? "complete" : "partial",
    ttftMs,
    e2eMs,
    generationMs,
    throughputTokensPerSecond,
    issues,
  };
}

/**
 * Calculates catalog-derived input, output, and total cost in cents.
 * A component stays null until both its token count and catalog price are known.
 */
export function calculateCatalogCost(
  usage: TokenUsage,
  prices: CatalogTokenPrices,
): CatalogCost {
  const issues: CostIssue[] = [];
  pushPresenceIssue(
    issues,
    usage.inputTokens,
    "missing_input_tokens",
    "invalid_input_tokens",
    isTokenCount,
  );
  pushPresenceIssue(
    issues,
    usage.outputTokens,
    "missing_output_tokens",
    "invalid_output_tokens",
    isTokenCount,
  );
  pushPresenceIssue(
    issues,
    prices.inputCentsPerToken,
    "missing_input_price",
    "invalid_input_price",
    isNonNegativeFinite,
  );
  pushPresenceIssue(
    issues,
    prices.outputCentsPerToken,
    "missing_output_price",
    "invalid_output_price",
    isNonNegativeFinite,
  );

  let inputCostCents: number | null = null;
  if (
    isTokenCount(usage.inputTokens) &&
    isNonNegativeFinite(prices.inputCentsPerToken)
  ) {
    const cost = usage.inputTokens * prices.inputCentsPerToken;
    if (Number.isFinite(cost)) {
      inputCostCents = cost;
    } else {
      issues.push("input_cost_overflow");
    }
  }

  let outputCostCents: number | null = null;
  if (
    isTokenCount(usage.outputTokens) &&
    isNonNegativeFinite(prices.outputCentsPerToken)
  ) {
    const cost = usage.outputTokens * prices.outputCentsPerToken;
    if (Number.isFinite(cost)) {
      outputCostCents = cost;
    } else {
      issues.push("output_cost_overflow");
    }
  }

  let totalCostCents: number | null = null;
  if (inputCostCents !== null && outputCostCents !== null) {
    const total = inputCostCents + outputCostCents;
    if (Number.isFinite(total)) {
      totalCostCents = total;
    } else {
      issues.push("total_cost_overflow");
    }
  }

  const hasInvalidData = issues.some(
    (issue) => issue.startsWith("invalid_") || issue.endsWith("_overflow"),
  );
  return {
    status:
      totalCostCents !== null
        ? "complete"
        : hasInvalidData
          ? "invalid_data"
          : "insufficient_data",
    inputCostCents,
    outputCostCents,
    totalCostCents,
    issues,
  };
}

function metricValue(
  candidate: ComparisonCandidate,
  metric: FitMetric,
): number | null {
  switch (metric) {
    case "quality":
      return candidate.quality;
    case "cost":
      return candidate.costCents;
    case "ttft":
      return candidate.ttftMs;
    case "throughput":
      return candidate.throughputTokensPerSecond;
  }
}

function isValidMetricValue(metric: FitMetric, value: number | null): boolean {
  return metric === "quality"
    ? isFiniteNumber(value)
    : isNonNegativeFinite(value);
}

function exclusionReason(
  metric: FitMetric,
  value: number | null,
): CandidateExclusionReason {
  if (value === null) {
    switch (metric) {
      case "quality":
        return "missing_quality";
      case "cost":
        return "missing_cost";
      case "ttft":
        return "missing_ttft";
      case "throughput":
        return "missing_throughput";
    }
  }

  switch (metric) {
    case "quality":
      return "invalid_quality";
    case "cost":
      return "invalid_cost";
    case "ttft":
      return "invalid_ttft";
    case "throughput":
      return "invalid_throughput";
  }
}

function resolveWeights(overrides: Partial<FitWeights>): FitWeights {
  const weights: FitWeights = {
    quality: overrides.quality ?? DEFAULT_FIT_WEIGHTS.quality,
    cost: overrides.cost ?? DEFAULT_FIT_WEIGHTS.cost,
    ttft: overrides.ttft ?? DEFAULT_FIT_WEIGHTS.ttft,
    throughput: overrides.throughput ?? DEFAULT_FIT_WEIGHTS.throughput,
  };

  for (const metric of FIT_METRICS) {
    const weight = weights[metric];
    if (!Number.isFinite(weight) || weight < 0) {
      throw new RangeError(`Weight "${metric}" must be finite and non-negative.`);
    }
  }

  if (FIT_METRICS.every((metric) => weights[metric] === 0)) {
    throw new RangeError("At least one fit weight must be greater than zero.");
  }

  return weights;
}

function normalizeDesirability(
  value: number,
  minimum: number,
  maximum: number,
  direction: MetricDirection,
): number {
  if (minimum === maximum) {
    // A non-discriminating dimension is neutral: it changes no candidate's rank.
    return 0.5;
  }

  const range = maximum - minimum;
  const increasing = Number.isFinite(range)
    ? (value - minimum) / range
    : (value / Math.max(Math.abs(minimum), Math.abs(maximum)) -
        minimum / Math.max(Math.abs(minimum), Math.abs(maximum))) /
      (maximum / Math.max(Math.abs(minimum), Math.abs(maximum)) -
        minimum / Math.max(Math.abs(minimum), Math.abs(maximum)));
  const bounded = Math.min(1, Math.max(0, increasing));
  return direction === "higher_is_better" ? bounded : 1 - bounded;
}

function compareWithTolerance(
  valueA: number,
  valueB: number,
  factor: number,
): -1 | 0 | 1 {
  if (valueA === valueB) {
    return 0;
  }

  const scale = Math.max(1, Math.abs(valueA), Math.abs(valueB));
  const scaledDifference = valueA / scale - valueB / scale;
  if (Math.abs(scaledDifference) <= factor) {
    return 0;
  }
  return scaledDifference < 0 ? -1 : 1;
}

function nearlyEqual(valueA: number, valueB: number, factor: number): boolean {
  return compareWithTolerance(valueA, valueB, factor) === 0;
}

function validatedTolerance(value: number | undefined): number {
  const tolerance = value ?? DEFAULT_RELATIVE_TOLERANCE;
  if (!Number.isFinite(tolerance) || tolerance < 0 || tolerance > 1) {
    throw new RangeError("Relative tolerance must be between zero and one.");
  }
  return tolerance;
}

function assertUniqueCandidateIds(
  candidates: readonly ComparisonCandidate[],
): void {
  const seen = new Set<string>();
  for (const candidate of candidates) {
    if (seen.has(candidate.id)) {
      throw new RangeError(`Duplicate comparison candidate id: "${candidate.id}".`);
    }
    seen.add(candidate.id);
  }
}

/**
 * Scores successful candidates on a cohort-relative 0–100 scale.
 *
 * Quality is mandatory. Optional dimensions with missing values are dropped for
 * the whole cohort, then their remaining requested weights are re-normalized.
 */
export function scoreModelFit(
  candidates: readonly ComparisonCandidate[],
  weightOverrides: Partial<FitWeights> = {},
  options: ParetoOptions = {},
): FitScoreResult {
  assertUniqueCandidateIds(candidates);
  const tolerance = validatedTolerance(options.relativeTolerance);
  const weights = resolveWeights(weightOverrides);
  const excluded: CandidateExclusion[] = [];
  const eligible: ComparisonCandidate[] = [];

  for (const candidate of candidates) {
    if (candidate.outcome === "failed") {
      excluded.push({
        candidateId: candidate.id,
        reasons: ["failed_run"],
      });
      continue;
    }

    if (!isValidMetricValue("quality", candidate.quality)) {
      excluded.push({
        candidateId: candidate.id,
        reasons: [exclusionReason("quality", candidate.quality)],
      });
      continue;
    }

    eligible.push(candidate);
  }

  if (eligible.length < 2) {
    const successfulCount = candidates.filter(
      (candidate) => candidate.outcome === "succeeded",
    ).length;
    const reason =
      successfulCount === 0
        ? "No successful runs are available."
        : eligible.length === 0
          ? "Quality evidence is required before model fit can be scored."
          : "At least two successful runs with quality evidence are required.";

    return {
      status: "insufficient_evidence",
      reason,
      scores: [],
      dimensions: [],
      excluded,
    };
  }

  const dimensions: FitDimensionSummary[] = FIT_METRICS.map((metric) => {
    const values = eligible.map((candidate) => metricValue(candidate, metric));
    const allAvailable = values.every((value) =>
      isValidMetricValue(metric, value),
    );
    const availability: FitDimensionSummary["availability"] =
      weights[metric] === 0
        ? "zero_weight"
        : allAvailable
          ? "active"
          : "missing_values";
    const numericValues = allAvailable ? (values as number[]) : [];

    return {
      metric,
      direction: METRIC_DIRECTIONS[metric],
      availability,
      requestedWeight: weights[metric],
      effectiveWeight: 0,
      minimum: allAvailable ? Math.min(...numericValues) : null,
      maximum: allAvailable ? Math.max(...numericValues) : null,
    };
  });

  const activeDimensions = dimensions.filter(
    (dimension) => dimension.availability === "active",
  );
  const largestActiveWeight = Math.max(
    ...activeDimensions.map((dimension) => dimension.requestedWeight),
    0,
  );
  const scaledActiveWeight =
    largestActiveWeight === 0
      ? 0
      : activeDimensions.reduce(
          (sum, dimension) =>
            sum + dimension.requestedWeight / largestActiveWeight,
          0,
        );

  if (scaledActiveWeight === 0) {
    return {
      status: "insufficient_evidence",
      reason: "No positively weighted metric has complete evidence.",
      scores: [],
      dimensions,
      excluded,
    };
  }

  for (const dimension of dimensions) {
    if (dimension.availability === "active") {
      dimension.effectiveWeight =
        dimension.requestedWeight /
        largestActiveWeight /
        scaledActiveWeight;
    }
  }

  const scores = eligible.map<CandidateFitScore>((candidate) => {
    const contributions: FitContribution[] = [];
    let score = 0;

    for (const dimension of dimensions) {
      if (
        dimension.availability !== "active" ||
        dimension.minimum === null ||
        dimension.maximum === null
      ) {
        continue;
      }

      const rawValue = metricValue(candidate, dimension.metric);
      if (rawValue === null) {
        continue;
      }

      const desirability = normalizeDesirability(
        rawValue,
        dimension.minimum,
        dimension.maximum,
        dimension.direction,
      );
      const contributionPoints =
        desirability * dimension.effectiveWeight * 100;
      score += contributionPoints;
      contributions.push({
        metric: dimension.metric,
        rawValue,
        desirability,
        effectiveWeight: dimension.effectiveWeight,
        contributionPoints,
      });
    }

    return {
      candidateId: candidate.id,
      score,
      rank: 0,
      isWinner: false,
      contributions,
    };
  });

  scores.sort(
    (scoreA, scoreB) =>
      scoreB.score - scoreA.score ||
      scoreA.candidateId.localeCompare(scoreB.candidateId),
  );

  let previousScore: number | null = null;
  let previousRank = 0;
  scores.forEach((candidateScore, index) => {
    if (
      previousScore !== null &&
      nearlyEqual(candidateScore.score, previousScore, tolerance)
    ) {
      candidateScore.rank = previousRank;
    } else {
      candidateScore.rank = index + 1;
      previousRank = candidateScore.rank;
      previousScore = candidateScore.score;
    }
    candidateScore.isWinner = candidateScore.rank === 1;
  });

  return {
    status: "ok",
    reason: null,
    scores,
    dimensions,
    excluded,
  };
}

function completeParetoEvidence(
  candidate: ComparisonCandidate,
): CandidateExclusionReason[] {
  const reasons: CandidateExclusionReason[] = [];
  if (candidate.outcome === "failed") {
    return ["failed_run"];
  }

  for (const metric of FIT_METRICS) {
    const value = metricValue(candidate, metric);
    if (!isValidMetricValue(metric, value)) {
      reasons.push(exclusionReason(metric, value));
    }
  }
  return reasons;
}

function dominates(
  candidateA: ComparisonCandidate,
  candidateB: ComparisonCandidate,
  toleranceFactor: number,
): boolean {
  let strictlyBetter = false;

  for (const metric of FIT_METRICS) {
    const valueA = metricValue(candidateA, metric);
    const valueB = metricValue(candidateB, metric);
    if (valueA === null || valueB === null) {
      return false;
    }

    const comparison = compareWithTolerance(
      valueA,
      valueB,
      toleranceFactor,
    );
    const higherIsBetter =
      METRIC_DIRECTIONS[metric] === "higher_is_better";
    const noWorse = higherIsBetter ? comparison >= 0 : comparison <= 0;
    if (!noWorse) {
      return false;
    }

    const better = higherIsBetter ? comparison > 0 : comparison < 0;
    strictlyBetter ||= better;
  }

  return strictlyBetter;
}

/**
 * Returns the non-dominated set for quality↑, cost↓, TTFT↓, throughput↑.
 * Runs missing any axis are reported as excluded because dominance is unknown.
 */
export function paretoFrontier(
  candidates: readonly ComparisonCandidate[],
  options: ParetoOptions = {},
): ParetoFrontierResult {
  assertUniqueCandidateIds(candidates);
  const tolerance = validatedTolerance(options.relativeTolerance);
  const complete: ComparisonCandidate[] = [];
  const excluded: CandidateExclusion[] = [];

  for (const candidate of candidates) {
    const reasons = completeParetoEvidence(candidate);
    if (reasons.length > 0) {
      excluded.push({ candidateId: candidate.id, reasons });
    } else {
      complete.push(candidate);
    }
  }

  if (complete.length === 0) {
    const successful = candidates.filter(
      (candidate) => candidate.outcome === "succeeded",
    );
    const hasQuality = successful.some((candidate) =>
      isValidMetricValue("quality", candidate.quality),
    );

    return {
      status: "insufficient_evidence",
      reason:
        successful.length === 0
          ? "No successful runs are available."
          : !hasQuality
            ? "Quality evidence is required to compute a Pareto frontier."
            : "Complete quality, cost, TTFT, and throughput evidence is required.",
      frontierIds: [],
      dominatedIds: [],
      excluded,
    };
  }

  const frontierIds: string[] = [];
  const dominatedIds: string[] = [];
  for (const candidate of complete) {
    const isDominated = complete.some(
      (other) =>
        other !== candidate && dominates(other, candidate, tolerance),
    );
    (isDominated ? dominatedIds : frontierIds).push(candidate.id);
  }

  return {
    status: "ok",
    reason: null,
    frontierIds,
    dominatedIds,
    excluded,
  };
}

interface MetricWinnerDefinition {
  metric: FitMetric;
  kind: WinnerLabelKind;
}

const METRIC_WINNERS: readonly MetricWinnerDefinition[] = [
  {
    metric: "quality",
    kind: "quality_leader",
  },
  { metric: "cost", kind: "cost_leader" },
  { metric: "ttft", kind: "ttft_leader" },
  {
    metric: "throughput",
    kind: "throughput_leader",
  },
];

function metricWinnerGroup(
  candidates: readonly ComparisonCandidate[],
  definition: MetricWinnerDefinition,
  tolerance: number,
): WinnerGroup {
  const measured = candidates
    .map((candidate) => ({
      id: candidate.id,
      value: metricValue(candidate, definition.metric),
    }))
    .filter(
      (entry): entry is { id: string; value: number } =>
        isValidMetricValue(definition.metric, entry.value),
    );

  if (measured.length < 2) {
    return {
      kind: definition.kind,
      status: "insufficient_evidence",
      winnerIds: [],
      value: null,
    };
  }

  const winnerValue =
    METRIC_DIRECTIONS[definition.metric] === "higher_is_better"
      ? Math.max(...measured.map((entry) => entry.value))
      : Math.min(...measured.map((entry) => entry.value));

  return {
    kind: definition.kind,
    status: "ok",
    winnerIds: measured
      .filter((entry) => nearlyEqual(entry.value, winnerValue, tolerance))
      .map((entry) => entry.id),
    value: winnerValue,
  };
}

/**
 * Labels metric leaders, best normalized fit, and Pareto-efficient candidates.
 * Ties receive the same label; failed runs never appear in the result.
 */
export function labelWinners(
  candidates: readonly ComparisonCandidate[],
  options: WinnerOptions = {},
): WinnerLabelsResult {
  assertUniqueCandidateIds(candidates);
  const tolerance = validatedTolerance(options.relativeTolerance);
  const successful = candidates.filter(
    (candidate) => candidate.outcome === "succeeded",
  );
  const groups = METRIC_WINNERS.map((definition) =>
    metricWinnerGroup(successful, definition, tolerance),
  );

  const fit = scoreModelFit(candidates, options.weights, {
    relativeTolerance: tolerance,
  });
  groups.push({
    kind: "best_fit",
    status: fit.status,
    winnerIds:
      fit.status === "ok"
        ? fit.scores
            .filter((score) => score.isWinner)
            .map((score) => score.candidateId)
        : [],
    value:
      fit.status === "ok"
        ? (fit.scores.find((score) => score.isWinner)?.score ?? null)
        : null,
  });

  const pareto = paretoFrontier(candidates, {
    relativeTolerance: tolerance,
  });
  groups.push({
    kind: "pareto_frontier",
    status: pareto.status,
    winnerIds: pareto.frontierIds,
    value: null,
  });

  const labelsByKind: Readonly<Record<WinnerLabelKind, string>> = {
    quality_leader: "Quality leader",
    cost_leader: "Lowest cost",
    ttft_leader: "Fastest first token",
    throughput_leader: "Highest throughput",
    best_fit: "Best overall fit",
    pareto_frontier: "Pareto efficient",
  };

  const candidateLabels = successful.map<CandidateWinnerLabels>((candidate) => {
    const labels = groups
      .filter((group) => group.winnerIds.includes(candidate.id))
      .map<WinnerLabel>((group) => ({
        kind: group.kind,
        label: labelsByKind[group.kind],
        value: group.value,
      }));
    return { candidateId: candidate.id, labels };
  });

  const incompleteGroups = groups.filter(
    (group) => group.status === "insufficient_evidence",
  );
  const status: EvidenceStatus =
    incompleteGroups.length === 0 ? "ok" : "insufficient_evidence";

  return {
    status,
    reason:
      status === "ok"
        ? null
        : (fit.reason ??
          "One or more winner labels lack sufficient comparable evidence."),
    candidates: candidateLabels,
    groups,
  };
}
