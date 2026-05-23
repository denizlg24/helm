export const HELM_AUTH_BASE_PATH = "/api/auth"
export const HELM_WORKSPACE_HEADER = "x-helm-workspace-id"
export const HELM_API_KEY_HEADER = "x-api-key"
export const HELM_AUTHORIZATION_HEADER = "authorization"
export const HELM_DEVICE_CLIENT_ID = "helm-desktop"
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
} as const
