"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  fetchModelCatalog,
  streamChatCompletion,
} from "./lib/deepinfra";
import { scoreModelFit } from "./lib/lab-metrics";

type View = "compare" | "catalog" | "runs";
type CatalogView = "table" | "map";
type RunStatus = "idle" | "queued" | "streaming" | "complete" | "error" | "aborted";

type LabModel = {
  id: string;
  name: string;
  provider: string;
  type: string;
  reportedType: string;
  description: string;
  tags: string[];
  contextTokens: number | null;
  deprecatedAt: number | null;
  replacedBy: string | null;
  quantization: string | null;
  partner: boolean;
  pricing: unknown;
  raw?: unknown;
};

type Usage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  estimated_cost?: number;
  prompt_tokens_details?: { cached_tokens?: number };
};

type LaneResult = {
  modelId: string;
  status: RunStatus;
  content: string;
  reasoning: string;
  startedAt?: number;
  firstTokenAt?: number;
  endedAt?: number;
  ttftMs: number | null;
  totalMs: number | null;
  tokensPerSecond: number | null;
  usage: Usage | null;
  cost: number | null;
  costSource: "reported" | "catalog" | "unknown";
  finishReason: string | null;
  error: string | null;
  rating: number | null;
  isExample?: boolean;
};

type SavedRun = {
  id: string;
  createdAt: string;
  title: string;
  prompt: string;
  systemPrompt: string;
  settings: { temperature: number; maxTokens: number };
  modelIds: string[];
  results: LaneResult[];
};

type SortKey =
  | "model"
  | "provider"
  | "context"
  | "input"
  | "output"
  | "type";

const MODEL_COLORS = ["#6E8BFF", "#FF795F", "#42C7B5", "#A98AFF", "#E9B949"];
const DEFAULT_PROMPT =
  "Design a PostgreSQL schema and zero-downtime migration strategy for a multi-tenant analytics product. Include SQL, state assumptions, and explain the trade-offs.";
const STORAGE_KEY = "arena-saved-runs-v1";

const DEMO_MODELS: LabModel[] = [
  {
    id: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
    name: "Llama 3.3 70B",
    provider: "meta-llama",
    type: "text-generation",
    reportedType: "text-generation",
    description:
      "A high-capacity general-purpose instruction model with tool use and structured output support.",
    tags: ["openai", "json", "tools", "structured-output", "flex"],
    contextTokens: 131072,
    deprecatedAt: null,
    replacedBy: null,
    quantization: "fp8",
    partner: false,
    pricing: {
      type: "tokens",
      cents_per_input_token: 0.000059,
      cents_per_output_token: 0.000079,
      short: "$0.59 / $0.79 per 1M tokens",
    },
  },
  {
    id: "Qwen/Qwen3-235B-A22B",
    name: "Qwen3 235B A22B",
    provider: "Qwen",
    type: "text-generation",
    reportedType: "text-generation",
    description:
      "A large mixture-of-experts reasoning model suited to coding, analysis, and multilingual work.",
    tags: ["openai", "json", "tools", "reasoning", "structured-output"],
    contextTokens: 131072,
    deprecatedAt: null,
    replacedBy: null,
    quantization: "fp8",
    partner: false,
    pricing: {
      type: "tokens",
      cents_per_input_token: 0.00013,
      cents_per_output_token: 0.0006,
      short: "$1.30 / $6.00 per 1M tokens",
    },
  },
  {
    id: "mistralai/Mistral-Small-3.1-24B-Instruct-2503",
    name: "Mistral Small 3.1",
    provider: "mistralai",
    type: "text-generation",
    reportedType: "text-generation",
    description:
      "A compact multimodal instruction model optimized for fast, economical production workloads.",
    tags: ["openai", "json", "tools", "multimodal", "structured-output"],
    contextTokens: 128000,
    deprecatedAt: null,
    replacedBy: null,
    quantization: "fp8",
    partner: false,
    pricing: {
      type: "tokens",
      cents_per_input_token: 0.00005,
      cents_per_output_token: 0.00015,
      short: "$0.50 / $1.50 per 1M tokens",
    },
  },
  {
    id: "google/gemma-3-27b-it",
    name: "Gemma 3 27B",
    provider: "google",
    type: "text-generation",
    reportedType: "text-generation",
    description:
      "A capable open instruction model for compact deployments, multimodal prompts, and general chat.",
    tags: ["openai", "json", "multimodal"],
    contextTokens: 131072,
    deprecatedAt: null,
    replacedBy: null,
    quantization: "bf16",
    partner: false,
    pricing: {
      type: "tokens",
      cents_per_input_token: 0.00004,
      cents_per_output_token: 0.00008,
      short: "$0.40 / $0.80 per 1M tokens",
    },
  },
  {
    id: "openai/gpt-oss-120b",
    name: "GPT OSS 120B",
    provider: "openai",
    type: "text-generation",
    reportedType: "text-generation",
    description:
      "An open-weight reasoning model with strong instruction following and tool calling.",
    tags: ["openai", "json", "tools", "reasoning", "structured-output"],
    contextTokens: 131072,
    deprecatedAt: null,
    replacedBy: null,
    quantization: "fp8",
    partner: false,
    pricing: {
      type: "tokens",
      cents_per_input_token: 0.00005,
      cents_per_output_token: 0.0002,
      short: "$0.50 / $2.00 per 1M tokens",
    },
  },
];

const DEMO_RESULTS: LaneResult[] = [
  {
    modelId: DEMO_MODELS[0].id,
    status: "complete",
    content:
      "I’d separate tenancy, immutable events, and derived aggregates so every migration has a reversible boundary.\n\n1. Put `tenant_id` first in every primary and foreign key. Enforce it in the database—not only in application code.\n2. Introduce new columns as nullable, dual-write behind a feature flag, backfill in bounded keyset batches, then validate asynchronously.\n3. Add constraints with `NOT VALID`, verify them, and only then switch reads.\n\n```sql\nCREATE TABLE analytics_event (\n  tenant_id uuid NOT NULL,\n  event_id uuid NOT NULL,\n  occurred_at timestamptz NOT NULL,\n  kind text NOT NULL,\n  payload jsonb NOT NULL,\n  PRIMARY KEY (tenant_id, event_id)\n) PARTITION BY RANGE (occurred_at);\n```\n\nThis keeps the write path stable while new readers catch up. The main trade-off is temporary storage and operational complexity from dual writes.",
    reasoning: "",
    ttftMs: 412,
    totalMs: 8420,
    tokensPerSecond: 74.8,
    usage: { prompt_tokens: 42, completion_tokens: 598, total_tokens: 640 },
    cost: 0.000497,
    costSource: "catalog",
    finishReason: "stop",
    error: null,
    rating: 4,
    isExample: true,
  },
  {
    modelId: DEMO_MODELS[1].id,
    status: "complete",
    content:
      "Use a shared-schema, row-level tenancy model unless compliance requires physical isolation. The migration protocol is more important than the initial DDL.\n\n**Schema invariants**\n- Every unique index starts with `tenant_id`.\n- Foreign keys include `tenant_id`, preventing cross-tenant references.\n- RLS is defense in depth; the application still binds tenant context explicitly.\n\n**Expand → migrate → contract**\n1. Expand with additive DDL and concurrent indexes.\n2. Deploy dual-read/dual-write code with telemetry.\n3. Backfill using resumable jobs and `FOR UPDATE SKIP LOCKED`.\n4. Compare old/new read paths on sampled traffic.\n5. Flip reads, stop old writes, validate constraints, then contract.\n\n```sql\nALTER TABLE account ADD COLUMN external_key text;\nCREATE UNIQUE INDEX CONCURRENTLY account_tenant_external_key_uq\n  ON account (tenant_id, external_key)\n  WHERE external_key IS NOT NULL;\n```\n\nFor very large tables, avoid rewrite-heavy defaults and long transactions. Record a migration watermark per tenant so retries are idempotent.",
    reasoning: "",
    ttftMs: 688,
    totalMs: 11320,
    tokensPerSecond: 62.1,
    usage: { prompt_tokens: 42, completion_tokens: 661, total_tokens: 703 },
    cost: 0.004021,
    costSource: "catalog",
    finishReason: "stop",
    error: null,
    rating: 5,
    isExample: true,
  },
  {
    modelId: DEMO_MODELS[2].id,
    status: "complete",
    content:
      "A pragmatic default is one logical schema with composite tenant keys, time-partitioned facts, and separately deployable aggregates.\n\n```sql\nCREATE TABLE tenant (\n  id uuid PRIMARY KEY,\n  slug text NOT NULL UNIQUE,\n  created_at timestamptz NOT NULL DEFAULT now()\n);\n\nCREATE TABLE metric_sample (\n  tenant_id uuid NOT NULL REFERENCES tenant(id),\n  series_id uuid NOT NULL,\n  ts timestamptz NOT NULL,\n  value double precision NOT NULL,\n  PRIMARY KEY (tenant_id, series_id, ts)\n) PARTITION BY RANGE (ts);\n```\n\nFor zero downtime: make only additive changes first; create indexes concurrently; backfill in throttled batches; dual-write; verify row counts and checksums; switch reads through a flag; then remove the old path in a later release.\n\nThis is cheaper to operate than schema-per-tenant, but noisy-neighbor controls and per-tenant restore are harder.",
    reasoning: "",
    ttftMs: 238,
    totalMs: 5980,
    tokensPerSecond: 92.6,
    usage: { prompt_tokens: 42, completion_tokens: 521, total_tokens: 563 },
    cost: 0.000803,
    costSource: "catalog",
    finishReason: "stop",
    error: null,
    rating: 4,
    isExample: true,
  },
];

function shortName(id: string) {
  const raw = id.split("/").at(-1) ?? id;
  return raw
    .replace(/-Instruct|-Turbo|-Chat|-it$/gi, "")
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function providerName(value: string) {
  return value
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatContext(value: number | null) {
  if (!value) return "Unknown";
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value % 1_000_000 ? 1 : 0)}M`;
  return `${Math.round(value / 1000)}K`;
}

function formatMoney(value: number | null, digits = 4) {
  if (value == null || !Number.isFinite(value)) return "—";
  if (value === 0) return "$0";
  if (value < 0.0001) return `$${value.toExponential(2)}`;
  return `$${value.toFixed(digits)}`;
}

function pricingRecord(model: LabModel) {
  const pricing = (model.pricing ?? {}) as Record<string, unknown>;
  return pricing.raw && typeof pricing.raw === "object"
    ? (pricing.raw as Record<string, unknown>)
    : pricing;
}

function tokenPrice(model: LabModel, side: "input" | "output") {
  const pricing = pricingRecord(model);
  if (pricing.type !== "tokens") return null;
  const value = Number(pricing[`cents_per_${side}_token`]);
  return Number.isFinite(value) ? value * 10_000 : null;
}

function pricingText(model: LabModel) {
  const normalized = (model.pricing ?? {}) as Record<string, unknown>;
  if (typeof normalized.label === "string" && normalized.label) {
    return normalized.label;
  }
  const pricing = pricingRecord(model);
  const input = tokenPrice(model, "input");
  const output = tokenPrice(model, "output");
  if (input != null || output != null) {
    return `${input == null ? "—" : `$${input.toFixed(2)}`} in · ${
      output == null ? "—" : `$${output.toFixed(2)}`
    } out / 1M`;
  }
  return typeof pricing.short === "string"
    ? pricing.short
    : typeof pricing.type === "string"
      ? pricing.type.replace(/_/g, " ")
      : "Pricing unavailable";
}

function estimateCatalogCost(model: LabModel, usage: Usage | null) {
  if (!usage) return null;
  const pricing = pricingRecord(model);
  if (pricing.type !== "tokens") return null;
  const input = Number(pricing.cents_per_input_token);
  const output = Number(pricing.cents_per_output_token);
  if (!Number.isFinite(input) || !Number.isFinite(output)) return null;
  return (
    ((usage.prompt_tokens ?? 0) * input +
      (usage.completion_tokens ?? 0) * output) /
    100
  );
}

function capabilityLabel(tag: string) {
  const labels: Record<string, string> = {
    json: "JSON",
    tools: "TOOLS",
    "structured-output": "STRUCTURED",
    structured_output: "STRUCTURED",
    reasoning: "REASONING",
    multimodal: "VISION",
    "input-audio": "AUDIO",
    "input-video": "VIDEO",
    flex: "FLEX",
    priority: "PRIORITY",
  };
  return labels[tag] ?? tag.replace(/-/g, " ").toUpperCase();
}

function statusLabel(status: RunStatus) {
  const labels: Record<RunStatus, string> = {
    idle: "READY",
    queued: "QUEUED",
    streaming: "STREAMING",
    complete: "COMPLETE",
    error: "FAILED",
    aborted: "STOPPED",
  };
  return labels[status];
}

function safeErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message.replace(/Bearer\s+\S+/gi, "Bearer ••••");
  return "The request could not be completed.";
}

function rankResults(results: LaneResult[]) {
  const complete = results.filter((result) => result.status === "complete");
  const minBy = (key: "ttftMs" | "cost") =>
    complete
      .filter((result) => result[key] != null)
      .sort((a, b) => (a[key] ?? Infinity) - (b[key] ?? Infinity))[0]?.modelId;
  const maxBy = (key: "tokensPerSecond" | "rating") =>
    complete
      .filter((result) => result[key] != null)
      .sort((a, b) => (b[key] ?? -Infinity) - (a[key] ?? -Infinity))[0]?.modelId;
  return {
    fastest: minBy("ttftMs"),
    cheapest: minBy("cost"),
    throughput: maxBy("tokensPerSecond"),
    quality: maxBy("rating"),
  };
}

function Metric({
  label,
  value,
  winner,
  title,
}: {
  label: string;
  value: string;
  winner?: string;
  title?: string;
}) {
  return (
    <div className={`metric ${winner ? "metric-winner" : ""}`} title={title}>
      <span className="metric-label">{label}</span>
      <strong>{value}</strong>
      {winner ? <small>{winner}</small> : null}
    </div>
  );
}

function Rating({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (value: number) => void;
}) {
  return (
    <div className="rating" aria-label="Manual quality rating">
      <span>QUALITY</span>
      <div>
        {[1, 2, 3, 4, 5].map((score) => (
          <button
            type="button"
            key={score}
            className={value && score <= value ? "rated" : ""}
            onClick={() => onChange(score)}
            aria-label={`Rate ${score} out of 5`}
          >
            {score <= (value ?? 0) ? "●" : "○"}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function Home() {
  const [view, setView] = useState<View>("compare");
  const [catalogView, setCatalogView] = useState<CatalogView>("table");
  const [models, setModels] = useState<LabModel[]>(DEMO_MODELS);
  const [catalogSource, setCatalogSource] = useState<"loading" | "live" | "snapshot" | "error">(
    "loading",
  );
  const [catalogUpdatedAt, setCatalogUpdatedAt] = useState<Date | null>(null);
  const [selectedModelIds, setSelectedModelIds] = useState<string[]>(
    DEMO_MODELS.slice(0, 3).map((model) => model.id),
  );
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [activePrompt, setActivePrompt] = useState(DEFAULT_PROMPT);
  const [systemPrompt, setSystemPrompt] = useState(
    "You are a senior software architect. Be concrete, concise, and explicit about trade-offs.",
  );
  const [temperature, setTemperature] = useState(0.2);
  const [maxTokens, setMaxTokens] = useState(1200);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [blindReview, setBlindReview] = useState(false);
  const [results, setResults] = useState<LaneResult[]>(DEMO_RESULTS);
  const [apiKey, setApiKey] = useState("");
  const [keyDraft, setKeyDraft] = useState("");
  const [connectionState, setConnectionState] = useState<
    "idle" | "testing" | "connected" | "error"
  >("idle");
  const [connectionMessage, setConnectionMessage] = useState("");
  const [showConnection, setShowConnection] = useState(false);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");
  const [catalogSearch, setCatalogSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [activeOnly, setActiveOnly] = useState(true);
  const [capability, setCapability] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("model");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [detailModelId, setDetailModelId] = useState<string | null>(null);
  const [savedRuns, setSavedRuns] = useState<SavedRun[]>([]);
  const [runMessage, setRunMessage] = useState("");
  const [monthlyInput, setMonthlyInput] = useState(10);
  const [monthlyOutput, setMonthlyOutput] = useState(2);
  const controllersRef = useRef<Map<string, AbortController>>(new Map());
  const promptRef = useRef<HTMLTextAreaElement | null>(null);
  const catalogSearchRef = useRef<HTMLInputElement | null>(null);

  const loadCatalog = useCallback(async () => {
    setCatalogSource("loading");
    try {
      const liveModels = (await fetchModelCatalog()) as unknown as LabModel[];
      if (!Array.isArray(liveModels) || liveModels.length === 0) {
        throw new Error("The catalog returned no models.");
      }
      setModels(liveModels);
      setCatalogUpdatedAt(new Date());
      setCatalogSource("live");
      setSelectedModelIds((current) => {
        const chatModels = liveModels.filter(
          (model) =>
            model.reportedType === "text-generation" &&
            model.deprecatedAt == null &&
            model.tags.includes("openai"),
        );
        const stillAvailable = current.filter((id) => liveModels.some((model) => model.id === id));
        if (stillAvailable.length >= 2) return stillAvailable.slice(0, 5);
        const preferred = DEMO_MODELS.map((model) =>
          chatModels.find((candidate) => candidate.id === model.id),
        ).filter(Boolean) as LabModel[];
        return (preferred.length >= 2 ? preferred : chatModels.slice(0, 3)).map(
          (model) => model.id,
        );
      });
    } catch {
      setModels(DEMO_MODELS);
      setCatalogUpdatedAt(null);
      setCatalogSource("snapshot");
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadCatalog();
      try {
        const stored = window.localStorage.getItem(STORAGE_KEY);
        if (stored) setSavedRuns(JSON.parse(stored) as SavedRun[]);
      } catch {
        // A blocked storage surface should not make the lab unusable.
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadCatalog]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setShowModelPicker(true);
      }
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter" && view === "compare") {
        event.preventDefault();
        void runComparison();
      }
      if (event.key === "/" && view === "catalog") {
        const target = event.target as HTMLElement;
        if (target.tagName !== "INPUT" && target.tagName !== "TEXTAREA") {
          event.preventDefault();
          catalogSearchRef.current?.focus();
        }
      }
      if (event.key === "Escape") {
        setShowConnection(false);
        setShowModelPicker(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  const modelById = useMemo(
    () => new Map(models.map((model) => [model.id, model])),
    [models],
  );
  const selectedModels = useMemo(
    () =>
      selectedModelIds
        .map((id) => modelById.get(id) ?? DEMO_MODELS.find((model) => model.id === id))
        .filter(Boolean) as LabModel[],
    [modelById, selectedModelIds],
  );
  const rank = useMemo(() => rankResults(results), [results]);
  const fitResult = useMemo(
    () =>
      scoreModelFit(
        results.map((result) => ({
          id: result.modelId,
          outcome: result.status === "complete" ? ("succeeded" as const) : ("failed" as const),
          quality: result.rating == null ? null : result.rating * 20,
          costCents: result.cost == null ? null : result.cost * 100,
          ttftMs: result.ttftMs,
          throughputTokensPerSecond: result.tokensPerSecond,
        })),
      ),
    [results],
  );
  const bestFit = fitResult.status === "ok" ? fitResult.scores[0] : null;
  const isRunning = results.some(
    (result) => result.status === "queued" || result.status === "streaming",
  );
  const detailModel = detailModelId ? modelById.get(detailModelId) ?? null : null;

  const categories = useMemo(() => {
    const values = new Set(models.map((model) => model.reportedType || model.type));
    return ["all", ...Array.from(values).sort()];
  }, [models]);

  const filteredModels = useMemo(() => {
    const query = catalogSearch.trim().toLowerCase();
    const rows = models.filter((model) => {
      if (activeOnly && model.deprecatedAt != null) return false;
      if (category !== "all" && model.reportedType !== category && model.type !== category) {
        return false;
      }
      if (capability !== "all" && !model.tags.includes(capability)) return false;
      if (
        query &&
        ![
          model.id,
          model.name,
          model.provider,
          model.description,
          model.type,
          model.reportedType,
          ...model.tags,
        ]
          .join(" ")
          .toLowerCase()
          .includes(query)
      ) {
        return false;
      }
      return true;
    });

    return rows.sort((a, b) => {
      let left: string | number;
      let right: string | number;
      switch (sortKey) {
        case "provider":
          left = a.provider;
          right = b.provider;
          break;
        case "context":
          left = a.contextTokens ?? -1;
          right = b.contextTokens ?? -1;
          break;
        case "input":
          left = tokenPrice(a, "input") ?? Number.MAX_SAFE_INTEGER;
          right = tokenPrice(b, "input") ?? Number.MAX_SAFE_INTEGER;
          break;
        case "output":
          left = tokenPrice(a, "output") ?? Number.MAX_SAFE_INTEGER;
          right = tokenPrice(b, "output") ?? Number.MAX_SAFE_INTEGER;
          break;
        case "type":
          left = a.reportedType;
          right = b.reportedType;
          break;
        default:
          left = a.id;
          right = b.id;
      }
      const comparison =
        typeof left === "number" && typeof right === "number"
          ? left - right
          : String(left).localeCompare(String(right));
      return sortDirection === "asc" ? comparison : -comparison;
    });
  }, [
    activeOnly,
    capability,
    catalogSearch,
    category,
    models,
    sortDirection,
    sortKey,
  ]);

  const pickerModels = useMemo(() => {
    const query = pickerSearch.toLowerCase().trim();
    return models
      .filter(
        (model) =>
          model.reportedType === "text-generation" &&
          model.deprecatedAt == null &&
          model.tags.includes("openai"),
      )
      .filter(
        (model) =>
          !query ||
          [model.id, model.description, ...model.tags].join(" ").toLowerCase().includes(query),
      )
      .slice(0, 60);
  }, [models, pickerSearch]);

  const catalogStats = useMemo(() => {
    const active = models.filter((model) => model.deprecatedAt == null);
    return {
      total: models.length,
      active: active.length,
      chat: active.filter((model) => model.reportedType === "text-generation").length,
      tools: active.filter((model) => model.tags.includes("tools")).length,
      multimodal: active.filter((model) => model.tags.includes("multimodal")).length,
    };
  }, [models]);

  function updateResult(modelId: string, update: Partial<LaneResult>) {
    setResults((current) =>
      current.map((result) =>
        result.modelId === modelId ? { ...result, ...update } : result,
      ),
    );
  }

  async function testConnection() {
    const token = keyDraft.trim();
    if (!token) {
      setConnectionState("error");
      setConnectionMessage("Paste a DeepInfra API key or scoped JWT first.");
      return;
    }
    setConnectionState("testing");
    setConnectionMessage("Checking the credential directly with DeepInfra…");
    const started = performance.now();
    try {
      const response = await fetch("https://api.deepinfra.com/v1/models", {
        headers: { Authorization: `Bearer ${token}` },
        credentials: "omit",
      });
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          throw new Error("DeepInfra rejected this credential. Check it and try again.");
        }
        throw new Error(`DeepInfra returned ${response.status}. Try again in a moment.`);
      }
      const payload = (await response.json()) as { data?: unknown[] };
      const elapsed = Math.round(performance.now() - started);
      setApiKey(token);
      setKeyDraft("");
      setConnectionState("connected");
      setConnectionMessage(
        `Connected · ${payload.data?.length ?? catalogStats.total} endpoints · ${elapsed} ms check`,
      );
      window.setTimeout(() => setShowConnection(false), 900);
    } catch (error) {
      setApiKey("");
      setConnectionState("error");
      setConnectionMessage(safeErrorMessage(error));
    }
  }

  function disconnect() {
    controllersRef.current.forEach((controller) => controller.abort());
    controllersRef.current.clear();
    setApiKey("");
    setConnectionState("idle");
    setConnectionMessage("");
  }

  async function runComparison() {
    if (isRunning) {
      stopAll();
      return;
    }
    if (!apiKey) {
      setShowConnection(true);
      return;
    }
    if (selectedModels.length < 2) {
      setRunMessage("Choose at least two chat-capable models.");
      setShowModelPicker(true);
      return;
    }
    const frozenPrompt = prompt.trim();
    if (!frozenPrompt) {
      promptRef.current?.focus();
      setRunMessage("Write a prompt before starting a run.");
      return;
    }

    setRunMessage("");
    setActivePrompt(frozenPrompt);
    controllersRef.current.forEach((controller) => controller.abort());
    controllersRef.current.clear();
    setResults(
      selectedModels.map((model) => ({
        modelId: model.id,
        status: "queued",
        content: "",
        reasoning: "",
        ttftMs: null,
        totalMs: null,
        tokensPerSecond: null,
        usage: null,
        cost: null,
        costSource: "unknown",
        finishReason: null,
        error: null,
        rating: null,
      })),
    );

    await Promise.allSettled(
      selectedModels.map(async (model) => {
        const controller = new AbortController();
        controllersRef.current.set(model.id, controller);
        const startedAt = performance.now();
        let firstTokenAt: number | undefined;
        let streamedUsage: Usage | null = null;
        updateResult(model.id, { status: "streaming", startedAt });

        try {
          const response = await streamChatCompletion({
            apiKey,
            model: model.id,
            messages: [
              ...(systemPrompt.trim()
                ? [{ role: "system" as const, content: systemPrompt.trim() }]
                : []),
              { role: "user" as const, content: frozenPrompt },
            ],
            settings: {
              temperature,
              maxTokens,
            },
            signal: controller.signal,
            onDelta: (delta: string) => {
              if (!firstTokenAt && delta) firstTokenAt = performance.now();
              setResults((current) =>
                current.map((result) =>
                  result.modelId === model.id
                    ? {
                        ...result,
                        status: "streaming",
                        content: result.content + delta,
                        firstTokenAt,
                        ttftMs: firstTokenAt ? firstTokenAt - startedAt : null,
                      }
                    : result,
                ),
              );
            },
            onReasoning: (delta: string) => {
              setResults((current) =>
                current.map((result) =>
                  result.modelId === model.id
                    ? { ...result, reasoning: result.reasoning + delta }
                    : result,
                ),
              );
            },
            onUsage: (usage: Usage) => {
              streamedUsage = usage;
              updateResult(model.id, { usage });
            },
          });

          const endedAt = performance.now();
          const usage = (response.usage ?? streamedUsage) as Usage | null;
          const completionTokens = usage?.completion_tokens ?? null;
          const generationMs = firstTokenAt ? endedAt - firstTokenAt : null;
          const tokensPerSecond =
            completionTokens != null && generationMs && generationMs > 0
              ? completionTokens / (generationMs / 1000)
              : null;
          const reportedCost = usage?.estimated_cost;
          const fallbackCost = estimateCatalogCost(model, usage);
          updateResult(model.id, {
            status: "complete",
            endedAt,
            totalMs: endedAt - startedAt,
            ttftMs: firstTokenAt ? firstTokenAt - startedAt : null,
            tokensPerSecond,
            usage,
            cost:
              typeof reportedCost === "number" && Number.isFinite(reportedCost)
                ? reportedCost
                : fallbackCost,
            costSource:
              typeof reportedCost === "number"
                ? "reported"
                : fallbackCost != null
                  ? "catalog"
                  : "unknown",
            finishReason: response.finishReason ?? "stop",
          });
        } catch (error) {
          const aborted = controller.signal.aborted;
          updateResult(model.id, {
            status: aborted ? "aborted" : "error",
            endedAt: performance.now(),
            totalMs: performance.now() - startedAt,
            error: aborted ? "Stopped by you. Generated tokens may still be billed." : safeErrorMessage(error),
          });
          if (!aborted && /401|credential|unauthorized/i.test(safeErrorMessage(error))) {
            setApiKey("");
            setConnectionState("error");
          }
        } finally {
          controllersRef.current.delete(model.id);
        }
      }),
    );
  }

  function stopAll() {
    controllersRef.current.forEach((controller) => controller.abort());
    controllersRef.current.clear();
  }

  function stopModel(modelId: string) {
    controllersRef.current.get(modelId)?.abort();
    controllersRef.current.delete(modelId);
  }

  async function rerunModel(modelId: string) {
    if (!apiKey || isRunning) {
      if (!apiKey) setShowConnection(true);
      return;
    }
    const model = modelById.get(modelId);
    if (!model) return;
    const controller = new AbortController();
    controllersRef.current.set(model.id, controller);
    const startedAt = performance.now();
    let firstTokenAt: number | undefined;
    updateResult(model.id, {
      status: "streaming",
      content: "",
      reasoning: "",
      error: null,
      usage: null,
      cost: null,
      ttftMs: null,
      totalMs: null,
      tokensPerSecond: null,
      startedAt,
      isExample: false,
    });
    try {
      const response = await streamChatCompletion({
        apiKey,
        model: model.id,
        messages: [
          ...(systemPrompt.trim()
            ? [{ role: "system" as const, content: systemPrompt.trim() }]
            : []),
          { role: "user" as const, content: activePrompt },
        ],
        settings: { temperature, maxTokens },
        signal: controller.signal,
        onDelta: (delta: string) => {
          if (!firstTokenAt && delta) firstTokenAt = performance.now();
          setResults((current) =>
            current.map((result) =>
              result.modelId === model.id
                ? {
                    ...result,
                    content: result.content + delta,
                    firstTokenAt,
                    ttftMs: firstTokenAt ? firstTokenAt - startedAt : null,
                  }
                : result,
            ),
          );
        },
      });
      const endedAt = performance.now();
      const usage = response.usage as Usage | null;
      const reported = usage?.estimated_cost;
      const fallback = estimateCatalogCost(model, usage);
      updateResult(model.id, {
        status: "complete",
        usage,
        endedAt,
        totalMs: endedAt - startedAt,
        ttftMs: firstTokenAt ? firstTokenAt - startedAt : null,
        tokensPerSecond:
          usage?.completion_tokens && firstTokenAt
            ? usage.completion_tokens / ((endedAt - firstTokenAt) / 1000)
            : null,
        cost: typeof reported === "number" ? reported : fallback,
        costSource:
          typeof reported === "number"
            ? "reported"
            : fallback != null
              ? "catalog"
              : "unknown",
        finishReason: response.finishReason ?? "stop",
      });
    } catch (error) {
      updateResult(model.id, {
        status: controller.signal.aborted ? "aborted" : "error",
        error: controller.signal.aborted
          ? "Stopped by you. Generated tokens may still be billed."
          : safeErrorMessage(error),
      });
    } finally {
      controllersRef.current.delete(model.id);
    }
  }

  function toggleSelectedModel(modelId: string) {
    setSelectedModelIds((current) => {
      if (current.includes(modelId)) return current.filter((id) => id !== modelId);
      if (current.length >= 5) {
        setRunMessage("Arena compares up to five models at once.");
        return current;
      }
      return [...current, modelId];
    });
  }

  function setRating(modelId: string, rating: number) {
    updateResult(modelId, { rating });
  }

  function saveRun() {
    if (!results.length) return;
    const run: SavedRun = {
      id: `RUN-${Date.now().toString(36).toUpperCase()}`,
      createdAt: new Date().toISOString(),
      title: activePrompt.split(/[.!?]/)[0].slice(0, 72) || "Untitled comparison",
      prompt: activePrompt,
      systemPrompt,
      settings: { temperature, maxTokens },
      modelIds: results.map((result) => result.modelId),
      results,
    };
    const next = [run, ...savedRuns].slice(0, 50);
    setSavedRuns(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      setRunMessage("Run saved locally. Your credential was not included.");
    } catch {
      setRunMessage("This browser blocked local storage, so the run could not be saved.");
    }
  }

  function loadRun(run: SavedRun) {
    setActivePrompt(run.prompt);
    setPrompt(run.prompt);
    setSystemPrompt(run.systemPrompt);
    setTemperature(run.settings.temperature);
    setMaxTokens(run.settings.maxTokens);
    setSelectedModelIds(run.modelIds.slice(0, 5));
    setResults(run.results);
    setView("compare");
  }

  function deleteRun(runId: string) {
    const next = savedRuns.filter((run) => run.id !== runId);
    setSavedRuns(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // The in-memory list is still updated.
    }
  }

  function exportRun() {
    const payload = {
      exportedAt: new Date().toISOString(),
      prompt: activePrompt,
      systemPrompt,
      settings: { temperature, maxTokens },
      models: selectedModels,
      results,
      notes:
        "TTFT and latency were observed from this device. Cost is labeled per result as DeepInfra-reported or catalog-derived.",
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const href = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = href;
    link.download = `arena-run-${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(href);
  }

  function changeSort(nextKey: SortKey) {
    if (nextKey === sortKey) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(nextKey);
      setSortDirection("asc");
    }
  }

  function renderSortLabel(label: string, key: SortKey) {
    return `${label}${sortKey === key ? (sortDirection === "asc" ? " ↑" : " ↓") : ""}`;
  }

  const verdict = useMemo(() => {
    if (!results.length) return "Run the same prompt across your contenders to reveal the trade-offs.";
    const finished = results.filter((result) => result.status === "complete");
    if (!finished.length) {
      return isRunning
        ? "The lab is collecting first-token, throughput, usage, and cost evidence."
        : "No contender completed this run.";
    }
    const qualityName = rank.quality
      ? shortName(rank.quality)
      : "Quality needs your blind rating";
    const fastName = rank.fastest ? shortName(rank.fastest) : "no TTFT result";
    const cheapName = rank.cheapest ? shortName(rank.cheapest) : "no cost result";
    return rank.quality
      ? `${qualityName} leads your manual quality rating; ${fastName} reached the first token fastest and ${cheapName} cost least.`
      : `${fastName} reached the first token fastest; ${cheapName} cost least. Rate outputs to add a quality signal.`;
  }, [isRunning, rank, results]);

  return (
    <div className="app-shell">
      <header className="top-nav">
        <button
          type="button"
          className="top-brand"
          onClick={() => setView("compare")}
          aria-label="Arena home"
        >
          <span>A</span>
          <div>
            <strong>Arena</strong>
            <small>Model lab</small>
          </div>
        </button>
        <nav className="top-tabs" aria-label="Primary navigation">
          {(
            [
              ["compare", "Compare"],
              ["catalog", "Models"],
              ["runs", "Runs"],
            ] as const
          ).map(([destination, label]) => (
            <button
              type="button"
              key={destination}
              className={view === destination ? "active" : ""}
              onClick={() => setView(destination)}
              aria-label={label}
            >
              {label}
            </button>
          ))}
        </nav>
        <div className="top-actions">
          <button
            type="button"
            className="model-command"
            onClick={() => setShowModelPicker(true)}
          >
            <span>Models</span>
            <kbd>⌘K</kbd>
          </button>
          <button
            type="button"
            className={`api-status ${apiKey ? "connected" : ""}`}
            onClick={() => setShowConnection(true)}
          >
            <span />
            {apiKey ? "Connected" : "Connect API"}
          </button>
        </div>
      </header>

      <div className="workspace">
        <main>
          {view === "compare" ? (
            <div className="compare-page">
              <section className="compare-hero">
                <div>
                  <span className="eyebrow">COMPARE · {isRunning ? "RUNNING" : "READY"}</span>
                  <h1>Compare models</h1>
                  <p>
                    Send one prompt to every contender. Compare the answers, speed, tokens,
                    and cost side by side.
                  </p>
                </div>
                <div className="hero-actions">
                  <button type="button" className="secondary-button" onClick={saveRun}>
                    Save run
                  </button>
                  <button type="button" className="secondary-button" onClick={exportRun}>
                    Export JSON
                  </button>
                </div>
              </section>

              <section className="run-strip" aria-label="Run setup">
                <div className="run-id">
                  <span className="eyebrow">CURRENT EXPERIMENT</span>
                  <strong>RUN–{new Date().toISOString().slice(5, 10).replace("-", "")}</strong>
                </div>
                <div className="fairness-lock">
                  <span aria-hidden="true">◆</span>
                  <div>
                    <strong>Fair test locked</strong>
                    <small>Same messages and common parameters</small>
                  </div>
                </div>
                <label className="blind-toggle">
                  <input
                    type="checkbox"
                    checked={blindReview}
                    onChange={(event) => setBlindReview(event.target.checked)}
                  />
                  <span />
                  Blind review
                </label>
                <button
                  type="button"
                  className="parameter-button"
                  onClick={() => setShowAdvanced((current) => !current)}
                >
                  T {temperature.toFixed(1)} · {maxTokens.toLocaleString()} max
                  <span aria-hidden="true">{showAdvanced ? "−" : "+"}</span>
                </button>
              </section>

              {showAdvanced ? (
                <section className="advanced-panel">
                  <label className="system-field">
                    <span>System prompt</span>
                    <textarea
                      value={systemPrompt}
                      onChange={(event) => setSystemPrompt(event.target.value)}
                      rows={3}
                    />
                  </label>
                  <label>
                    <span>Temperature</span>
                    <div className="range-row">
                      <input
                        type="range"
                        min="0"
                        max="1.5"
                        step="0.1"
                        value={temperature}
                        onChange={(event) => setTemperature(Number(event.target.value))}
                      />
                      <output>{temperature.toFixed(1)}</output>
                    </div>
                  </label>
                  <label>
                    <span>Maximum output tokens</span>
                    <input
                      type="number"
                      min="64"
                      max="16384"
                      value={maxTokens}
                      onChange={(event) =>
                        setMaxTokens(Math.max(64, Number(event.target.value) || 64))
                      }
                    />
                  </label>
                  <div className="settings-note">
                    Unsupported options are omitted per model. Every run snapshots the applied
                    configuration.
                  </div>
                </section>
              ) : null}

              <section className="model-tray" aria-label="Selected comparison models">
                <div className="tray-label">
                  <span>CONTENDERS</span>
                  <strong>{selectedModels.length}/5</strong>
                </div>
                {selectedModels.map((model, index) => (
                  <div
                    className="model-chip"
                    key={model.id}
                    style={{ "--model-color": MODEL_COLORS[index] } as CSSProperties}
                    title={model.id}
                  >
                    <span className="model-number">{String(index + 1).padStart(2, "0")}</span>
                    <div>
                      <strong>{model.name || shortName(model.id)}</strong>
                      <small>{providerName(model.provider)}</small>
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleSelectedModel(model.id)}
                      disabled={selectedModels.length <= 2}
                      aria-label={`Remove ${model.name || shortName(model.id)}`}
                    >
                      ×
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="add-model"
                  onClick={() => setShowModelPicker(true)}
                  disabled={selectedModels.length >= 5}
                >
                  <span>+</span>
                  Add model
                </button>
              </section>

              {runMessage ? <div className="notice-bar">{runMessage}</div> : null}

              <section className="synopsis">
                <div className="synopsis-copy">
                  <span className="eyebrow">
                    {results.some((result) => result.isExample)
                      ? "EXAMPLE RUN · REPLACE WITH LIVE EVIDENCE"
                      : "RUN SYNOPSIS"}
                  </span>
                  <h2>{verdict}</h2>
                  <p>
                    Quality is never inferred from length or brand. Add manual ratings, then
                    repeat important tests to turn a provisional result into evidence.
                  </p>
                </div>
                <div className="winner-board">
                  <div>
                    <span>QUALITY</span>
                    <strong>{rank.quality ? shortName(rank.quality) : "Needs rating"}</strong>
                    <small>Manual signal</small>
                  </div>
                  <div>
                    <span>FIRST TOKEN</span>
                    <strong>{rank.fastest ? shortName(rank.fastest) : "—"}</strong>
                    <small>Observed here</small>
                  </div>
                  <div>
                    <span>LOWEST COST</span>
                    <strong>{rank.cheapest ? shortName(rank.cheapest) : "—"}</strong>
                    <small>Reported / derived</small>
                  </div>
                  <div>
                    <span>BEST WEIGHTED FIT</span>
                    <strong>{bestFit ? shortName(bestFit.candidateId) : "Needs ratings"}</strong>
                    <small>{bestFit ? `${bestFit.score.toFixed(0)} / 100 · provisional` : "Q55 · C20 · T25"}</small>
                  </div>
                </div>
              </section>

              <section className="prompt-band">
                <div>
                  <span>PROMPT 01</span>
                  <small>YOU · FAIR TEST · {activePrompt.length} CHARACTERS</small>
                </div>
                <p>“{activePrompt}”</p>
              </section>

              <section
                className="response-grid"
                style={
                  {
                    "--lane-count": Math.max(results.length, 2),
                  } as CSSProperties
                }
              >
                {results.map((result, index) => {
                  const model =
                    modelById.get(result.modelId) ??
                    DEMO_MODELS.find((candidate) => candidate.id === result.modelId);
                  if (!model) return null;
                  const displayName = blindReview
                    ? `Contender ${String.fromCharCode(65 + index)}`
                    : model.name || shortName(model.id);
                  return (
                    <article
                      className={`response-lane status-${result.status}`}
                      key={result.modelId}
                      style={{ "--model-color": MODEL_COLORS[index] } as CSSProperties}
                    >
                      <header className="lane-header">
                        <div className="lane-identity">
                          <span>{String(index + 1).padStart(2, "0")}</span>
                          <div>
                            <strong>{displayName}</strong>
                            <small>{blindReview ? "Identity hidden" : model.id}</small>
                          </div>
                        </div>
                        <div className={`run-status ${result.status}`}>
                          <span />
                          {statusLabel(result.status)}
                        </div>
                      </header>

                      {result.reasoning ? (
                        <details className="reasoning-block">
                          <summary>Reasoning trace</summary>
                          <pre>{result.reasoning}</pre>
                        </details>
                      ) : null}

                      <div className="response-copy">
                        {result.content ? (
                          <pre>{result.content}</pre>
                        ) : result.status === "queued" || result.status === "streaming" ? (
                          <div className="stream-placeholder">
                            <span />
                            <span />
                            <span />
                            <small>Waiting for the first token…</small>
                          </div>
                        ) : result.error ? (
                          <div className="lane-error">
                            <strong>This lane did not complete.</strong>
                            <p>{result.error}</p>
                          </div>
                        ) : (
                          <div className="empty-response">Ready for a live run.</div>
                        )}
                        {result.status === "streaming" && result.content ? (
                          <span className="stream-cursor" aria-hidden="true" />
                        ) : null}
                      </div>

                      <footer className="lane-footer">
                        <div className="lane-tools">
                          <Rating
                            value={result.rating}
                            onChange={(rating) => setRating(result.modelId, rating)}
                          />
                          <div>
                            {result.status === "streaming" || result.status === "queued" ? (
                              <button
                                type="button"
                                onClick={() => stopModel(result.modelId)}
                              >
                                Stop
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => void rerunModel(result.modelId)}
                              >
                                Rerun
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => void navigator.clipboard.writeText(result.content)}
                              disabled={!result.content}
                            >
                              Copy
                            </button>
                          </div>
                        </div>
                        <div className="metrics-rail">
                          <Metric
                            label="TTFT"
                            value={
                              result.ttftMs == null
                                ? "—"
                                : result.ttftMs < 1000
                                  ? `${Math.round(result.ttftMs)} ms`
                                  : `${(result.ttftMs / 1000).toFixed(2)} s`
                            }
                            winner={rank.fastest === result.modelId ? "FASTEST" : undefined}
                            title="Time from request start to the first rendered token, observed from this device."
                          />
                          <Metric
                            label="SPEED"
                            value={
                              result.tokensPerSecond == null
                                ? "—"
                                : `${result.tokensPerSecond.toFixed(1)} t/s`
                            }
                            winner={
                              rank.throughput === result.modelId ? "HIGHEST" : undefined
                            }
                            title="Completion tokens divided by generation duration."
                          />
                          <Metric
                            label="TOKENS"
                            value={
                              result.usage
                                ? `${result.usage.prompt_tokens ?? "?"} → ${
                                    result.usage.completion_tokens ?? "?"
                                  }`
                                : "—"
                            }
                            title="Prompt tokens → completion tokens, as reported by DeepInfra."
                          />
                          <Metric
                            label="LATENCY"
                            value={
                              result.totalMs == null
                                ? "—"
                                : `${(result.totalMs / 1000).toFixed(2)} s`
                            }
                            title="End-to-end time observed from this device."
                          />
                          <Metric
                            label="COST"
                            value={formatMoney(result.cost)}
                            winner={rank.cheapest === result.modelId ? "LOWEST" : undefined}
                            title={
                              result.costSource === "reported"
                                ? "DeepInfra-reported estimated cost."
                                : result.costSource === "catalog"
                                  ? "Estimated from the catalog price snapshot."
                                  : "Cost was not available."
                            }
                          />
                        </div>
                      </footer>
                    </article>
                  );
                })}
              </section>

              <section className="composer" aria-label="Prompt composer">
                <div className="composer-meta">
                  <span>NEW FAIR TEST</span>
                  <small>
                    {selectedModels.length} models · key {apiKey ? "in memory" : "not connected"} ·
                    client-observed timing
                  </small>
                </div>
                <div className="composer-row">
                  <textarea
                    ref={promptRef}
                    rows={3}
                    value={prompt}
                    onChange={(event) => setPrompt(event.target.value)}
                    placeholder="Give every contender the same prompt…"
                  />
                  <button
                    type="button"
                    className={`run-button ${isRunning ? "stop" : ""}`}
                    onClick={() => void runComparison()}
                  >
                    <span>{isRunning ? "Stop all" : `Run ${selectedModels.length} models`}</span>
                    <kbd>{isRunning ? "ESC" : "⌘ ↵"}</kbd>
                  </button>
                </div>
              </section>
            </div>
          ) : null}

          {view === "catalog" ? (
            <div className="catalog-page">
              <section className="page-title-row">
                <div>
                  <span className="eyebrow">LIVE DEEPINFRA CATALOG</span>
                  <h1>Find the right model</h1>
                  <p>
                    Search the full catalog, compare capabilities and prices, then add active
                    chat models directly to your test.
                  </p>
                </div>
                <button type="button" className="primary-button" onClick={() => void loadCatalog()}>
                  Refresh catalog
                </button>
              </section>

              <section className="catalog-ledger">
                <div>
                  <strong>{catalogStats.total}</strong>
                  <span>ALL MODELS</span>
                </div>
                <div>
                  <strong>{catalogStats.active}</strong>
                  <span>ACTIVE</span>
                </div>
                <div>
                  <strong>{catalogStats.chat}</strong>
                  <span>TEXT</span>
                </div>
                <div>
                  <strong>{catalogStats.tools}</strong>
                  <span>TOOL-CAPABLE</span>
                </div>
                <div>
                  <strong>{catalogStats.multimodal}</strong>
                  <span>MULTIMODAL</span>
                </div>
                <div className="ledger-source">
                  <span className={`source-dot ${catalogSource}`} />
                  <strong>
                    {catalogSource === "live"
                      ? "LIVE"
                      : catalogSource === "loading"
                        ? "SYNCING"
                        : "SNAPSHOT"}
                  </strong>
                  <span>
                    {catalogUpdatedAt
                      ? catalogUpdatedAt.toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "Fallback data"}
                  </span>
                </div>
              </section>

              <section className="catalog-toolbar">
                <label className="catalog-search">
                  <span aria-hidden="true">⌕</span>
                  <input
                    ref={catalogSearchRef}
                    value={catalogSearch}
                    onChange={(event) => setCatalogSearch(event.target.value)}
                    placeholder="Search model, provider, capability…"
                  />
                  <kbd>/</kbd>
                </label>
                <select value={category} onChange={(event) => setCategory(event.target.value)}>
                  {categories.map((value) => (
                    <option key={value} value={value}>
                      {value === "all" ? "All modalities" : value.replace(/-/g, " ")}
                    </option>
                  ))}
                </select>
                <select value={capability} onChange={(event) => setCapability(event.target.value)}>
                  <option value="all">All capabilities</option>
                  <option value="tools">Tool calling</option>
                  <option value="json">JSON mode</option>
                  <option value="structured-output">Structured output</option>
                  <option value="reasoning">Reasoning</option>
                  <option value="multimodal">Multimodal</option>
                  <option value="flex">Flex tier</option>
                  <option value="priority">Priority tier</option>
                </select>
                <label className="check-filter">
                  <input
                    type="checkbox"
                    checked={activeOnly}
                    onChange={(event) => setActiveOnly(event.target.checked)}
                  />
                  Active only
                </label>
                <div className="view-switcher">
                  <button
                    type="button"
                    className={catalogView === "table" ? "active" : ""}
                    onClick={() => setCatalogView("table")}
                  >
                    Table
                  </button>
                  <button
                    type="button"
                    className={catalogView === "map" ? "active" : ""}
                    onClick={() => setCatalogView("map")}
                  >
                    Frontier map
                  </button>
                </div>
              </section>

              <section className="catalog-results-meta">
                <span>
                  <strong>{filteredModels.length}</strong> matching models
                </span>
                <span>
                  Unknown values stay unknown · prices compare only within compatible units
                </span>
              </section>

              {catalogView === "table" ? (
                <div className="table-shell">
                  <table className="model-table">
                    <thead>
                      <tr>
                        <th>COMPARE</th>
                        <th>
                          <button type="button" onClick={() => changeSort("model")}>
                            {renderSortLabel("MODEL", "model")}
                          </button>
                        </th>
                        <th>
                          <button type="button" onClick={() => changeSort("provider")}>
                            {renderSortLabel("PROVIDER", "provider")}
                          </button>
                        </th>
                        <th>
                          <button type="button" onClick={() => changeSort("type")}>
                            {renderSortLabel("TYPE", "type")}
                          </button>
                        </th>
                        <th>CAPABILITIES</th>
                        <th>
                          <button type="button" onClick={() => changeSort("context")}>
                            {renderSortLabel("CONTEXT", "context")}
                          </button>
                        </th>
                        <th>
                          <button type="button" onClick={() => changeSort("input")}>
                            {renderSortLabel("INPUT / 1M", "input")}
                          </button>
                        </th>
                        <th>
                          <button type="button" onClick={() => changeSort("output")}>
                            {renderSortLabel("OUTPUT / 1M", "output")}
                          </button>
                        </th>
                        <th>LIFECYCLE</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {filteredModels.slice(0, 180).map((model) => {
                        const chatCapable =
                          model.reportedType === "text-generation" &&
                          model.tags.includes("openai") &&
                          model.deprecatedAt == null;
                        const selected = selectedModelIds.includes(model.id);
                        return (
                          <tr
                            key={model.id}
                            className={selected ? "selected" : ""}
                            onClick={() => setDetailModelId(model.id)}
                          >
                            <td onClick={(event) => event.stopPropagation()}>
                              <button
                                type="button"
                                className={`row-select ${selected ? "selected" : ""}`}
                                disabled={!chatCapable || (!selected && selectedModelIds.length >= 5)}
                                onClick={() => toggleSelectedModel(model.id)}
                                aria-label={
                                  selected
                                    ? `Remove ${model.id} from comparison`
                                    : `Add ${model.id} to comparison`
                                }
                                title={
                                  chatCapable
                                    ? "Add to Arena"
                                    : "This endpoint is not an active chat model"
                                }
                              >
                                {selected ? "✓" : "+"}
                              </button>
                            </td>
                            <td className="model-cell">
                              <strong>{model.name || shortName(model.id)}</strong>
                              <small>{model.id}</small>
                            </td>
                            <td>{providerName(model.provider)}</td>
                            <td>
                              <span className="type-stamp">
                                {(model.reportedType || model.type).replace(/-/g, " ")}
                              </span>
                            </td>
                            <td>
                              <div className="capability-list">
                                {model.tags
                                  .filter((tag) =>
                                    [
                                      "tools",
                                      "json",
                                      "structured-output",
                                      "structured_output",
                                      "reasoning",
                                      "multimodal",
                                      "input-audio",
                                    ].includes(tag),
                                  )
                                  .slice(0, 3)
                                  .map((tag) => (
                                    <span key={tag}>{capabilityLabel(tag)}</span>
                                  ))}
                                {!model.tags.some((tag) =>
                                  [
                                    "tools",
                                    "json",
                                    "structured-output",
                                    "structured_output",
                                    "reasoning",
                                    "multimodal",
                                    "input-audio",
                                  ].includes(tag),
                                ) ? (
                                  <span className="muted-stamp">—</span>
                                ) : null}
                              </div>
                            </td>
                            <td className="numeric">{formatContext(model.contextTokens)}</td>
                            <td className="numeric">
                              {tokenPrice(model, "input") == null
                                ? "—"
                                : `$${tokenPrice(model, "input")?.toFixed(2)}`}
                            </td>
                            <td className="numeric">
                              {tokenPrice(model, "output") == null
                                ? "—"
                                : `$${tokenPrice(model, "output")?.toFixed(2)}`}
                            </td>
                            <td>
                              <span
                                className={`lifecycle ${
                                  model.deprecatedAt == null ? "active" : "deprecated"
                                }`}
                              >
                                {model.deprecatedAt == null ? "ACTIVE" : "DEPRECATED"}
                              </span>
                            </td>
                            <td>
                              <button
                                type="button"
                                className="row-arrow"
                                onClick={() => setDetailModelId(model.id)}
                                aria-label={`Open ${model.id} details`}
                              >
                                →
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <FrontierMap models={filteredModels} onSelect={setDetailModelId} />
              )}

              {selectedModelIds.length ? (
                <div className="selection-tray">
                  <div>
                    <span>{selectedModelIds.length}</span>
                    <strong>selected for Arena</strong>
                  </div>
                  <div className="selection-dots">
                    {selectedModelIds.map((id, index) => (
                      <span
                        key={id}
                        style={{ "--dot-color": MODEL_COLORS[index] } as CSSProperties}
                        title={id}
                      />
                    ))}
                  </div>
                  <button type="button" onClick={() => setView("compare")}>
                    Open comparison →
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}

          {view === "runs" ? (
            <div className="runs-page">
              <section className="page-title-row">
                <div>
                  <span className="eyebrow">YOUR LOCAL EVIDENCE</span>
                  <h1>Saved runs</h1>
                  <p>
                    Reopen comparisons with prompts, outputs, ratings, usage, timing, and cost
                    evidence intact. Credentials are never saved.
                  </p>
                </div>
                <button type="button" className="primary-button" onClick={() => setView("compare")}>
                  New comparison
                </button>
              </section>

              <section className="benchmark-presets">
                <div className="preset-intro">
                  <span className="eyebrow">BENCHMARK STARTERS</span>
                  <h2>Repeat the work that matters.</h2>
                  <p>
                    Use cases define what “best” means. These starters set sensible quality,
                    cost, and speed priorities without pretending one model wins everything.
                  </p>
                </div>
                {[
                  {
                    name: "Coding agent",
                    meta: "Quality 50 · Speed 20 · Cost 15 · Reliability 15",
                    prompt:
                      "Review this repository architecture, identify the highest-risk design issue, and propose a minimal patch with tests.",
                  },
                  {
                    name: "RAG extraction",
                    meta: "Quality 45 · Cost 30 · Speed 15 · Reliability 10",
                    prompt:
                      "Extract the specified fields as strict JSON. Return null for unsupported claims and cite the source span for every value.",
                  },
                  {
                    name: "Realtime chat",
                    meta: "Quality 35 · TTFT 30 · Cost 25 · Reliability 10",
                    prompt:
                      "Answer the customer’s question directly in under 120 words, then offer one useful next step.",
                  },
                ].map((preset, index) => (
                  <button
                    type="button"
                    className="preset-card"
                    key={preset.name}
                    onClick={() => {
                      setPrompt(preset.prompt);
                      setActivePrompt(preset.prompt);
                      setView("compare");
                      promptRef.current?.focus();
                    }}
                  >
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <strong>{preset.name}</strong>
                    <p>{preset.meta}</p>
                    <small>Load into Arena →</small>
                  </button>
                ))}
              </section>

              <section className="runs-list-section">
                <div className="section-heading">
                  <div>
                    <span className="eyebrow">RUN HISTORY</span>
                    <h2>{savedRuns.length ? `${savedRuns.length} saved experiments` : "No saved runs yet"}</h2>
                  </div>
                  <small>Stored on this device only</small>
                </div>
                {savedRuns.length ? (
                  <div className="runs-list">
                    {savedRuns.map((run) => {
                      const complete = run.results.filter(
                        (result) => result.status === "complete",
                      );
                      const totalCost = complete.reduce(
                        (sum, result) => sum + (result.cost ?? 0),
                        0,
                      );
                      return (
                        <article key={run.id} className="saved-run">
                          <div className="saved-run-id">
                            <strong>{run.id}</strong>
                            <span>
                              {new Date(run.createdAt).toLocaleDateString([], {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                              })}
                            </span>
                          </div>
                          <div className="saved-run-main">
                            <strong>{run.title}</strong>
                            <p>{run.prompt}</p>
                            <div>
                              {run.modelIds.slice(0, 5).map((id, index) => (
                                <span key={id}>
                                  <i style={{ background: MODEL_COLORS[index] }} />
                                  {shortName(id)}
                                </span>
                              ))}
                            </div>
                          </div>
                          <div className="saved-run-metrics">
                            <span>
                              <small>COMPLETE</small>
                              <strong>
                                {complete.length}/{run.results.length}
                              </strong>
                            </span>
                            <span>
                              <small>TOTAL COST</small>
                              <strong>{formatMoney(totalCost)}</strong>
                            </span>
                          </div>
                          <div className="saved-run-actions">
                            <button type="button" onClick={() => loadRun(run)}>
                              Open
                            </button>
                            <button type="button" onClick={() => deleteRun(run.id)}>
                              Delete
                            </button>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                ) : (
                  <div className="empty-runs">
                    <span>∅</span>
                    <strong>Your evidence shelf is empty.</strong>
                    <p>Complete a comparison, add quality ratings, then save the run.</p>
                    <button type="button" onClick={() => setView("compare")}>
                      Go to Arena
                    </button>
                  </div>
                )}
              </section>
            </div>
          ) : null}
        </main>
      </div>

      {showConnection ? (
        <div className="modal-backdrop" role="presentation">
          <section
            className="connection-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="connection-title"
          >
            <button
              type="button"
              className="modal-close"
              onClick={() => setShowConnection(false)}
              aria-label="Close connection panel"
            >
              ×
            </button>
            <div className="connection-intro">
              <span className="eyebrow">DEEPINFRA CONNECTION</span>
              <h2 id="connection-title">Bring the live model catalog into your lab.</h2>
              <p>
                Arena calls DeepInfra directly from your browser. Your credential is held in
                memory only and disappears when you refresh or close this page.
              </p>
              <div className="connection-flow">
                <span>YOU</span>
                <i>→</i>
                <span>ARENA</span>
                <i>→</i>
                <span>DEEPINFRA</span>
              </div>
              <ul>
                <li>Live catalog with every modality and pricing unit</li>
                <li>Independent streaming requests for each contender</li>
                <li>No credential in source, URL, local storage, or saved runs</li>
              </ul>
              <a
                href="https://docs.deepinfra.com/account/authentication"
                target="_blank"
                rel="noreferrer"
              >
                DeepInfra authentication guide ↗
              </a>
            </div>
            <div className="connection-form">
              {apiKey ? (
                <div className="connected-state">
                  <span className="connected-seal">✓</span>
                  <span className="eyebrow">CONNECTION ACTIVE</span>
                  <h3>DeepInfra is ready.</h3>
                  <p>
                    The credential lives only in this page’s memory. Disconnecting clears it
                    immediately.
                  </p>
                  {connectionMessage ? <div className="connection-result">{connectionMessage}</div> : null}
                  <button type="button" className="danger-button" onClick={disconnect}>
                    Disconnect and clear credential
                  </button>
                </div>
              ) : (
                <>
                  <span className="eyebrow">MEMORY-ONLY CREDENTIAL</span>
                  <h3>Connect a scoped token when possible.</h3>
                  <p>
                    Full API keys have broad account access. For a browser tool, DeepInfra’s
                    spend-limited, model-scoped JWT is the safer choice.
                  </p>
                  <label>
                    <span>API key or scoped JWT</span>
                    <input
                      type="password"
                      value={keyDraft}
                      onChange={(event) => setKeyDraft(event.target.value)}
                      placeholder="di_… or jwt:…"
                      autoComplete="off"
                      spellCheck={false}
                    />
                  </label>
                  <div className="security-note">
                    <strong>Privacy boundary</strong>
                    <p>
                      Prompts and this credential go directly to DeepInfra over HTTPS. Saved
                      experiment data stays in this browser; the credential is excluded.
                    </p>
                  </div>
                  {connectionMessage ? (
                    <div className={`connection-result ${connectionState}`}>
                      {connectionState === "testing" ? <span className="spinner" /> : null}
                      {connectionMessage}
                    </div>
                  ) : null}
                  <button
                    type="button"
                    className="primary-button full"
                    onClick={() => void testConnection()}
                    disabled={connectionState === "testing"}
                  >
                    {connectionState === "testing" ? "Testing connection…" : "Test and connect"}
                  </button>
                </>
              )}
            </div>
          </section>
        </div>
      ) : null}

      {showModelPicker ? (
        <div className="modal-backdrop picker-backdrop" role="presentation">
          <section
            className="model-picker"
            role="dialog"
            aria-modal="true"
            aria-labelledby="picker-title"
          >
            <header>
              <div>
                <span className="eyebrow">MODEL COMMAND</span>
                <h2 id="picker-title">Choose your contenders.</h2>
              </div>
              <button
                type="button"
                className="modal-close static"
                onClick={() => setShowModelPicker(false)}
                aria-label="Close model picker"
              >
                ×
              </button>
            </header>
            <label className="picker-search">
              <span aria-hidden="true">⌕</span>
              <input
                autoFocus
                value={pickerSearch}
                onChange={(event) => setPickerSearch(event.target.value)}
                placeholder="Search active chat models, providers, capabilities…"
              />
              <kbd>ESC</kbd>
            </label>
            <div className="picker-meta">
              <span>
                {pickerModels.length} chat-capable matches · {selectedModelIds.length}/5 selected
              </span>
              <span>{catalogSource === "live" ? "Live DeepInfra catalog" : "Catalog snapshot"}</span>
            </div>
            <div className="picker-list">
              {pickerModels.map((model) => {
                const selected = selectedModelIds.includes(model.id);
                return (
                  <button
                    type="button"
                    className={`picker-row ${selected ? "selected" : ""}`}
                    key={model.id}
                    onClick={() => toggleSelectedModel(model.id)}
                    disabled={!selected && selectedModelIds.length >= 5}
                  >
                    <span className="picker-check">{selected ? "✓" : "+"}</span>
                    <div className="picker-name">
                      <strong>{model.name || shortName(model.id)}</strong>
                      <small>{model.id}</small>
                    </div>
                    <div className="picker-tags">
                      {model.tags
                        .filter((tag) =>
                          ["tools", "json", "reasoning", "multimodal", "structured-output"].includes(
                            tag,
                          ),
                        )
                        .slice(0, 3)
                        .map((tag) => (
                          <span key={tag}>{capabilityLabel(tag)}</span>
                        ))}
                    </div>
                    <div className="picker-price">
                      <strong>{formatContext(model.contextTokens)}</strong>
                      <small>{pricingText(model)}</small>
                    </div>
                  </button>
                );
              })}
            </div>
            <footer>
              <span>Only active OpenAI-compatible text models can enter a chat comparison.</span>
              <button type="button" onClick={() => setShowModelPicker(false)}>
                Done · {selectedModelIds.length} models
              </button>
            </footer>
          </section>
        </div>
      ) : null}

      {detailModel ? (
        <div className="drawer-backdrop" role="presentation" onClick={() => setDetailModelId(null)}>
          <aside
            className="model-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="drawer-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header>
              <span className="eyebrow">MODEL SPECIMEN</span>
              <button type="button" onClick={() => setDetailModelId(null)} aria-label="Close model details">
                ×
              </button>
            </header>
            <div className="drawer-title">
              <span>{providerName(detailModel.provider)}</span>
              <h2 id="drawer-title">{detailModel.name || shortName(detailModel.id)}</h2>
              <code>{detailModel.id}</code>
            </div>
            <p className="drawer-description">
              {detailModel.description || "DeepInfra does not currently provide a description for this endpoint."}
            </p>
            <div className="drawer-actions">
              <button
                type="button"
                className="primary-button"
                disabled={
                  detailModel.reportedType !== "text-generation" ||
                  !detailModel.tags.includes("openai") ||
                  detailModel.deprecatedAt != null
                }
                onClick={() => toggleSelectedModel(detailModel.id)}
              >
                {selectedModelIds.includes(detailModel.id) ? "Remove from Arena" : "Add to Arena"}
              </button>
              {selectedModelIds.includes(detailModel.id) ? (
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => {
                    setView("compare");
                    setDetailModelId(null);
                  }}
                >
                  Open Arena
                </button>
              ) : null}
            </div>
            <section className="spec-grid">
              <div>
                <span>TYPE</span>
                <strong>{detailModel.reportedType.replace(/-/g, " ")}</strong>
              </div>
              <div>
                <span>CONTEXT</span>
                <strong>{formatContext(detailModel.contextTokens)} tokens</strong>
              </div>
              <div>
                <span>QUANTIZATION</span>
                <strong>{detailModel.quantization ?? "Unknown"}</strong>
              </div>
              <div>
                <span>LIFECYCLE</span>
                <strong>{detailModel.deprecatedAt == null ? "Active" : "Deprecated"}</strong>
              </div>
            </section>
            <section className="drawer-section">
              <span className="eyebrow">DEEPINFRA PRICING</span>
              <h3>{pricingText(detailModel)}</h3>
              <p>
                Pricing is a current catalog snapshot. The run view prefers DeepInfra’s reported
                per-request estimate when available.
              </p>
            </section>
            {tokenPrice(detailModel, "input") != null ? (
              <section className="cost-calculator">
                <span className="eyebrow">SCENARIO COST</span>
                <h3>Monthly workload</h3>
                <div>
                  <label>
                    <span>Input tokens · millions</span>
                    <input
                      type="number"
                      min="0"
                      value={monthlyInput}
                      onChange={(event) => setMonthlyInput(Number(event.target.value))}
                    />
                  </label>
                  <label>
                    <span>Output tokens · millions</span>
                    <input
                      type="number"
                      min="0"
                      value={monthlyOutput}
                      onChange={(event) => setMonthlyOutput(Number(event.target.value))}
                    />
                  </label>
                </div>
                <strong>
                  {formatMoney(
                    monthlyInput * (tokenPrice(detailModel, "input") ?? 0) +
                      monthlyOutput * (tokenPrice(detailModel, "output") ?? 0),
                    2,
                  )}
                  <small>/ month</small>
                </strong>
              </section>
            ) : null}
            <section className="drawer-section">
              <span className="eyebrow">CAPABILITIES</span>
              <div className="drawer-tags">
                {detailModel.tags.length ? (
                  detailModel.tags.map((tag) => <span key={tag}>{capabilityLabel(tag)}</span>)
                ) : (
                  <p>No capability tags reported.</p>
                )}
              </div>
            </section>
            <section className="evidence-empty">
              <span>MEASURED BY YOU</span>
              <strong>No saved benchmark evidence yet.</strong>
              <p>
                Catalog facts and your observed evidence stay separate. Run this model to build
                TTFT, throughput, cost, reliability, and quality history.
              </p>
            </section>
          </aside>
        </div>
      ) : null}
    </div>
  );
}

function FrontierMap({
  models,
  onSelect,
}: {
  models: LabModel[];
  onSelect: (modelId: string) => void;
}) {
  const candidates = models
    .filter(
      (model) =>
        model.reportedType === "text-generation" &&
        tokenPrice(model, "input") != null &&
        model.contextTokens,
    )
    .slice(0, 70);
  const prices = candidates.map((model) => tokenPrice(model, "input") ?? 0.01);
  const contexts = candidates.map((model) => model.contextTokens ?? 1);
  const minLogPrice = Math.log10(Math.max(Math.min(...prices), 0.001));
  const maxLogPrice = Math.log10(Math.max(...prices, 1));
  const minLogContext = Math.log10(Math.max(Math.min(...contexts), 1024));
  const maxLogContext = Math.log10(Math.max(...contexts, 131072));
  const rangeX = Math.max(maxLogPrice - minLogPrice, 0.01);
  const rangeY = Math.max(maxLogContext - minLogContext, 0.01);

  const points = candidates.map((model) => {
    const price = tokenPrice(model, "input") ?? 0.01;
    const context = model.contextTokens ?? 1024;
    const x = ((Math.log10(Math.max(price, 0.001)) - minLogPrice) / rangeX) * 86 + 7;
    const y =
      93 - ((Math.log10(Math.max(context, 1024)) - minLogContext) / rangeY) * 82;
    const pareto = !candidates.some((other) => {
      const otherPrice = tokenPrice(other, "input");
      if (otherPrice == null || other.contextTokens == null) return false;
      return (
        otherPrice <= price &&
        other.contextTokens >= context &&
        (otherPrice < price || other.contextTokens > context)
      );
    });
    return { model, x, y, pareto };
  });

  return (
    <section className="frontier-shell">
      <div className="frontier-header">
        <div>
          <span className="eyebrow">COST × CAPACITY FRONTIER</span>
          <h2>Find more context for less input cost.</h2>
          <p>
            This catalog map uses reported context and current input price—not fabricated quality.
            Dark outlined models sit on the Pareto frontier.
          </p>
        </div>
        <div className="frontier-legend">
          <span><i className="pareto-dot" /> Pareto frontier</span>
          <span><i /> Other text models</span>
        </div>
      </div>
      <div className="frontier-chart">
        <span className="axis-label y">MORE CONTEXT ↑</span>
        <span className="axis-label x">LOWER INPUT COST ←</span>
        <div className="grid-lines" />
        {points.map(({ model, x, y, pareto }, index) => (
          <button
            type="button"
            className={`frontier-point ${pareto ? "pareto" : ""}`}
            key={model.id}
            style={
              {
                left: `${x}%`,
                top: `${y}%`,
                "--point-color": MODEL_COLORS[index % MODEL_COLORS.length],
              } as CSSProperties
            }
            onClick={() => onSelect(model.id)}
            title={`${model.name || shortName(model.id)} · ${formatContext(
              model.contextTokens,
            )} · $${tokenPrice(model, "input")?.toFixed(2)}/1M input`}
          >
            <span />
            {pareto ? <small>{model.name || shortName(model.id)}</small> : null}
          </button>
        ))}
        <div className="axis-ticks x-ticks">
          <span>LOW</span><span>INPUT PRICE / 1M</span><span>HIGH</span>
        </div>
        <div className="axis-ticks y-ticks">
          <span>HIGH</span><span>CONTEXT</span><span>LOW</span>
        </div>
      </div>
    </section>
  );
}
