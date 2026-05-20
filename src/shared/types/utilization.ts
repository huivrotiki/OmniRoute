export interface QuotaSnapshotRow {
  id: number;
  provider: string;
  connection_id: string;
  window_key: string;
  remaining_percentage: number | null;
  is_exhausted: number;
  next_reset_at: string | null;
  window_duration_ms: number | null;
  raw_data: string | null;
  created_at: string;
}

export interface ProviderUtilizationPoint {
  timestamp: string;
  provider: string;
  remainingPct: number;
  isExhausted: boolean;
  windowKey: string;
}

export interface ProviderUtilizationResponse {
  timeRange: "1h" | "24h" | "7d" | "30d";
  bucketSizeMinutes: number;
  providers: string[];
  data: ProviderUtilizationPoint[];
}

export interface ComboHealthMetrics {
  comboId: string;
  comboName: string;
  strategy: string;
  models: string[];
  targetHealth?: Array<{
    executionKey: string;
    stepId: string;
    model: string;
    provider: string;
    connectionId: string | null;
    label: string | null;
    requests: number;
    successRate: number;
    avgLatencyMs: number;
    lastStatus: "ok" | "error" | null;
    lastUsedAt: string | null;
    quotaRemainingPct: number | null;
    quotaIsExhausted: boolean | null;
    quotaTrend: "improving" | "stable" | "declining" | null;
    quotaScope: "connection" | "provider" | "none";
  }>;
  quotaHealth: {
    providers: Array<{
      provider: string;
      remainingPct: number;
      isExhausted: boolean;
      trend: "improving" | "stable" | "declining";
    }>;
    worstRemainingPct: number;
  };
  usageSkew: {
    modelDistribution: Array<{
      model: string;
      requestShare: number;
      tokenShare: number;
    }>;
    giniCoefficient: number;
  };
  performance: {
    avgLatencyMs: number;
    successRate: number;
    totalRequests: number;
  };
}

export interface ComboHealthResponse {
  timeRange: "1h" | "24h" | "7d" | "30d";
  combos: ComboHealthMetrics[];
}

export type UtilizationTimeRange = "1h" | "24h" | "7d" | "30d";

export type ComboForecastHorizon = "24h" | "7d" | "30d";
export type ComboForecastConfidence = "high" | "medium" | "low" | "no_data";
export type ComboForecastRiskLevel = "low" | "medium" | "high" | "critical" | "unknown";

export interface ComboForecastHistorySummary {
  requests: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  reasoningTokens: number;
  totalTokens: number;
  costUsd: number;
  avgDailyCostUsd: number;
}

export interface ComboForecastProjection {
  projectedRequests: number;
  projectedTokens: number;
  projectedCostUsd: number;
}

export interface ComboForecastQuotaRisk {
  level: ComboForecastRiskLevel;
  projectedWorstRemainingPct: number | null;
  timeToExhaustDays: number | null;
  worstTargetExecutionKey: string | null;
}

export interface ComboForecastTarget {
  executionKey: string;
  stepId: string | null;
  provider: string;
  model: string;
  connectionId: string | null;
  label: string | null;
  trafficShare: number;
  history: {
    requests: number;
    costUsd: number;
    totalTokens: number;
  };
  forecast: {
    projectedRequests: number;
    projectedCostUsd: number;
    projectedTokens: number;
  };
  quota: {
    scope: "connection" | "provider" | "none";
    remainingPct: number | null;
    depletionPctPerDay: number | null;
    projectedRemainingPct: number | null;
    timeToExhaustDays: number | null;
    risk: ComboForecastRiskLevel;
  };
}

export interface ComboForecastMetrics {
  comboId: string;
  comboName: string;
  strategy: string;
  confidence: ComboForecastConfidence;
  history: ComboForecastHistorySummary;
  forecast: ComboForecastProjection;
  quotaRisk: ComboForecastQuotaRisk;
  targets: ComboForecastTarget[];
  dataQuality: {
    pricingCoveragePct: number;
    quotaCoverage: "connection" | "provider" | "partial" | "none";
    notes: string[];
  };
}

export interface ComboForecastResponse {
  timeRange: UtilizationTimeRange;
  horizon: ComboForecastHorizon;
  asOf: string;
  method: "linear_history";
  combos: ComboForecastMetrics[];
}

export const BUCKET_SIZES: Record<UtilizationTimeRange, number> = {
  "1h": 1,
  "24h": 10,
  "7d": 60,
  "30d": 360,
};
