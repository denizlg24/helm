"use client"

import { createHelmApiClient } from "@workspace/api-client"
import { HelmPublicClientEnvSchema } from "@workspace/auth/env"

const env = HelmPublicClientEnvSchema.parse({
  apiUrl: process.env.NEXT_PUBLIC_HELM_API_URL,
})

export const apiClient = createHelmApiClient({
  baseUrl: env.apiUrl,
})
