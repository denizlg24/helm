import { openUrl } from "@tauri-apps/plugin-opener"
import { createHelmApiClient } from "@workspace/api-client"
import { useCallback, useEffect, useRef, useState } from "react"
import { createDesktopAuthClient } from "./lib/auth-client"
import { keychain } from "./lib/keychain"

const CLIENT_ID = "helm-desktop"
const API_URL = import.meta.env.VITE_HELM_API_URL ?? "http://localhost:3003"

interface SessionUser {
  id: string
  email?: string
  name?: string
}

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
  | { kind: "error"; message: string }

const fetchSession = async (token: string): Promise<SessionUser | null> => {
  const apiClient = createHelmApiClient({
    baseUrl: API_URL,
    getAuthHeaders: () => ({ Authorization: `Bearer ${token}` }),
  })
  try {
    const response = await apiClient.user.current()
    return response.user
  } catch {
    return null
  }
}

export function App() {
  const [status, setStatus] = useState<Status>({ kind: "idle" })
  const pollRef = useRef<number | null>(null)
  const tokenRef = useRef<string | null>(null)
  const pollingRef = useRef(false)

  const stopPolling = useCallback(() => {
    if (pollRef.current !== null) {
      window.clearTimeout(pollRef.current)
      pollRef.current = null
    }
    pollingRef.current = false
  }, [])

  useEffect(() => {
    void (async () => {
      const stored = await keychain.getToken()
      if (!stored) return
      tokenRef.current = stored
      const user = await fetchSession(stored)
      if (user) {
        setStatus({ kind: "connected", user })
      } else {
        await keychain.clearToken()
      }
    })()
    return stopPolling
  }, [stopPolling])

  const activate = useCallback(async () => {
    stopPolling()
    setStatus({ kind: "idle" })
    const client = createDesktopAuthClient()
    const { data, error } = await client.device.code({ client_id: CLIENT_ID })
    if (error || !data) {
      const message =
        error?.error_description ?? error?.error ?? "Failed to start activation"
      setStatus({ kind: "error", message })
      return
    }
    const activation: Activation = data
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
      const user = await fetchSession(token)
      if (!user) {
        setStatus({
          kind: "error",
          message: "Connected but session lookup failed",
        })
        return
      }
      setStatus({ kind: "connected", user })
    }

    pollRef.current = window.setTimeout(() => void poll(), intervalMs)
  }, [stopPolling])

  const disconnect = useCallback(async () => {
    stopPolling()
    await keychain.clearToken()
    tokenRef.current = null
    setStatus({ kind: "idle" })
  }, [stopPolling])

  return (
    <main style={{ fontFamily: "system-ui", padding: "2rem", maxWidth: 560 }}>
      <h1>Helm Desktop</h1>

      {status.kind === "connected" ? (
        <section>
          <p>
            Connected as <strong>{status.user.email ?? status.user.id}</strong>
          </p>
          <button type="button" onClick={() => void disconnect()}>
            Disconnect
          </button>
        </section>
      ) : (
        <section>
          <p>Activate this device by signing in on the console.</p>
          <button type="button" onClick={() => void activate()}>
            Activate device
          </button>
        </section>
      )}

      {status.kind === "activating" ? (
        <section style={{ marginTop: "1.5rem" }}>
          <p>
            Enter this code on{" "}
            <a
              href={status.activation.verification_uri}
              onClick={(event) => {
                event.preventDefault()
                void openUrl(status.activation.verification_uri)
              }}
            >
              {status.activation.verification_uri}
            </a>
          </p>
          <p
            style={{
              fontSize: "2rem",
              letterSpacing: "0.25rem",
              fontFamily: "monospace",
            }}
          >
            {status.activation.user_code}
          </p>
          <p>Waiting for approval…</p>
        </section>
      ) : null}

      {status.kind === "error" ? (
        <p style={{ color: "crimson", marginTop: "1.5rem" }}>
          {status.message}
        </p>
      ) : null}
    </main>
  )
}
