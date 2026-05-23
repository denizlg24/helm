import { Injectable } from "@nestjs/common"
import { HELM_API_KEY_CONFIG_ID } from "@workspace/auth/constants"
import { auth } from "@workspace/auth/server"
import type {
  AuthContext,
  CreateApiTokenInput,
  UpdateApiTokenInput,
} from "@workspace/types"

const toPermissions = (scopes: string[]) =>
  scopes.reduce<Record<string, string[]>>((result, scope) => {
    const [resource, action] = scope.split(":")
    if (!resource || !action) {
      return result
    }
    result[resource] = [...(result[resource] ?? []), action]
    return result
  }, {})

const stripSecretMaterial = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(stripSecretMaterial)
  }
  if (!value || typeof value !== "object") {
    return value
  }

  const sanitized: Record<string, unknown> = {}
  for (const [key, entry] of Object.entries(value)) {
    if (key === "key") {
      continue
    }
    sanitized[key] = stripSecretMaterial(entry)
  }
  return sanitized
}

@Injectable()
export class ApiTokenService {
  async list(authContext: AuthContext) {
    const tokens = await auth.api.listApiKeys({
      query: {
        configId: HELM_API_KEY_CONFIG_ID,
        organizationId: authContext.workspaceId,
      },
    })

    return stripSecretMaterial(tokens)
  }

  async create(authContext: AuthContext, input: CreateApiTokenInput) {
    return auth.api.createApiKey({
      body: {
        configId: HELM_API_KEY_CONFIG_ID,
        name: input.name,
        organizationId: authContext.workspaceId,
        userId: authContext.userId,
        expiresIn: input.expiresIn,
        permissions: toPermissions(input.scopes),
        rateLimitEnabled: input.rateLimit?.enabled,
        rateLimitTimeWindow: input.rateLimit?.timeWindowMs,
        rateLimitMax: input.rateLimit?.maxRequests,
      },
    })
  }

  async update(keyId: string, input: UpdateApiTokenInput) {
    return auth.api.updateApiKey({
      body: {
        configId: HELM_API_KEY_CONFIG_ID,
        keyId,
        name: input.name,
        permissions: input.scopes ? toPermissions(input.scopes) : undefined,
        rateLimitEnabled: input.rateLimit?.enabled,
        rateLimitTimeWindow: input.rateLimit?.timeWindowMs,
        rateLimitMax: input.rateLimit?.maxRequests,
      },
    })
  }

  async delete(keyId: string) {
    return auth.api.deleteApiKey({
      body: {
        configId: HELM_API_KEY_CONFIG_ID,
        keyId,
      },
    })
  }
}
