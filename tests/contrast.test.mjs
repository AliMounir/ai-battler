import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

function luminance(hex) {
  const channels = [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16) / 255);
  const [red, green, blue] = channels.map((channel) =>
    channel <= 0.03928
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4,
  );
  return red * 0.2126 + green * 0.7152 + blue * 0.0722;
}

function contrast(foreground, background) {
  const lighter = Math.max(luminance(foreground), luminance(background));
  const darker = Math.min(luminance(foreground), luminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

test("dark theme text and action pairs meet WCAG AA contrast", async () => {
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  const variables = Object.fromEntries(
    [...css.matchAll(/--([\w-]+):\s*(#[\da-f]{6})/gi)].map((match) => [
      match[1],
      match[2],
    ]),
  );

  const pairs = [
    ["ink", "paper"],
    ["ink-soft", "surface"],
    ["ink-faint", "paper"],
    ["on-action", "action"],
  ];

  for (const [foreground, background] of pairs) {
    assert.ok(
      contrast(variables[foreground], variables[background]) >= 4.5,
      `${foreground} on ${background} should meet 4.5:1`,
    );
  }

  assert.match(css, /\.empty-runs button,[\s\S]*?color:\s*var\(--on-action\)/);
  assert.match(css, /\.cost-calculator input,[\s\S]*?background:\s*var\(--paper-deep\)/);
});
