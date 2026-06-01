import { fileURLToPath } from "node:url"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig, type Plugin } from "vite"

const host = process.env.TAURI_DEV_HOST

const resolveSrc = (path: string) =>
  fileURLToPath(new URL(path, import.meta.url))

// Tauri's `tauri://localhost` asset protocol (macOS/Linux) rejects the CORS
// requests that the `crossorigin` attribute triggers, blocking the entry
// script and leaving a white screen. Strip it from the built HTML.
const stripCrossorigin = (): Plugin => ({
  name: "strip-crossorigin",
  transformIndexHtml: (html) => html.replace(/\s+crossorigin/g, ""),
})

export default defineConfig({
  plugins: [react(), tailwindcss(), stripCrossorigin()],
  clearScreen: false,
  resolve: {
    alias: {
      "@workspace/api-client": resolveSrc(
        "../../packages/api-client/src/index.ts"
      ),
      "@workspace/types": resolveSrc("../../packages/types/src/index.ts"),
      "@workspace/module-registry": resolveSrc(
        "../../packages/module-registry/src/index.ts"
      ),
      "@workspace/auth/env": resolveSrc("../../packages/auth/src/env.ts"),
    },
  },
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: "ws", host, port: 1421 } : undefined,
    watch: { ignored: ["**/src-tauri/**"] },
  },
})
