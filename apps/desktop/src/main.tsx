import React from "react"
import ReactDOM from "react-dom/client"
import "@workspace/ui/globals.css"
import { invoke } from "@tauri-apps/api/core"
import { openUrl } from "@tauri-apps/plugin-opener"
import { App } from "./App"
import { applyCachedAppearanceSnapshot } from "./lib/appearance"
import { featureBuildInfo } from "./lib/features"

const buildInfo = featureBuildInfo()
document.documentElement.dataset.theme = buildInfo.theme
document.title = buildInfo.appName
applyCachedAppearanceSnapshot()

function disableMenu() {
  document.addEventListener(
    "contextmenu",
    (event) => {
      event.preventDefault()
      return false
    },
    { capture: true }
  )
}

function enableDevtoolsToggle() {
  document.addEventListener("keydown", (event) => {
    if (event.key === "F12" && !event.repeat) {
      event.preventDefault()
      void invoke("toggle_devtools")
    }
  })
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
enableDevtoolsToggle()
openExternalLinksInBrowser()

ReactDOM.createRoot(documentRoot).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
