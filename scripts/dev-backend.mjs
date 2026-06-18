import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { networkInterfaces } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(scriptDir, "..");
const backendDir = join(projectRoot, "document-ai-backend");
const venvPython = join(backendDir, ".venv", "bin", "python");
const host = "0.0.0.0";
const port = "8000";
const healthUrl = `http://127.0.0.1:${port}/health`;

if (!existsSync(backendDir)) {
  console.error("[backend] Folder not found: document-ai-backend");
  process.exit(1);
}

const python = resolvePython();

if (!python) {
  console.error(
    "[backend] Python was not found. Create document-ai-backend/.venv or install python3/python.",
  );
  process.exit(1);
}

printBackendBanner(python);
verifyUvicorn(python);

let backend = null;
let isShuttingDown = false;
let readinessTimer = null;

const reloadEnabled = process.env.IMMAPP_BACKEND_RELOAD === "true";
startBackend({ reload: reloadEnabled });

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    isShuttingDown = true;

    if (readinessTimer) {
      clearTimeout(readinessTimer);
    }

    backend?.kill(signal);
  });
}

function printBackendBanner(selectedPython) {
  const pythonVersion = spawnSync(selectedPython, ["--version"], {
    cwd: backendDir,
    encoding: "utf8",
  });
  const versionOutput = `${pythonVersion.stdout}${pythonVersion.stderr}`.trim();

  console.log("[backend] Starting IMMapp Document AI backend");
  console.log(`[backend] Backend cwd: ${backendDir}`);
  console.log(`[backend] Using Python: ${selectedPython}`);
  console.log(`[backend] Python version: ${versionOutput || "unknown"}`);
  console.log(`[backend] Backend URL: http://localhost:${port}`);
  console.log("[backend] LAN backend URL is available through 0.0.0.0.");

  for (const url of getLanBackendUrls()) {
    console.log(`[backend] LAN URL: ${url}`);
  }
}

function verifyUvicorn(selectedPython) {
  const result = spawnSync(selectedPython, ["-m", "uvicorn", "--version"], {
    cwd: backendDir,
    encoding: "utf8",
  });

  if (result.status === 0) {
    const output = `${result.stdout}${result.stderr}`.trim();
    console.log(`[backend] Uvicorn check: ${output}`);
    return;
  }

  console.error("[backend] Uvicorn is not available for the selected Python interpreter.");
  console.error(`[backend] Selected Python: ${selectedPython}`);
  console.error("[backend] Install backend dependencies with:");
  console.error("[backend]   cd document-ai-backend");
  console.error("[backend]   python3 -m venv .venv");
  console.error("[backend]   source .venv/bin/activate");
  console.error("[backend]   pip install -r requirements.txt");
  console.error(`${result.stdout}${result.stderr}`.trim());
  process.exit(1);
}

function startBackend({ reload }) {
  const args = ["-m", "uvicorn", "main:app"];

  if (reload) {
    args.push("--reload");
    console.log("[backend] Uvicorn reload mode enabled.");
  } else {
    console.log(
      "[backend] Uvicorn reload mode disabled for stable model loading. Set IMMAPP_BACKEND_RELOAD=true to enable it.",
    );
  }

  args.push("--host", host, "--port", port);

  console.log(`[backend] Command: ${python} ${args.join(" ")}`);

  const startedAt = Date.now();

  backend = spawn(python, args, {
    cwd: backendDir,
    env: process.env,
    stdio: "inherit",
  });

  startReadinessProbe(startedAt);

  backend.on("error", (error) => {
    console.error("[backend] Failed to start IMMapp Document AI backend.");
    console.error(error);
    process.exit(1);
  });

  backend.on("exit", (code, signal) => {
    if (readinessTimer) {
      clearTimeout(readinessTimer);
    }

    if (isShuttingDown || signal) {
      console.log(`[backend] Backend stopped${signal ? ` by signal ${signal}` : ""}`);
      process.exit(0);
    }

    const failedQuickly = code !== 0 && Date.now() - startedAt < 8_000;

    if (reload && failedQuickly) {
      console.warn(
        "[backend] Reload watcher failed during startup. Retrying backend without --reload.",
      );
      startBackend({ reload: false });
      return;
    }

    console.error(`[backend] Backend exited with code ${code ?? "unknown"}.`);
    process.exit(code ?? 0);
  });
}

function startReadinessProbe(startedAt) {
  let attempt = 0;
  const maxAttempts = 30;

  async function probe() {
    attempt += 1;

    try {
      const response = await fetch(healthUrl);

      if (response.ok) {
        const data = await response.json();
        console.log(
          `[backend] Health check OK after ${Math.round((Date.now() - startedAt) / 1000)}s: ${JSON.stringify(data)}`,
        );
        return;
      }

      console.warn(`[backend] Health check returned HTTP ${response.status}.`);
    } catch (error) {
      if (attempt === 1 || attempt % 5 === 0) {
        const details = error instanceof Error ? error.message : "unknown error";
        console.warn(`[backend] Waiting for health check (${attempt}/${maxAttempts}): ${details}`);
      }
    }

    if (attempt < maxAttempts && !isShuttingDown) {
      readinessTimer = setTimeout(probe, 1_000);
      return;
    }

    console.warn(
      `[backend] Health check did not respond at ${healthUrl}. Check the backend logs above for startup errors.`,
    );
  }

  readinessTimer = setTimeout(probe, 1_000);
}

function getLanBackendUrls() {
  const urls = [];
  const interfaces = networkInterfaces();

  for (const addresses of Object.values(interfaces)) {
    for (const address of addresses ?? []) {
      if (address.family === "IPv4" && !address.internal) {
        urls.push(`http://${address.address}:${port}`);
      }
    }
  }

  return urls;
}

function resolvePython() {
  if (existsSync(venvPython)) {
    return venvPython;
  }

  for (const command of ["python3", "python"]) {
    const result = spawnSync(command, ["--version"], { stdio: "ignore" });

    if (!result.error) {
      return command;
    }
  }

  return null;
}
