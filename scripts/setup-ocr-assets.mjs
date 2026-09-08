// Self-hosts the Tesseract.js worker/core/language assets under public/tesseract/
// so OCR never depends on a third-party CDN at runtime. Without this, the app's
// CSP (script-src/connect-src 'self' + a small allowlist -- see
// src/lib/securityHeaders.server.ts) blocks every request Tesseract.js makes by
// default to cdn.jsdelivr.net, so document OCR silently fails end-to-end
// (0% confidence, no extracted text, and everything downstream -- including the
// LayoutXLM call -- never runs because it depends on OCR output).
//
// Idempotent: skips any file that's already present. Safe to run on every
// `npm install` / `npm run dev`.

import { createHash } from "node:crypto";
import { copyFile, mkdir, stat } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline } from "node:stream/promises";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(scriptDir, "..");
const targetDir = join(projectRoot, "public", "tesseract");
const coreDir = join(targetDir, "core");
const langDir = join(targetDir, "lang-data");

const CORE_VARIANTS = [
  "tesseract-core-lstm.wasm.js",
  "tesseract-core-lstm.wasm",
  "tesseract-core-simd-lstm.wasm.js",
  "tesseract-core-simd-lstm.wasm",
  "tesseract-core-relaxedsimd-lstm.wasm.js",
  "tesseract-core-relaxedsimd-lstm.wasm",
];

// tesseract.js's default lstmOnly=true recognize() calls pull the
// "4.0.0_best_int" (quantized, LSTM-only) language packs -- mirror that exact
// path so the re-hosted files match what the worker actually requests.
const LANGS = ["ron", "eng"];
const LANG_DATA_VERSION = "4.0.0_best_int";
const LANG_DATA_BASE = `https://cdn.jsdelivr.net/npm/@tesseract.js-data`;

// Pinned so a compromised/mutated CDN response can't silently swap in
// different model weights without this script failing loudly.
const LANG_DATA_SHA256 = {
  ron: "3c2f550b6369f43254adf637cfe1088c7b6faff3d0382555219315112a24582a",
  eng: "45b4cb346724ac1774f1c36f42f182b887bcdb28ebe63e6fff90ac41f3fcff91",
};

async function fileExists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function ensureCopied(src, dest) {
  if (await fileExists(dest)) return;
  if (!(await fileExists(src))) {
    throw new Error(`Missing source file (is tesseract.js-core installed?): ${src}`);
  }
  await copyFile(src, dest);
  console.log(`[ocr-assets] copied ${dest.replace(projectRoot + "/", "")}`);
}

async function sha256(path) {
  const { createReadStream } = await import("node:fs");
  const hash = createHash("sha256");
  await pipeline(createReadStream(path), hash);
  return hash.digest("hex");
}

async function ensureDownloaded(lang) {
  const dest = join(langDir, `${lang}.traineddata.gz`);
  if (await fileExists(dest)) return;

  const url = `${LANG_DATA_BASE}/${lang}/${LANG_DATA_VERSION}/${lang}.traineddata.gz`;
  console.log(`[ocr-assets] downloading ${url}`);
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`Failed to download ${url}: HTTP ${response.status}`);
  }
  const tmpDest = `${dest}.tmp`;
  await pipeline(response.body, createWriteStream(tmpDest));

  const expected = LANG_DATA_SHA256[lang];
  const actual = await sha256(tmpDest);
  if (expected && expected !== actual) {
    throw new Error(
      `Checksum mismatch for ${lang}.traineddata.gz: expected ${expected}, got ${actual}`,
    );
  }
  if (!expected) {
    console.log(`[ocr-assets] ${lang}.traineddata.gz sha256=${actual} (no pin recorded yet)`);
  }

  await copyFile(tmpDest, dest);
  const { unlink } = await import("node:fs/promises");
  await unlink(tmpDest);
  console.log(`[ocr-assets] downloaded ${dest.replace(projectRoot + "/", "")}`);
}

async function main() {
  await mkdir(coreDir, { recursive: true });
  await mkdir(langDir, { recursive: true });

  const workerSrc = join(projectRoot, "node_modules", "tesseract.js", "dist", "worker.min.js");
  await ensureCopied(workerSrc, join(targetDir, "worker.min.js"));

  const coreModuleDir = join(projectRoot, "node_modules", "tesseract.js-core");
  for (const file of CORE_VARIANTS) {
    await ensureCopied(join(coreModuleDir, file), join(coreDir, file));
  }

  for (const lang of LANGS) {
    await ensureDownloaded(lang);
  }

  console.log("[ocr-assets] ready");
}

main().catch((error) => {
  console.error("[ocr-assets] setup failed:", error.message);
  console.error(
    "[ocr-assets] Document AI OCR will not work until this succeeds. Re-run `npm run setup:ocr-assets` once network access to cdn.jsdelivr.net is available, or place the files manually under public/tesseract/.",
  );
  // Never fail `npm install` over this -- OCR assets are recoverable any
  // time via a re-run, and a hard install failure (e.g. no network in a
  // sandboxed CI image) would be strictly worse than a loud warning here.
});
