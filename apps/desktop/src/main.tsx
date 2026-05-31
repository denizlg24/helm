import React from "react"
import ReactDOM from "react-dom/client"
import "@workspace/ui/globals.css"
import { openUrl } from "@tauri-apps/plugin-opener"
import { App } from "./App"
import { featureBuildInfo } from "./lib/features"

const buildInfo = featureBuildInfo()
document.documentElement.dataset.theme = buildInfo.theme
document.title = buildInfo.appName

function disableMenu() {
  if (window.location.hostname !== "tauri.localhost") {
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
  if (window.location.hostname !== "tauri.localhost") {
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
