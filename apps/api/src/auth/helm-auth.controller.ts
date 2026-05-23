import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from "@nestjs/common"
import { HELM_API_KEY_CONFIG_ID } from "@workspace/auth/constants"
import { auth } from "@workspace/auth/server"
import {
  type AuthContext,
  CreateApiTokenInputSchema,
  RevokeDeviceInputSchema,
  UpdateApiTokenInputSchema,
} from "@workspace/types"
import { z } from "zod"
import {
  AuditSensitive,
  CurrentAuthContext,
  RequireScopes,
  RequireWorkspace,
} from "./auth.decorators"

@Controller("api")
@RequireWorkspace()
export class HelmAuthController {
  @Get("me")
  async me(@CurrentAuthContext() authContext: AuthContext) {
    return {
      user: {
        id: authContext.userId,
      },
      authContext,
    }
  }

  @Get("devices")
  @RequireScopes("device:read")
  async devices() {
    return []
  }

  @Post("devices/revoke")
  @RequireScopes("device:revoke")
  @AuditSensitive("device.revoke")
  async revokeDevice(@Body() body: { deviceId?: string }) {
    const input = RevokeDeviceInputSchema.parse(body)
    return { revoked: Boolean(input.deviceId) }
  }

  @Get("api-tokens")
  @RequireScopes("api-key:read")
  async apiTokens(@CurrentAuthContext() authContext: AuthContext) {
    return auth.api.listApiKeys({
      query: {
        configId: HELM_API_KEY_CONFIG_ID,
        organizationId: authContext.workspaceId,
      },
    })
  }

  @Post("api-tokens")
  @RequireScopes("api-key:write")
  @AuditSensitive("api-key.create")
  async createApiToken(
    @CurrentAuthContext() authContext: AuthContext,
    @Body() body: unknown
  ) {
    const input = CreateApiTokenInputSchema.parse(body)
    const permissions = input.scopes.reduce<Record<string, string[]>>(
      (result, scope) => {
        const [resource, action] = scope.split(":")
        if (!resource || !action) {
          return result
        }
        result[resource] = [...(result[resource] ?? []), action]
        return result
      },
      {}
    )

    return auth.api.createApiKey({
      body: {
        configId: HELM_API_KEY_CONFIG_ID,
        name: input.name,
        organizationId: authContext.workspaceId,
        userId: authContext.userId,
        expiresIn: input.expiresIn,
        permissions,
      },
    })
  }

  @Patch("api-tokens/:id")
  @RequireScopes("api-key:write")
  @AuditSensitive("api-key.update")
  async updateApiToken(
    @Param("id") id: string,
    @Body() body: { name?: string }
  ) {
    const keyId = z.string().min(1).parse(id)
    const input = UpdateApiTokenInputSchema.parse(body)
    return auth.api.updateApiKey({
      body: {
        configId: HELM_API_KEY_CONFIG_ID,
        keyId,
        name: input.name,
      },
    })
  }

  @Delete("api-tokens/:id")
  @RequireScopes("api-key:write")
  @AuditSensitive("api-key.delete")
  async deleteApiToken(@Param("id") id: string) {
    const keyId = z.string().min(1).parse(id)
    return auth.api.deleteApiKey({
      body: {
        configId: HELM_API_KEY_CONFIG_ID,
        keyId,
      },
    })
  }
}
