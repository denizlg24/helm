"use client"

import { createHelmApiClient } from "@workspace/api-client"
import { HelmPublicClientEnvSchema } from "@workspace/auth/env"

const env = HelmPublicClientEnvSchema.parse({
  apiUrl: process.env.NEXT_PUBLIC_HELM_API_URL,
})

// The active workspace id is resolved once after sign-in and sent on every
// request via the x-helm-workspace-id header. Auth itself rides on the
// better-auth session cookie (credentials: "include").
let activeWorkspaceId: string | null = null

export const setActiveWorkspaceId = (id: string | null): void => {
  activeWorkspaceId = id
}

export const apiClient = createHelmApiClient({
  baseUrl: env.apiUrl,
  getWorkspaceId: () => activeWorkspaceId ?? undefined,
})
