"use client"

import { ChatView, useAssistantChat } from "@workspace/assistant"
import type { AssistantDockPosition } from "@workspace/types"
import {
  useClientToolDispatcher,
  useDataInvalidator,
  useRegisterClientTool,
  useSurfaceContextReader,
} from "@workspace/ui/assistant/bridge"
import { Button } from "@workspace/ui/components/button"
import { useIsMobile } from "@workspace/ui/hooks/use-mobile"
import { cn } from "@workspace/ui/lib/utils"
import { Bot, Plus, X } from "lucide-react"
import { usePathname, useRouter } from "next/navigation"
import { useState } from "react"
import { apiClient } from "../lib/api"
import { authClient } from "../lib/auth-client"
import { useSettings } from "./settings/settings-provider"

// The home route is the full assistant; a second instance there is redundant.
const HIDDEN_ROUTES = new Set(["/", "/sign-in"])

const ANCHOR: Record<AssistantDockPosition, string> = {
  "bottom-right": "bottom-4 right-4",
  "bottom-left": "bottom-4 left-4",
  "top-right": "top-4 right-4",
  "top-left": "top-4 left-4",
}

const moduleFromPath = (pathname: string): string => {
  const segment = pathname.split("/")[1]
  return segment && segment.length > 0 ? segment : "home"
}

export function AssistantDock() {
  const pathname = usePathname()
  const router = useRouter()
  const isMobile = useIsMobile()
  const { data: session } = authClient.useSession()
  const { settings } = useSettings()
  const position = settings.assistant.dockPosition
  const [open, setOpen] = useState(false)

  const readSurface = useSurfaceContextReader()
  const dispatchClientTool = useClientToolDispatcher()
  const invalidate = useDataInvalidator()

  const chat = useAssistantChat({
    client: apiClient,
    dispatchClientTool,
    onDataMutation: invalidate,
    getSurfaceContext: () => {
      const surface = readSurface()
      // Only reuse stored surface if it matches the current route
      if (surface && surface.route === pathname) {
        return surface
      }
      return { module: moduleFromPath(pathname), route: pathname }
    },
  })

  // Global navigation tool, executed against the Next router.
  useRegisterClientTool("app_navigate", (input) => {
    const route = typeof input.route === "string" ? input.route : ""
    // Only allow same-origin paths: must start with "/" but not "//" and no backslashes
    if (
      !route.startsWith("/") ||
      route.startsWith("//") ||
      route.includes("\\")
    ) {
      return { result: `Refused invalid route "${route}".`, isError: true }
    }
    router.push(route)
    return { result: `Navigated to ${route}.` }
  })

  if (!session || HIDDEN_ROUTES.has(pathname)) return null

  const anchor = ANCHOR[position]

  if (!open) {
    return (
      <Button
        type="button"
        size="icon"
        aria-label="Open assistant"
        className={cn("fixed z-50 size-12 rounded-full shadow-lg", anchor)}
        onClick={() => setOpen(true)}
      >
        <Bot className="size-5" />
      </Button>
    )
  }

  const panelClasses = isMobile
    ? "fixed inset-0 z-50 flex flex-col bg-background"
    : cn(
        "fixed z-50 flex h-[min(640px,80vh)] w-[400px] flex-col overflow-hidden rounded-xl border bg-background shadow-xl",
        anchor
      )

  return (
    <div className={panelClasses}>
      <header className="flex items-center justify-between border-b px-3 py-2">
        <span className="font-medium text-sm">{chat.title ?? "Assistant"}</span>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label="New chat"
            title="New chat"
            onClick={() => chat.newChat()}
          >
            <Plus className="size-4" />
          </Button>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label="Close assistant"
            onClick={() => setOpen(false)}
          >
            <X className="size-4" />
          </Button>
        </div>
      </header>
      <div className="min-h-0 flex-1">
        <ChatView chat={chat} composerPlacement="bottom" />
      </div>
    </div>
  )
}
