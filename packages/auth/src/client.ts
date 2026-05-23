import { apiKeyClient } from "@better-auth/api-key/client"
import {
  deviceAuthorizationClient,
  organizationClient,
} from "better-auth/client/plugins"
import { createAuthClient } from "better-auth/react"
import { admin, helmAccessControl, member, owner } from "./permissions"
import type { CreateHelmAuthClientOptions } from "./types"

export const createHelmAuthClient = (
  options: CreateHelmAuthClientOptions = {}
) =>
  createAuthClient({
    baseURL: options.baseURL,
    fetchOptions: options.bearerToken
      ? {
          auth: {
            type: "Bearer",
            token: options.bearerToken,
          },
        }
      : undefined,
    plugins: [
      organizationClient({
        ac: helmAccessControl,
        roles: {
          owner,
          admin,
          member,
        },
      }),
      apiKeyClient(),
      deviceAuthorizationClient(),
    ],
  })
