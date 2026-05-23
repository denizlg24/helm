import { apiKey } from "@better-auth/api-key"
import { drizzleAdapter } from "@better-auth/drizzle-adapter"
import { db } from "@workspace/db"
import * as schema from "@workspace/db/schema"
import { betterAuth } from "better-auth"
import {
  bearer,
  deviceAuthorization,
  jwt,
  organization,
} from "better-auth/plugins"
import {
  HELM_API_KEY_CONFIG_ID,
  HELM_AUTH_BASE_PATH,
  HELM_DEVICE_CLIENT_ID,
} from "./constants"
import { parseHelmAuthServerEnv } from "./env"
import { admin, helmAccessControl, member, owner } from "./permissions"

export interface HelmAuthConfig {
  baseURL?: string
  secret?: string
  trustedOrigins?: string[]
  googleClientId?: string
  googleClientSecret?: string
  desktopClientId?: string
}

export const createHelmAuth = (config: HelmAuthConfig = {}) => {
  const env = parseHelmAuthServerEnv(process.env, config)
  const trustedOrigins =
    config.trustedOrigins ??
    [
      env.HELM_CONSOLE_URL,
      env.HELM_WEB_URL,
      env.HELM_DESKTOP_URL,
      env.HELM_DESKTOP_CALLBACK_ORIGIN,
    ].filter((origin): origin is string => Boolean(origin))

  return betterAuth({
    baseURL: env.HELM_AUTH_BASE_URL,
    basePath: HELM_AUTH_BASE_PATH,
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins,
    database: drizzleAdapter(db, {
      provider: "pg",
      schema,
    }),
    emailAndPassword: {
      enabled: true,
    },
    socialProviders:
      env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
        ? {
            google: {
              clientId: env.GOOGLE_CLIENT_ID,
              clientSecret: env.GOOGLE_CLIENT_SECRET,
            },
          }
        : undefined,
    plugins: [
      organization({
        ac: helmAccessControl,
        roles: { owner, admin, member },
      }),
      apiKey({
        configId: HELM_API_KEY_CONFIG_ID,
        references: "organization",
        permissions: { defaultPermissions: {} },
        rateLimit: { enabled: true, timeWindow: 60_000, maxRequests: 120 },
      }),
      bearer(),
      deviceAuthorization({
        verificationUri: `${env.HELM_CONSOLE_URL.replace(/\/$/, "")}/device`,
        validateClient: async (clientId) =>
          clientId === (env.HELM_DEVICE_CLIENT_ID ?? HELM_DEVICE_CLIENT_ID),
        schema: {},
      }),
      jwt(),
    ],
  })
}

export const auth = createHelmAuth()
export type HelmBetterAuth = ReturnType<typeof createHelmAuth>
