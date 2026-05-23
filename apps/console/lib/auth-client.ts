"use client"

import { createHelmAuthClient } from "@workspace/auth/client"
import { HelmPublicClientEnvSchema } from "@workspace/auth/env"

const env = HelmPublicClientEnvSchema.parse({
  apiUrl: process.env.NEXT_PUBLIC_HELM_API_URL,
})

export const authClient = createHelmAuthClient({
  baseURL: env.apiUrl,
})
