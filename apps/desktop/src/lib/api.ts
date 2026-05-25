import { createHelmApiClient } from "@workspace/api-client"

const API_URL =
  import.meta.env.VITE_HELM_API_URL ??
  (import.meta.env.MODE === "development"
    ? "http://localhost:3003"
    : (() => {
        throw new Error("VITE_HELM_API_URL is required in production builds")
      })())

// The desktop app authenticates with a device bearer token (stored in the OS
// keychain) and sends the active workspace id on every request.
let authToken: string | null = null
let workspaceId: string | null = null

export const setApiToken = (token: string | null): void => {
  authToken = token
}

export const setApiWorkspaceId = (id: string | null): void => {
  workspaceId = id
}

export const apiClient = createHelmApiClient({
  baseUrl: API_URL,
  getAuthHeaders: () =>
    authToken ? { Authorization: `Bearer ${authToken}` } : undefined,
  getWorkspaceId: () => workspaceId ?? undefined,
})
