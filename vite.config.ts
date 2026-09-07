// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  vite: {
    server: {
      watch: {
        ignored: ["**/document-ai-backend/.venv/**"],
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes("node_modules")) {
              return undefined;
            }

            if (/[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) {
              return "vendor-react";
            }

            if (id.includes("@tanstack")) {
              return "vendor-tanstack";
            }

            if (
              id.includes("@supabase") ||
              id.includes("@postgrest") ||
              id.includes("@gotrue") ||
              id.includes("@realtime") ||
              id.includes("@storage")
            ) {
              return "vendor-supabase";
            }

            if (
              id.includes("recharts") ||
              id.includes("d3-") ||
              id.includes("victory-vendor") ||
              id.includes("@visx")
            ) {
              return "vendor-charts";
            }

            if (
              id.includes("@react-pdf") ||
              id.includes("pdfkit") ||
              id.includes("fontkit") ||
              id.includes("linebreak") ||
              id.includes("unicode-")
            ) {
              return "vendor-pdf";
            }

            if (id.includes("pdfjs-dist") || id.includes("tesseract.js")) {
              return "vendor-document-ai";
            }

            return undefined;
          },
        },
      },
    },
    ssr: {
      // @visx packages (alpha prerelease) ship extensionless ESM relative imports,
      // which fail under Node's native ESM resolver during SSR unless Vite processes them.
      noExternal: [/^@visx\//],
    },
  },
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});
