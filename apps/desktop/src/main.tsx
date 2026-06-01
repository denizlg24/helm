import React from "react"
import ReactDOM from "react-dom/client"
import "@workspace/ui/globals.css"
import { openUrl } from "@tauri-apps/plugin-opener"
import { App } from "./App"
import { featureBuildInfo } from "./lib/features"

// Temporary production diagnostics: paint uncaught errors into the page so a
// white screen reveals its cause without devtools. Remove once resolved.
function paintFatal(label: string, detail: unknown) {
  const message =
    detail instanceof Error
      ? `${detail.name}: ${detail.message}\n${detail.stack ?? ""}`
      : String(detail)
  const pre = document.createElement("pre")
  pre.style.cssText =
    "position:fixed;inset:0;margin:0;padding:16px;background:#1a0000;color:#ff8080;font:12px/1.4 monospace;white-space:pre-wrap;overflow:auto;z-index:2147483647"
  pre.textContent = `[${label}]\n${message}`
  document.body.appendChild(pre)
}
window.addEventListener("error", (e) =>
  paintFatal("error", e.error ?? e.message)
)
window.addEventListener("unhandledrejection", (e) =>
  paintFatal("unhandledrejection", e.reason)
)

const buildInfo = featureBuildInfo()
document.documentElement.dataset.theme = buildInfo.theme
document.title = buildInfo.appName

function disableMenu() {
  if (import.meta.env.DEV) {
    return
  }

  document.addEventListener(
    "contextmenu",
    (event) => {
      event.preventDefault()
      return false
    },
    { capture: true }
  )
}

function openExternalLinksInBrowser() {
  if (import.meta.env.DEV) {
    return
  }

  document.addEventListener(
    "click",
    (event) => {
      if (event.defaultPrevented) {
        return
      }

      const target = event.target
      if (!(target instanceof Element)) {
        return
      }

      const anchor = target.closest("a[href]")
      if (!(anchor instanceof HTMLAnchorElement)) {
        return
      }

      const url = new URL(anchor.href)
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        return
      }

      event.preventDefault()
      void openUrl(url.toString())
    },
    { capture: true }
  )
}

const documentRoot = document.getElementById("root")

if (!documentRoot) {
  throw new Error("Root element not found")
}

disableMenu()
openExternalLinksInBrowser()

ReactDOM.createRoot(documentRoot).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
