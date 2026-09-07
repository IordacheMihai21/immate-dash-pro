#!/usr/bin/env node

import { gzipSync } from "node:zlib";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const assetsDirCandidates = [
  join(process.cwd(), ".output", "public", "assets"),
  join(process.cwd(), "dist", "client", "assets"),
];

const DEFAULT_MAX_JS_KB = 750;
const DEFAULT_MAX_CSS_KB = 350;
const DEFAULT_MAX_TOTAL_JS_KB = 6500;

const maxJsBytes = kbFromEnv("BUNDLE_BUDGET_MAX_JS_KB", DEFAULT_MAX_JS_KB);
const maxCssBytes = kbFromEnv("BUNDLE_BUDGET_MAX_CSS_KB", DEFAULT_MAX_CSS_KB);
const maxTotalJsBytes = kbFromEnv("BUNDLE_BUDGET_TOTAL_JS_KB", DEFAULT_MAX_TOTAL_JS_KB);

const largeAssetBudgets = [
  {
    pattern: /pdf\.worker-.*\.mjs$/,
    maxBytes: 2700 * 1024,
    reason: "PDF.js worker is loaded only by Document AI/PDF flows.",
  },
  {
    pattern: /pdfInvoiceGenerator-.*\.js$/,
    maxBytes: 1400 * 1024,
    reason: "Invoice PDF generation is route-level code, not baseline app shell.",
  },
  {
    pattern: /vendor-pdf-.*\.js$/,
    maxBytes: 1300 * 1024,
    reason: "React PDF/font engine is isolated away from the baseline app shell.",
  },
];

function kbFromEnv(name, fallbackKb) {
  const raw = process.env[name];
  if (!raw) return fallbackKb * 1024;

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive number of KB.`);
  }

  return parsed * 1024;
}

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = join(dir, entry.name);

    if (entry.isDirectory()) {
      return walk(absolutePath);
    }

    return [absolutePath];
  });
}

function formatKb(bytes) {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function getBudget(asset) {
  const exception = largeAssetBudgets.find(({ pattern }) => pattern.test(asset.name));
  if (exception) return exception;

  if (asset.ext === ".css") {
    return { maxBytes: maxCssBytes, reason: "CSS asset budget." };
  }

  return { maxBytes: maxJsBytes, reason: "Default JS chunk budget." };
}

const assetsDir = assetsDirCandidates.find((candidate) => {
  try {
    return statSync(candidate).isDirectory();
  } catch {
    return false;
  }
});

if (!assetsDir) {
  console.error(
    ".output/public/assets or dist/client/assets was not found. Run `npm run build` before bundle budget.",
  );
  process.exit(1);
}

const assets = walk(assetsDir)
  .filter((filePath) => /\.(js|mjs|css)$/.test(filePath))
  .map((filePath) => {
    const contents = readFileSync(filePath);
    const name = relative(assetsDir, filePath);
    const extMatch = name.match(/\.(js|mjs|css)$/);

    return {
      name,
      ext: extMatch ? `.${extMatch[1]}` : "",
      bytes: contents.byteLength,
      gzipBytes: gzipSync(contents).byteLength,
    };
  })
  .sort((a, b) => b.bytes - a.bytes);

const jsTotalBytes = assets
  .filter((asset) => asset.ext === ".js" || asset.ext === ".mjs")
  .reduce((sum, asset) => sum + asset.bytes, 0);

const failures = [];

for (const asset of assets) {
  const budget = getBudget(asset);
  if (asset.bytes > budget.maxBytes) {
    failures.push({ asset, budget });
  }
}

if (jsTotalBytes > maxTotalJsBytes) {
  failures.push({
    asset: { name: "Total JS/MJS", bytes: jsTotalBytes, gzipBytes: 0 },
    budget: { maxBytes: maxTotalJsBytes, reason: "Total client JS budget." },
  });
}

console.log("Bundle budget summary");
console.log(`Assets directory: ${relative(process.cwd(), assetsDir)}`);
console.log(`Total JS/MJS: ${formatKb(jsTotalBytes)} / ${formatKb(maxTotalJsBytes)}`);
console.log("Largest assets:");

for (const asset of assets.slice(0, 12)) {
  console.log(`- ${asset.name}: ${formatKb(asset.bytes)} raw, ${formatKb(asset.gzipBytes)} gzip`);
}

if (failures.length > 0) {
  console.error("\nBundle budget failed:");
  for (const { asset, budget } of failures) {
    console.error(
      `- ${asset.name}: ${formatKb(asset.bytes)} > ${formatKb(budget.maxBytes)} (${budget.reason})`,
    );
  }
  process.exit(1);
}

console.log("\nBundle budget passed.");
