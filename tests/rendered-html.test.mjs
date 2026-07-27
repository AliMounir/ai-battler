import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const templateRoot = new URL("../", import.meta.url);

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html", host: "localhost" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the Arena product shell and metadata", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Arena — Model selection, measured<\/title>/i);
  assert.match(html, /Compare models/);
  assert.match(html, /Connect API/);
  assert.match(html, /aria-label="Models"/);
  assert.match(html, /Responses and evidence/);
  assert.match(html, /Model metric overview/);
  assert.match(html, /How to read this:/);
  assert.match(html, /og\.png/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|react-loading-skeleton/i);
});

test("keeps credentials ephemeral and removes the disposable starter", async () => {
  const [page, layout, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(page, /setApiKey\(token\)/);
  assert.match(page, /Your credential is held in\s+memory only/);
  const storageWrites = [...page.matchAll(/localStorage\.setItem\(([^,]+)/g)];
  assert.ok(storageWrites.length > 0);
  assert.ok(storageWrites.every((match) => match[1].includes("STORAGE_KEY")));
  assert.doesNotMatch(page, /sessionStorage/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  assert.match(layout, /Arena — Model selection, measured/);
  assert.match(layout, /\/og\.png/);

  await assert.rejects(access(new URL("../app/_sites-preview", import.meta.url)));
  await access(new URL("public/og.png", templateRoot));
});

test("keeps completed comparisons traceable in the interface", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

  assert.match(page, /Run complete and saved in history/);
  assert.match(page, /setMaxTokensInput\(event\.target\.value\)/);
  assert.match(page, /PROMPT \{String\(activeRunNumber\)\.padStart\(2, "0"\)\}/);
  assert.ok(
    page.indexOf('className="response-grid"') < page.indexOf('aria-label="Model metric overview"'),
    "the response cards should appear before the overview table",
  );
  assert.match(page, /\["Quality", "quality"\]/);
  assert.match(page, /changeOverviewSort\(key\)/);
});
