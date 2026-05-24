export const HELM_AUTH_BASE_PATH = "/api/auth"
export const HELM_WORKSPACE_HEADER = "x-helm-workspace-id"
export const HELM_API_KEY_HEADER = "x-api-key"
export const HELM_AUTHORIZATION_HEADER = "authorization"
export const HELM_DEVICE_CLIENT_ID = "helm-desktop"

// Origins used by packaged Tauri desktop builds. The dev origin
// (http://localhost:1420) comes from HELM_DESKTOP_URL; these are the static
// production webview origins: http://tauri.localhost on Windows, tauri://localhost
// on macOS/Linux. They are not URL-normalizable (tauri:// is a non-special scheme),
// so consumers must use them as raw origin strings.
export const HELM_DESKTOP_PRODUCTION_ORIGINS = [
  "http://tauri.localhost",
  "tauri://localhost",
] as const
export const HELM_API_KEY_CONFIG_ID = "helm-workspace-api-key"
export const HELM_SESSION_COOKIE_NAME = "better-auth.session_token"

export const HELM_AUTH_SCOPES = {
  workspaceRead: "workspace:read",
  workspaceUpdate: "workspace:update",
  moduleRead: "module:read",
  moduleConfigure: "module:configure",
  apiKeyRead: "api-key:read",
  apiKeyWrite: "api-key:write",
  deviceRead: "device:read",
  deviceRevoke: "device:revoke",
  usageRead: "usage:read",
  billingRead: "billing:read",
  billingWrite: "billing:write",
} as const
