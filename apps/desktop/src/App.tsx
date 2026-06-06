import { openUrl } from "@tauri-apps/plugin-opener"
import { platform } from "@tauri-apps/plugin-os"
import { createHelmApiClient, ForbiddenError } from "@workspace/api-client"
import { AuthHeader, Wordmark } from "@workspace/ui/components/auth-shell"
import { Button } from "@workspace/ui/components/button"
import { Spinner } from "@workspace/ui/components/spinner"
import { cn } from "@workspace/ui/lib/utils"
import { useCallback, useEffect, useRef, useState } from "react"
import { DesktopDashboard } from "./components/desktop-dashboard"
import { WindowControls } from "./components/window-controls"
import { createDesktopAuthClient } from "./lib/auth-client"
import { keychain } from "./lib/keychain"

const CLIENT_ID = "helm-desktop"
const API_URL = import.meta.env.VITE_HELM_API_URL || "http://localhost:3003"
const CONSOLE_URL =
  import.meta.env.VITE_HELM_CONSOLE_URL || "http://localhost:3002"
const ONBOARDING_URL = `${CONSOLE_URL}/onboarding/workspace`

interface SessionUser {
  id: string
  email?: string
  name?: string
}

type SessionResult =
  | { kind: "ok"; user: SessionUser }
  | { kind: "needs-onboarding" }
  | { kind: "invalid" }

type Activation = {
  device_code: string
  user_code: string
  verification_uri: string
  verification_uri_complete?: string
  expires_in: number
  interval: number
}

type Status =
  | { kind: "idle" }
  | { kind: "activating"; activation: Activation }
  | { kind: "connected"; user: SessionUser }
  | { kind: "needs-onboarding" }
  | { kind: "error"; message: string }

const fetchSession = async (token: string): Promise<SessionResult> => {
  const apiClient = createHelmApiClient({
    baseUrl: API_URL,
    getAuthHeaders: () => ({ Authorization: `Bearer ${token}` }),
  })
  try {
    const response = await apiClient.user.current()
    return { kind: "ok", user: response.user }
  } catch (error) {
    // /api/me only fails with 403 when the account has no workspace yet.
    if (error instanceof ForbiddenError) {
      return { kind: "needs-onboarding" }
    }
    return { kind: "invalid" }
  }
}

export function App() {
  const [status, setStatus] = useState<Status>({ kind: "idle" })
  const [starting, setStarting] = useState(false)
  const [rechecking, setRechecking] = useState(false)
  const pollRef = useRef<number | null>(null)
  const tokenRef = useRef<string | null>(null)
  const pollingRef = useRef(false)
  const [isMac] = useState(() => platform() === "macos")

  const stopPolling = useCallback(() => {
    if (pollRef.current !== null) {
      window.clearTimeout(pollRef.current)
      pollRef.current = null
    }
    pollingRef.current = false
  }, [])

  const applySession = useCallback(async (token: string) => {
    const result = await fetchSession(token)
    if (result.kind === "ok") {
      setStatus({ kind: "connected", user: result.user })
      return
    }
    if (result.kind === "needs-onboarding") {
      setStatus({ kind: "needs-onboarding" })
      return
    }
    await keychain.clearToken()
    tokenRef.current = null
    setStatus({
      kind: "error",
      message: "This device's session expired. Activate it again.",
    })
  }, [])

  useEffect(() => {
    void (async () => {
      const stored = await keychain.getToken()
      if (!stored) return
      tokenRef.current = stored
      const result = await fetchSession(stored)
      if (result.kind === "ok") {
        setStatus({ kind: "connected", user: result.user })
      } else if (result.kind === "needs-onboarding") {
        setStatus({ kind: "needs-onboarding" })
      } else {
        await keychain.clearToken()
        tokenRef.current = null
      }
    })()
    return stopPolling
  }, [stopPolling])

  const recheck = useCallback(async () => {
    const token = tokenRef.current
    if (!token) {
      return
    }
    setRechecking(true)
    try {
      await applySession(token)
    } finally {
      setRechecking(false)
    }
  }, [applySession])

  const activate = useCallback(async () => {
    stopPolling()
    setStatus({ kind: "idle" })
    setStarting(true)
    const client = createDesktopAuthClient()
    let activation: Activation
    try {
      const { data, error } = await client.device.code({ client_id: CLIENT_ID })
      if (error || !data) {
        const message =
          error?.error_description ??
          error?.error ??
          "Failed to start activation"
        setStatus({ kind: "error", message })
        return
      }
      activation = data
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to start activation"
      setStatus({ kind: "error", message })
      return
    } finally {
      setStarting(false)
    }
    setStatus({ kind: "activating", activation })
    const openTarget =
      activation.verification_uri_complete ?? activation.verification_uri
    try {
      await openUrl(openTarget)
    } catch {
      // user can click link manually
    }

    let intervalMs = Math.max(activation.interval, 1) * 1000
    const deadline = Date.now() + activation.expires_in * 1000

    const poll = async () => {
      if (pollingRef.current) {
        return
      }
      pollingRef.current = true
      if (Date.now() > deadline) {
        stopPolling()
        setStatus({ kind: "error", message: "Activation code expired" })
        return
      }
      const result = await client.device.token({
        device_code: activation.device_code,
        client_id: CLIENT_ID,
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      })
      if (result.error) {
        const code = result.error.error
        if (code === "slow_down") {
          intervalMs += 5000
        }
        if (code === "authorization_pending" || code === "slow_down") {
          pollingRef.current = false
          pollRef.current = window.setTimeout(() => void poll(), intervalMs)
          return
        }
        stopPolling()
        setStatus({
          kind: "error",
          message: result.error.error_description ?? code,
        })
        return
      }
      const token = result.data?.access_token
      if (!token) {
        pollingRef.current = false
        pollRef.current = window.setTimeout(() => void poll(), intervalMs)
        return
      }
      stopPolling()
      tokenRef.current = token
      await keychain.setToken(token)
      await applySession(token)
    }

    pollRef.current = window.setTimeout(() => void poll(), intervalMs)
  }, [stopPolling, applySession])

  const disconnect = useCallback(async () => {
    stopPolling()
    await keychain.clearToken()
    tokenRef.current = null
    setStatus({ kind: "idle" })
  }, [stopPolling])

  if (status.kind === "connected" && tokenRef.current) {
    return (
      <DesktopDashboard
        token={tokenRef.current}
        user={status.user}
        onDisconnect={() => void disconnect()}
      />
    )
  }

  return (
    <div className="flex h-svh w-full flex-col overflow-hidden bg-background text-foreground">
      <header
        data-tauri-drag-region
        className={cn(
          "flex min-h-12 shrink-0 items-center gap-2 border-border/70 border-b bg-background/92 px-3 backdrop-blur-sm",
          isMac && "pl-20"
        )}
      >
        <Wordmark className="mr-auto" />
        <WindowControls />
      </header>
      <main className="flex min-h-0 flex-1 items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          {status.kind === "needs-onboarding" ? (
            <>
              <AuthHeader
                description="This device is linked to your account, but you haven't set up a workspace yet. Finish onboarding on the console, then check again."
                title="Finish setting up"
                wordmark={false}
              />
              <div className="flex flex-col gap-2">
                <Button
                  className="w-full"
                  onClick={() => void openUrl(ONBOARDING_URL)}
                  size="lg"
                  type="button"
                >
                  Open console to finish setup
                </Button>
                <Button
                  className="w-full"
                  loading={rechecking}
                  onClick={() => void recheck()}
                  size="lg"
                  type="button"
                  variant="outline"
                >
                  I've finished — check again
                </Button>
                <Button
                  className="w-full"
                  onClick={() => void disconnect()}
                  size="lg"
                  type="button"
                  variant="ghost"
                >
                  Disconnect
                </Button>
              </div>
            </>
          ) : status.kind === "activating" ? (
            <>
              <AuthHeader
                description="Enter this code in your browser to approve this desktop device."
                title="Activate device"
                wordmark={false}
              />
              <Button
                className="mb-6 w-full min-w-0 justify-start px-3"
                onClick={() => void openUrl(status.activation.verification_uri)}
                size="lg"
                type="button"
                variant="outline"
              >
                <span className="min-w-0 truncate font-mono text-xs">
                  {status.activation.verification_uri}
                </span>
              </Button>
              <div className="flex justify-center gap-1.5">
                {status.activation.user_code
                  .split("")
                  .map((char, index) => ({ char, id: index }))
                  .map(({ char, id }) =>
                    /[a-zA-Z0-9]/.test(char) ? (
                      <span
                        className="flex h-12 w-10 items-center justify-center rounded-md border border-border bg-secondary font-medium font-mono text-foreground text-xl uppercase"
                        key={id}
                      >
                        {char}
                      </span>
                    ) : (
                      <span
                        className="flex items-center text-muted-foreground"
                        key={id}
                      >
                        {char}
                      </span>
                    )
                  )}
              </div>
              <p className="mt-6 flex items-center justify-center gap-2 text-muted-foreground text-sm">
                <Spinner className="size-4" />
                Waiting for approval…
              </p>
            </>
          ) : (
            <>
              <AuthHeader
                description="Activate this device by approving it on the console."
                title="Activate this device"
                wordmark={false}
              />
              <Button
                className="w-full"
                loading={starting}
                onClick={() => void activate()}
                size="lg"
                type="button"
              >
                Activate device
              </Button>
            </>
          )}

          {status.kind === "error" ? (
            <p className="mt-6 text-destructive text-sm" role="alert">
              {status.message}
            </p>
          ) : null}
        </div>
      </main>
    </div>
  )
}
