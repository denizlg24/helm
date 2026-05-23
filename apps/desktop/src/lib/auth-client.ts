import { createHelmAuthClient } from "@workspace/auth/client"
import { HelmPublicClientEnvSchema } from "@workspace/auth/env"

const env = HelmPublicClientEnvSchema.parse({
  apiUrl: import.meta.env.VITE_HELM_API_URL,
})

export const createDesktopAuthClient = (
  token?: () => string | Promise<string>
) =>
  createHelmAuthClient({
    baseURL: env.apiUrl,
    bearerToken: token,
  })
