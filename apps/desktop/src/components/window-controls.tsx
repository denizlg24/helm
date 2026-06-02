import { getCurrentWindow } from "@tauri-apps/api/window"
import { platform } from "@tauri-apps/plugin-os"
import { Copy, Minus, Square, X } from "lucide-react"
import { useEffect, useState } from "react"

const appWindow = getCurrentWindow()

export function WindowControls() {
  const [isMac] = useState(() => platform() === "macos")
  const [isMaximized, setIsMaximized] = useState(false)

  useEffect(() => {
    // macOS renders native overlay traffic lights; we only own the buttons
    // on the platforms where decorations are stripped.
    if (isMac) {
      return
    }

    let unlisten: (() => void) | undefined

    void (async () => {
      setIsMaximized(await appWindow.isMaximized())
      unlisten = await appWindow.onResized(async () => {
        setIsMaximized(await appWindow.isMaximized())
      })
    })()

    return () => unlisten?.()
  }, [isMac])

  if (isMac) {
    return null
  }

  return (
    <div className="-mr-3 flex self-stretch">
      <button
        type="button"
        onClick={() => void appWindow.minimize()}
        className="inline-flex w-11 items-center justify-center text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        aria-label="Minimize"
      >
        <Minus className="size-4" />
      </button>

      <button
        type="button"
        onClick={() => void appWindow.toggleMaximize()}
        className="inline-flex w-11 items-center justify-center text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        aria-label={isMaximized ? "Restore" : "Maximize"}
      >
        {isMaximized ? (
          <Copy className="size-3.5" />
        ) : (
          <Square className="size-3.5" />
        )}
      </button>

      <button
        type="button"
        onClick={() => void appWindow.close()}
        className="inline-flex w-11 items-center justify-center text-muted-foreground transition-colors hover:bg-destructive hover:text-destructive-foreground"
        aria-label="Close"
      >
        <X className="size-4" />
      </button>
    </div>
  )
}
