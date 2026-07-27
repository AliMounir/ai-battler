import assert from "node:assert/strict";
import test from "node:test";

import { streamChatCompletion } from "../app/lib/deepinfra.ts";

test("reads reasoning, structured content, usage, and full-message fallbacks", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const reasoning = [];
  const output = [];
  globalThis.fetch = async (_url, options) => {
  const body = JSON.parse(options.body);
  assert.equal(body.stream, true);
  assert.deepEqual(body.stream_options, { include_usage: true });
  assert.equal(body.service_tier, "priority");

    return new Response(
      [
        'data: {"id":"request-1","choices":[{"delta":{"reasoning_content":{"text":"Think. "}}}]}',
        "",
        'data: {"choices":[{"delta":{"content":[{"type":"text","text":"Answer."}]}}]}',
        "",
        'data: {"choices":[],"usage":{"prompt_tokens":7,"completion_tokens":3,"total_tokens":10,"estimated_cost":0.0002}}',
        "",
        "data: [DONE]",
        "",
      ].join("\n"),
      {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      },
    );
  };

  const streamed = await streamChatCompletion({
    apiKey: "test-key",
    model: "provider/model",
    messages: [{ role: "user", content: "Hello" }],
    settings: { serviceTier: "priority" },
    onDelta: (value) => output.push(value),
    onReasoning: (value) => reasoning.push(value),
  });

  assert.equal(output.join(""), "Answer.");
  assert.equal(reasoning.join(""), "Think. ");
  assert.equal(streamed.usage?.completion_tokens, 3);
  assert.equal(streamed.usage?.estimated_cost, 0.0002);
  assert.equal(streamed.requestId, "request-1");

  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: { text: "Non-streaming fallback." },
            },
            finish_reason: "stop",
          },
        ],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );

  const fallbackOutput = [];
  const fallback = await streamChatCompletion({
    apiKey: "test-key",
    model: "provider/model",
    messages: [{ role: "user", content: "Hello again" }],
    onDelta: (value) => fallbackOutput.push(value),
  });

  assert.equal(fallbackOutput.join(""), "Non-streaming fallback.");
  assert.equal(fallback.finishReason, "stop");

  globalThis.fetch = async () =>
    new Response(
      [
        'data: {"choices":[{"delta":{"content":{"type":"output_text","text":{"value":"Nested "}}}}]}',
        "",
        'data: {"choices":[{"message":{"content":{"output_text":"response."}},"finish_reason":"stop"}]}',
        "",
        "data: [DONE]",
        "",
      ].join("\n"),
      { status: 200, headers: { "content-type": "text/event-stream" } },
    );

  const nestedOutput = [];
  const nested = await streamChatCompletion({
    apiKey: "test-key",
    model: "provider/model",
    messages: [{ role: "user", content: "One more" }],
    onDelta: (value) => nestedOutput.push(value),
  });

  assert.equal(nestedOutput.join(""), "Nested response.");
  assert.equal(nested.content, "Nested response.");

  globalThis.fetch = async () =>
    new Response(
      ['data: {"choices":[{"text":"Direct choice payload.","finish_reason":"stop"}]}', "", "data: [DONE]", ""].join("\n"),
      { status: 200, headers: { "content-type": "text/event-stream" } },
    );

  const direct = await streamChatCompletion({
    apiKey: "test-key",
    model: "provider/model",
    messages: [{ role: "user", content: "Final fallback" }],
    onDelta: () => {},
  });

  assert.equal(direct.content, "Direct choice payload.");
});
