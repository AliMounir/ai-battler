const MODELS_URL = "https://api.deepinfra.com/models/list";
const CHAT_COMPLETIONS_URL =
  "https://api.deepinfra.com/v1/openai/chat/completions";

export interface RawPricingTable {
  columns: string[];
  rows: Array<Array<string | number | null>>;
}

interface RawPricingBase {
  short: string | null;
  full: string | null;
  table: RawPricingTable | null;
}

export interface RawTokenPricing extends RawPricingBase {
  type: "tokens";
  cents_per_input_token: number;
  cents_per_output_token: number;
  rate_per_input_token_cached: number | null;
  rate_per_input_token_cache_write: number | null;
  rate_per_service_tier_priority: number | null;
  rate_per_service_tier_flex: number | null;
}

export interface RawInputTokenPricing extends RawPricingBase {
  type: "input_tokens";
  cents_per_input_token: number;
}

export interface RawInputLengthPricing extends RawPricingBase {
  type: "input_length";
  cents_per_input_sec: number;
}

export interface RawInputCharacterPricing extends RawPricingBase {
  type: "input_character_length";
  cents_per_input_chars: number;
}

export interface RawImageUnitPricing extends RawPricingBase {
  type: "image_units";
  cents_per_image_unit: number;
  default_width: number | null;
  default_height: number | null;
  default_iterations: number | null;
  default_price_cents: number | null;
  usage_from_cost: boolean | null;
}

export interface RawOutputLengthPricing extends RawPricingBase {
  type: "output_length";
  cents_per_output_sec: number;
}

export interface RawTimePricing extends RawPricingBase {
  type: "time";
  cents_per_sec: number;
}

export interface RawUptimePricing extends RawPricingBase {
  type: "uptime";
  cents_per_sec: number;
}

export interface RawFrameUnitPricing extends RawPricingBase {
  type: "frame_units";
  cents_per_frame_unit: number;
}

/**
 * Keeps catalog parsing forward-compatible when DeepInfra adds a pricing kind.
 * Known numeric fields are retained by the normalizer.
 */
export interface RawUnknownPricing extends RawPricingBase {
  type: string;
  [key: string]: unknown;
}

export type RawCatalogPricing =
  | RawTokenPricing
  | RawInputTokenPricing
  | RawInputLengthPricing
  | RawInputCharacterPricing
  | RawImageUnitPricing
  | RawOutputLengthPricing
  | RawTimePricing
  | RawUptimePricing
  | RawFrameUnitPricing
  | RawUnknownPricing;

export interface RawCatalogModel {
  model_name: string;
  type: string;
  reported_type: string;
  pricing: RawCatalogPricing | null;
  description: string;
  cover_img_url: string;
  tags: string[];
  max_tokens: number | null;
  replaced_by: string | null;
  deprecated: number | null;
  quantization: string | null;
  mmlu: number | null;
  expected: string | null;
  create_ts: string | null;
  private: number;
  is_partner: boolean;
}

export interface NormalizedPricing {
  type: string;
  label: string;
  inputUsdPerMillion: number | null;
  outputUsdPerMillion: number | null;
  cachedInputUsdPerMillion: number | null;
  short: string | null;
  full: string | null;
  table: RawPricingTable | null;
  raw: RawCatalogPricing | null;
}

export interface NormalizedModel {
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
  pricing: NormalizedPricing;
  raw: RawCatalogModel;
  coverImageUrl: string | null;
  mmlu: number | null;
  createdAt: string | null;
  private: boolean;
  chatCapable: boolean;
}

export type DeepInfraRawPricing = RawCatalogPricing;
export type DeepInfraRawModel = RawCatalogModel;
export type DeepInfraModel = NormalizedModel;

export type ChatRole = "system" | "user" | "assistant" | "tool";

export interface ChatContentPart {
  type: string;
  text?: string;
  image_url?: {
    url: string;
    detail?: "auto" | "low" | "high";
  };
  [key: string]: unknown;
}

export interface ChatMessage {
  role: ChatRole;
  content: string | ChatContentPart[] | null;
  name?: string;
  tool_call_id?: string;
  [key: string]: unknown;
}

export interface ChatSettings {
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  minP?: number;
  topK?: number;
  presencePenalty?: number;
  frequencyPenalty?: number;
  repetitionPenalty?: number;
  seed?: number;
  stop?: string | string[];
  serviceTier?: "auto" | "default" | "priority" | "flex";
  reasoningEffort?: "none" | "low" | "medium" | "high";
  reasoning?: {
    enabled?: boolean;
    effort?: "none" | "low" | "medium" | "high";
  };
  responseFormat?:
    | { type: "text" | "json_object" }
    | {
        type: "json_schema";
        json_schema: {
          name: string;
          schema: Record<string, unknown>;
          strict?: boolean;
        };
      };
  promptCacheKey?: string;
}

export interface ChatUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  estimated_cost?: number;
  prompt_tokens_details?: {
    cached_tokens: number;
  };
}

export interface StreamChatCompletionResult {
  content: string;
  reasoning: string;
  finishReason: string | null;
  usage: ChatUsage | null;
  requestId: string | null;
}

type MaybePromise = void | Promise<void>;

export interface StreamChatCompletionOptions {
  apiKey: string;
  model: string;
  messages: readonly ChatMessage[];
  settings?: Readonly<ChatSettings>;
  signal?: AbortSignal;
  onDelta: (text: string) => MaybePromise;
  onReasoning?: (text: string) => MaybePromise;
  onUsage?: (usage: ChatUsage) => MaybePromise;
}

export type DeepInfraErrorCode =
  | "invalid_request"
  | "authentication_error"
  | "insufficient_balance"
  | "rate_limit_exceeded"
  | "permission_denied"
  | "api_error"
  | "network_error"
  | "catalog_error"
  | "stream_parse_error";

export interface DeepInfraErrorObject {
  name: "DeepInfraError";
  code: DeepInfraErrorCode;
  message: string;
  status: number | null;
  retryAfter: number | null;
  requestId: string | null;
}

export class DeepInfraError extends Error {
  readonly code: DeepInfraErrorCode;
  readonly status: number | null;
  readonly retryAfter: number | null;
  readonly requestId: string | null;

  constructor(
    code: DeepInfraErrorCode,
    message: string,
    options: {
      status?: number | null;
      retryAfter?: number | null;
      requestId?: string | null;
    } = {},
  ) {
    super(message);
    this.name = "DeepInfraError";
    this.code = code;
    this.status = options.status ?? null;
    this.retryAfter = options.retryAfter ?? null;
    this.requestId = options.requestId ?? null;
  }

  toJSON(): DeepInfraErrorObject {
    return {
      name: "DeepInfraError",
      code: this.code,
      message: this.message,
      status: this.status,
      retryAfter: this.retryAfter,
      requestId: this.requestId,
    };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function optionalText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeTable(value: unknown): RawPricingTable | null {
  if (!isRecord(value) || !Array.isArray(value.columns) || !Array.isArray(value.rows)) {
    return null;
  }

  const columns = value.columns.filter(
    (column): column is string => typeof column === "string",
  );
  const rows = value.rows
    .filter((row): row is unknown[] => Array.isArray(row))
    .map((row) =>
      row.map((cell) =>
        typeof cell === "string" || typeof cell === "number" || cell === null
          ? cell
          : String(cell),
      ),
    );
  return { columns, rows };
}

function normalizeRawPricing(value: unknown): RawCatalogPricing | null {
  if (!isRecord(value)) return null;

  const result: Record<string, unknown> = {
    type: text(value.type, "unknown"),
    short: optionalText(value.short),
    full: optionalText(value.full),
    table: normalizeTable(value.table),
  };

  const numericFields = [
    "cents_per_input_token",
    "cents_per_output_token",
    "rate_per_input_token_cached",
    "rate_per_input_token_cache_write",
    "rate_per_service_tier_priority",
    "rate_per_service_tier_flex",
    "cents_per_input_sec",
    "cents_per_input_chars",
    "cents_per_image_unit",
    "default_width",
    "default_height",
    "default_iterations",
    "default_price_cents",
    "cents_per_output_sec",
    "cents_per_sec",
    "cents_per_frame_unit",
  ] as const;

  for (const field of numericFields) {
    result[field] = finiteNumber(value[field]);
  }
  result.usage_from_cost =
    typeof value.usage_from_cost === "boolean" ? value.usage_from_cost : null;

  return result as unknown as RawCatalogPricing;
}

function pricingRecord(
  value:
    | RawCatalogPricing
    | RawCatalogModel
    | NormalizedPricing
    | NormalizedModel
    | null
    | undefined,
): Record<string, unknown> | null {
  if (!value || !isRecord(value)) return null;
  if ("inputUsdPerMillion" in value && "raw" in value) {
    return isRecord(value.raw) ? value.raw : null;
  }
  if ("model_name" in value) {
    return isRecord(value.pricing) ? value.pricing : null;
  }
  if ("id" in value && isRecord(value.pricing)) {
    const normalized = value.pricing as unknown as Record<string, unknown>;
    return isRecord(normalized.raw) ? normalized.raw : null;
  }
  return value;
}

export function providerOf(modelId: string): string {
  const trimmed = modelId.trim();
  const slash = trimmed.indexOf("/");
  return slash > 0 ? trimmed.slice(0, slash) : "Unknown";
}

export function friendlyModelName(modelId: string): string {
  const leaf = modelId.trim().split("/").filter(Boolean).at(-1) ?? modelId;
  const words = leaf.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  const known: Record<string, string> = {
    ai: "AI",
    api: "API",
    coder: "Coder",
    deepseek: "DeepSeek",
    gemma: "Gemma",
    instruct: "Instruct",
    llama: "Llama",
    llm: "LLM",
    mistral: "Mistral",
    qwen: "Qwen",
    vl: "VL",
  };

  return words
    .split(" ")
    .map((word) => {
      const lower = word.toLowerCase();
      if (known[lower]) return known[lower];
      if (/^\d+(?:\.\d+)?[a-z]$/i.test(word)) {
        return word.slice(0, -1) + word.slice(-1).toUpperCase();
      }
      return word;
    })
    .join(" ");
}

export function isChatCapable(
  model: RawCatalogModel | NormalizedModel,
): boolean {
  if ("chatCapable" in model && typeof model.chatCapable === "boolean") {
    return model.chatCapable;
  }
  const rawType = "reported_type" in model ? model.reported_type : model.reportedType;
  const fallbackType = model.type;
  const kinds = `${rawType} ${fallbackType}`.toLowerCase();
  return [
    "text-generation",
    "text2text-generation",
    "conversational",
    "chat",
    "llm",
  ].some((kind) => kinds.includes(kind));
}

export function usdPerMillion(
  pricing:
    | RawCatalogPricing
    | RawCatalogModel
    | NormalizedPricing
    | NormalizedModel
    | null
    | undefined,
  direction: "input" | "output",
): number | null {
  if (
    pricing &&
    isRecord(pricing) &&
    "inputUsdPerMillion" in pricing &&
    "outputUsdPerMillion" in pricing
  ) {
    return finiteNumber(
      direction === "input"
        ? pricing.inputUsdPerMillion
        : pricing.outputUsdPerMillion,
    );
  }
  const record = pricingRecord(pricing);
  if (!record) return null;
  const cents = finiteNumber(
    record[
      direction === "input"
        ? "cents_per_input_token"
        : "cents_per_output_token"
    ],
  );
  return cents === null ? null : cents * 10_000;
}

function formatUsd(value: number): string {
  const digits = value >= 1 ? 2 : value >= 0.01 ? 4 : 6;
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  });
}

export function pricingLabel(
  pricing:
    | RawCatalogPricing
    | RawCatalogModel
    | NormalizedPricing
    | NormalizedModel
    | null
    | undefined,
): string {
  const record = pricingRecord(pricing);
  if (!record) return "Pricing unavailable";

  const input = usdPerMillion(pricing, "input");
  const output = usdPerMillion(pricing, "output");
  if (input !== null && output !== null) {
    return `$${formatUsd(input)} in · $${formatUsd(output)} out / 1M`;
  }
  if (input !== null) return `$${formatUsd(input)} / 1M input tokens`;

  const short = optionalText(record.short);
  if (short) return short;

  const kind = text(record.type, "unknown");
  const units: Array<[string, string, number]> = [
    ["cents_per_input_sec", "input second", 100],
    ["cents_per_output_sec", "output second", 100],
    ["cents_per_sec", "second", 100],
    ["cents_per_image_unit", "image unit", 100],
    ["cents_per_frame_unit", "frame unit", 100],
    ["cents_per_input_chars", "1K characters", 0.1],
  ];
  for (const [field, unit, divisor] of units) {
    const cents = finiteNumber(record[field]);
    if (cents !== null) {
      return `$${formatUsd(cents / divisor)} / ${unit}`;
    }
  }
  return kind === "unknown" ? "Pricing unavailable" : kind.replaceAll("_", " ");
}

function normalizeModel(value: unknown): NormalizedModel | null {
  if (!isRecord(value)) return null;
  const id = text(value.model_name).trim();
  if (!id) return null;

  const rawPricing = normalizeRawPricing(value.pricing);
  const tags = Array.isArray(value.tags)
    ? [...new Set(value.tags.filter((tag): tag is string => typeof tag === "string"))]
    : [];
  const raw: RawCatalogModel = {
    model_name: id,
    type: text(value.type, "unknown"),
    reported_type: text(value.reported_type, text(value.type, "unknown")),
    pricing: rawPricing,
    description: text(value.description),
    cover_img_url: text(value.cover_img_url),
    tags,
    max_tokens: finiteNumber(value.max_tokens),
    replaced_by: optionalText(value.replaced_by),
    deprecated: finiteNumber(value.deprecated),
    quantization: optionalText(value.quantization),
    mmlu: finiteNumber(value.mmlu),
    expected: optionalText(value.expected),
    create_ts: optionalText(value.create_ts),
    private: finiteNumber(value.private) ?? 0,
    is_partner: value.is_partner === true,
  };

  const inputUsd = usdPerMillion(rawPricing, "input");
  const cachedRate =
    rawPricing && isRecord(rawPricing)
      ? finiteNumber(rawPricing.rate_per_input_token_cached)
      : null;
  const normalizedPricing: NormalizedPricing = {
    type: rawPricing?.type ?? "unknown",
    label: pricingLabel(rawPricing),
    inputUsdPerMillion: inputUsd,
    outputUsdPerMillion: usdPerMillion(rawPricing, "output"),
    cachedInputUsdPerMillion:
      inputUsd !== null && cachedRate !== null ? inputUsd * cachedRate : null,
    short: rawPricing?.short ?? null,
    full: rawPricing?.full ?? null,
    table: rawPricing?.table ?? null,
    raw: rawPricing,
  };
  const normalized: NormalizedModel = {
    id,
    name: friendlyModelName(id),
    provider: providerOf(id),
    type: raw.type,
    reportedType: raw.reported_type,
    description: raw.description,
    tags,
    contextTokens: raw.max_tokens,
    deprecatedAt: raw.deprecated,
    replacedBy: raw.replaced_by,
    quantization: raw.quantization,
    partner: raw.is_partner,
    pricing: normalizedPricing,
    raw,
    coverImageUrl: raw.cover_img_url || null,
    mmlu: raw.mmlu,
    createdAt: raw.create_ts,
    private: raw.private !== 0,
    chatCapable: false,
  };
  normalized.chatCapable = isChatCapable(raw);
  return normalized;
}

function requestIdFrom(response: Response): string | null {
  return (
    response.headers.get("x-request-id") ??
    response.headers.get("x-deepinfra-request-id") ??
    response.headers.get("request-id") ??
    null
  );
}

function retryAfterFrom(response: Response): number | null {
  const value = response.headers.get("retry-after");
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds);
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, Math.ceil((date - Date.now()) / 1000)) : null;
}

function sanitizedMessage(value: string, apiKey: string): string {
  let result = value;
  for (const secret of [apiKey, apiKey.trim()]) {
    if (secret) result = result.split(secret).join("[redacted]");
  }
  return result
    .replace(/Bearer\s+[^\s"',}]+/gi, "Bearer [redacted]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
}

function serverDetail(body: string, apiKey: string): string {
  let detail = body;
  try {
    const parsed: unknown = JSON.parse(body);
    if (isRecord(parsed)) {
      if (typeof parsed.error === "string") detail = parsed.error;
      else if (isRecord(parsed.error) && typeof parsed.error.message === "string") {
        detail = parsed.error.message;
      } else if (typeof parsed.message === "string") detail = parsed.message;
      else if (typeof parsed.detail === "string") detail = parsed.detail;
      else if (Array.isArray(parsed.detail)) {
        detail = parsed.detail
          .map((item) =>
            isRecord(item) && typeof item.msg === "string" ? item.msg : "",
          )
          .filter(Boolean)
          .join("; ");
      }
    }
  } catch {
    // Non-JSON error bodies are still useful after sanitization.
  }
  return sanitizedMessage(detail, apiKey);
}

async function responseError(
  response: Response,
  apiKey: string,
): Promise<DeepInfraError> {
  let body = "";
  try {
    body = await response.text();
  } catch {
    // Keep the status-specific fallback below.
  }
  const detail = serverDetail(body, apiKey);
  const common = {
    status: response.status,
    retryAfter: retryAfterFrom(response),
    requestId: requestIdFrom(response),
  };

  if (response.status === 400) {
    return new DeepInfraError(
      "invalid_request",
      detail ? `DeepInfra rejected the request: ${detail}` : "DeepInfra rejected the request.",
      common,
    );
  }
  if (response.status === 401) {
    return new DeepInfraError(
      "authentication_error",
      "DeepInfra rejected the API key. Check that it is valid and active.",
      common,
    );
  }
  if (response.status === 402) {
    return new DeepInfraError(
      "insufficient_balance",
      "The DeepInfra account has insufficient credit for this request.",
      common,
    );
  }
  if (response.status === 429) {
    return new DeepInfraError(
      "rate_limit_exceeded",
      "DeepInfra is rate limiting requests. Wait briefly and try again.",
      common,
    );
  }
  if (response.status === 403) {
    return new DeepInfraError(
      "permission_denied",
      "This DeepInfra API key is not permitted to use the requested resource.",
      common,
    );
  }
  return new DeepInfraError(
    "api_error",
    detail
      ? `DeepInfra returned an error: ${detail}`
      : `DeepInfra returned HTTP ${response.status}.`,
    common,
  );
}

export async function fetchModelCatalog(
  signal?: AbortSignal,
): Promise<NormalizedModel[]> {
  let response: Response;
  try {
    response = await fetch(MODELS_URL, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new DeepInfraError(
      "network_error",
      "Could not reach the DeepInfra model catalog.",
    );
  }
  if (!response.ok) throw await responseError(response, "");

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new DeepInfraError(
      "catalog_error",
      "DeepInfra returned an unreadable model catalog.",
      { status: response.status, requestId: requestIdFrom(response) },
    );
  }

  const entries = Array.isArray(payload)
    ? payload
    : isRecord(payload) && Array.isArray(payload.models)
      ? payload.models
      : isRecord(payload) && Array.isArray(payload.data)
        ? payload.data
        : null;
  if (!entries) {
    throw new DeepInfraError(
      "catalog_error",
      "DeepInfra returned an unexpected model catalog shape.",
      { status: response.status, requestId: requestIdFrom(response) },
    );
  }
  return entries
    .map(normalizeModel)
    .filter((model): model is NormalizedModel => model !== null);
}

function normalizeUsage(value: unknown): ChatUsage | null {
  if (!isRecord(value)) return null;
  const prompt = finiteNumber(value.prompt_tokens);
  const completion = finiteNumber(value.completion_tokens);
  const total = finiteNumber(value.total_tokens);
  if (prompt === null && completion === null && total === null) return null;

  const usage: ChatUsage = {
    prompt_tokens: prompt ?? 0,
    completion_tokens: completion ?? 0,
    total_tokens: total ?? (prompt ?? 0) + (completion ?? 0),
  };
  const cost = finiteNumber(value.estimated_cost);
  if (cost !== null) usage.estimated_cost = cost;
  if (isRecord(value.prompt_tokens_details)) {
    const cached = finiteNumber(value.prompt_tokens_details.cached_tokens);
    if (cached !== null) {
      usage.prompt_tokens_details = { cached_tokens: cached };
    }
  }
  return usage;
}

function contentText(value: unknown): string {
  if (typeof value === "string") return value;
  if (isRecord(value)) {
    for (const key of ["text", "content", "output_text", "output", "value"] as const) {
      const candidate = value[key];
      if (candidate !== undefined) {
        const parsed = contentText(candidate);
        if (parsed) return parsed;
      }
    }
    if (Array.isArray(value.parts)) return contentText(value.parts);
    return "";
  }
  if (!Array.isArray(value)) return "";
  return value
    .map((part) => contentText(part))
    .join("");
}

class SseParser {
  private buffer = "";
  private data: string[] = [];

  push(chunk: string, flush = false): string[] {
    this.buffer += chunk;
    const events: string[] = [];
    while (true) {
      let index = -1;
      for (let i = 0; i < this.buffer.length; i += 1) {
        if (this.buffer[i] === "\n" || this.buffer[i] === "\r") {
          index = i;
          break;
        }
      }
      if (index < 0) break;
      if (
        this.buffer[index] === "\r" &&
        index === this.buffer.length - 1 &&
        !flush
      ) {
        break;
      }
      const line = this.buffer.slice(0, index);
      const newlineLength =
        this.buffer[index] === "\r" && this.buffer[index + 1] === "\n" ? 2 : 1;
      this.buffer = this.buffer.slice(index + newlineLength);
      this.acceptLine(line, events);
    }

    if (flush) {
      if (this.buffer) this.acceptLine(this.buffer, events);
      this.buffer = "";
      this.emit(events);
    }
    return events;
  }

  private acceptLine(line: string, events: string[]): void {
    if (line === "") {
      this.emit(events);
      return;
    }
    if (line.startsWith(":")) return;
    const colon = line.indexOf(":");
    const field = colon < 0 ? line : line.slice(0, colon);
    let value = colon < 0 ? "" : line.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    if (field === "data") this.data.push(value);
  }

  private emit(events: string[]): void {
    if (this.data.length) events.push(this.data.join("\n"));
    this.data = [];
  }
}

function requestBody(
  model: string,
  messages: readonly ChatMessage[],
  settings: Readonly<ChatSettings>,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model,
    messages,
    stream: true,
    stream_options: { include_usage: true },
  };
  const pairs: Array<[keyof ChatSettings, string]> = [
    ["temperature", "temperature"],
    ["topP", "top_p"],
    ["maxTokens", "max_tokens"],
    ["minP", "min_p"],
    ["topK", "top_k"],
    ["presencePenalty", "presence_penalty"],
    ["frequencyPenalty", "frequency_penalty"],
    ["repetitionPenalty", "repetition_penalty"],
    ["seed", "seed"],
    ["stop", "stop"],
    ["serviceTier", "service_tier"],
    ["reasoningEffort", "reasoning_effort"],
    ["reasoning", "reasoning"],
    ["responseFormat", "response_format"],
    ["promptCacheKey", "prompt_cache_key"],
  ];
  for (const [source, target] of pairs) {
    if (settings[source] !== undefined) body[target] = settings[source];
  }
  return body;
}

export async function streamChatCompletion({
  apiKey,
  model,
  messages,
  settings = {},
  signal,
  onDelta,
  onReasoning,
  onUsage,
}: StreamChatCompletionOptions): Promise<StreamChatCompletionResult> {
  const safeKey = apiKey.trim();
  const safeModel = model.trim();
  if (!safeKey) {
    throw new DeepInfraError(
      "authentication_error",
      "Enter a DeepInfra API key before sending a request.",
      { status: 401 },
    );
  }
  if (!safeModel || messages.length === 0) {
    throw new DeepInfraError(
      "invalid_request",
      "A model and at least one message are required.",
      { status: 400 },
    );
  }

  let response: Response;
  try {
    response = await fetch(CHAT_COMPLETIONS_URL, {
      method: "POST",
      headers: {
        Accept: "text/event-stream",
        Authorization: `Bearer ${safeKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody(safeModel, messages, settings)),
      signal,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new DeepInfraError(
      "network_error",
      "Could not reach DeepInfra. Check the connection and try again.",
    );
  }
  if (!response.ok) throw await responseError(response, safeKey);

  let finishReason: string | null = null;
  let usage: ChatUsage | null = null;
  let requestId = requestIdFrom(response);
  let content = "";
  let reasoningContent = "";

  const consume = async (payload: string): Promise<boolean> => {
    const trimmed = payload.trim();
    if (!trimmed) return false;
    if (trimmed === "[DONE]") return true;

    let event: unknown;
    try {
      event = JSON.parse(trimmed);
    } catch {
      throw new DeepInfraError(
        "stream_parse_error",
        "DeepInfra returned a malformed streaming event.",
        { status: response.status, requestId },
      );
    }
    if (!isRecord(event)) return false;
    if (event.error !== undefined) {
      const detail = serverDetail(JSON.stringify(event), safeKey);
      throw new DeepInfraError(
        "api_error",
        detail ? `DeepInfra stream error: ${detail}` : "DeepInfra stream error.",
        { status: response.status, requestId },
      );
    }

    if (!requestId && typeof event.id === "string") requestId = event.id;
    const nextUsage = normalizeUsage(event.usage);
    if (nextUsage) {
      usage = nextUsage;
      if (onUsage) await onUsage(nextUsage);
    }
    const choice =
      Array.isArray(event.choices) && isRecord(event.choices[0])
        ? event.choices[0]
        : null;
    if (!choice) return false;
    if (typeof choice.finish_reason === "string") {
      finishReason = choice.finish_reason;
    }
    const delta = isRecord(choice.delta)
      ? choice.delta
      : isRecord(choice.message)
        ? choice.message
        : choice;
    const output = contentText(
      delta.content ??
        delta.output_text ??
        delta.text ??
        choice.text ??
        choice.content ??
        choice.output_text ??
        event.output_text ??
        event.content ??
        event.output,
    );
    if (output) {
      content += output;
      await onDelta(output);
    }
    const reasoning = contentText(
      delta.reasoning_content ??
        delta.reasoning ??
        delta.thinking ??
        choice.reasoning_content ??
        choice.reasoning,
    );
    if (reasoning) {
      reasoningContent += reasoning;
      if (onReasoning) await onReasoning(reasoning);
    }
    return false;
  };

  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (contentType.includes("application/json")) {
    const payload = await response.text();
    await consume(payload);
    return { content, reasoning: reasoningContent, finishReason, usage, requestId };
  }

  if (!response.body) {
    throw new DeepInfraError(
      "stream_parse_error",
      "DeepInfra returned no response stream.",
      { status: response.status, requestId },
    );
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const parser = new SseParser();
  let doneEvent = false;
  while (!doneEvent) {
    const next = await reader.read();
    const decoded = decoder.decode(next.value, { stream: !next.done });
    for (const event of parser.push(decoded, next.done)) {
      if (await consume(event)) {
        doneEvent = true;
        break;
      }
    }
    if (next.done) break;
  }

  if (doneEvent) {
    try {
      await reader.cancel();
    } catch {
      // The server may have already closed the stream.
    }
  }
  return { content, reasoning: reasoningContent, finishReason, usage, requestId };
}
