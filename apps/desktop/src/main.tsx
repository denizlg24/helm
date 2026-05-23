import React from "react"
import ReactDOM from "react-dom/client"
import "@workspace/ui/globals.css"
import { App } from "./App"

const documentRoot = document.getElementById("root")

if (!documentRoot) {
  throw new Error("Root element not found")
}

ReactDOM.createRoot(documentRoot).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
