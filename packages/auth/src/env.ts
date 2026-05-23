import { z } from "zod"

const emptyStringToUndefined = (value: unknown) =>
  value === "" ? undefined : value

const optionalUrl = z.preprocess(
  emptyStringToUndefined,
  z.string().url().optional()
)

export const HelmAuthServerEnvSchema = z.object({
  BETTER_AUTH_SECRET: z.string().min(1),
  HELM_AUTH_BASE_URL: z.string().url().default("http://localhost:3003"),
  HELM_CONSOLE_URL: z.string().url().default("http://localhost:3002"),
  HELM_WEB_URL: z.string().url().default("http://localhost:3000"),
  HELM_DESKTOP_URL: z.string().url().default("http://localhost:1420"),
  HELM_DESKTOP_CALLBACK_ORIGIN: optionalUrl,
  HELM_DEVICE_CLIENT_ID: z.string().min(1).default("helm-desktop"),
  GOOGLE_CLIENT_ID: z.preprocess(
    emptyStringToUndefined,
    z.string().min(1).optional()
  ),
  GOOGLE_CLIENT_SECRET: z.preprocess(
    emptyStringToUndefined,
    z.string().min(1).optional()
  ),
})

export const HelmPublicClientEnvSchema = z.object({
  apiUrl: z.string().url().default("http://localhost:3003"),
})

export const HelmApiRuntimeEnvSchema = z.object({
  HELM_CONSOLE_URL: z.string().url().default("http://localhost:3002"),
  HELM_WEB_URL: z.string().url().default("http://localhost:3000"),
  HELM_DESKTOP_URL: z.string().url().default("http://localhost:1420"),
  PORT: z.coerce.number().int().positive().default(3003),
})

export const parseHelmAuthServerEnv = (
  env: NodeJS.ProcessEnv,
  overrides: {
    baseURL?: string
    secret?: string
    trustedOrigins?: string[]
    googleClientId?: string
    googleClientSecret?: string
    desktopClientId?: string
  } = {}
) =>
  HelmAuthServerEnvSchema.parse({
    ...env,
    BETTER_AUTH_SECRET: overrides.secret ?? env.BETTER_AUTH_SECRET,
    HELM_AUTH_BASE_URL: overrides.baseURL ?? env.HELM_AUTH_BASE_URL,
    GOOGLE_CLIENT_ID: overrides.googleClientId ?? env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET:
      overrides.googleClientSecret ?? env.GOOGLE_CLIENT_SECRET,
    HELM_DEVICE_CLIENT_ID:
      overrides.desktopClientId ?? env.HELM_DEVICE_CLIENT_ID,
  })
