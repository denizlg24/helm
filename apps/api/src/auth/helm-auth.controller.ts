import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from "@nestjs/common"
import {
  type AuthContext,
  CreateApiTokenInputSchema,
  RevokeDeviceInputSchema,
  UpdateApiTokenInputSchema,
  UpdateUserSettingsInputSchema,
} from "@workspace/types"
import { z } from "zod"
// biome-ignore lint/style/useImportType: Nest DI needs runtime metadata.
import { ApiTokenService } from "./api-token.service"
import {
  AuditSensitive,
  CurrentAuthContext,
  RequireScopes,
  RequireWorkspace,
} from "./auth.decorators"
// biome-ignore lint/style/useImportType: Nest DI needs runtime metadata.
import { DeviceService } from "./device.service"
// biome-ignore lint/style/useImportType: Nest DI needs runtime metadata.
import { SettingsService } from "./settings.service"

@Controller("api")
@RequireWorkspace()
export class HelmAuthController {
  constructor(
    private readonly apiTokenService: ApiTokenService,
    private readonly deviceService: DeviceService,
    private readonly settingsService: SettingsService
  ) {}

  @Get("me")
  async me(@CurrentAuthContext() authContext: AuthContext) {
    return {
      user: {
        id: authContext.userId,
      },
      authContext,
    }
  }

  // Self-scoped: a user always reads/writes their own preferences, so no extra
  // scope is required beyond an authenticated workspace session.
  @Get("me/settings")
  async settings(@CurrentAuthContext() authContext: AuthContext) {
    return { settings: await this.settingsService.get(authContext.userId) }
  }

  @Patch("me/settings")
  async updateSettings(
    @CurrentAuthContext() authContext: AuthContext,
    @Body() body: unknown
  ) {
    const input = UpdateUserSettingsInputSchema.parse(body)
    return {
      settings: await this.settingsService.update(authContext.userId, input),
    }
  }

  @Get("devices")
  @RequireScopes("device:read")
  async devices(@CurrentAuthContext() authContext: AuthContext) {
    return this.deviceService.list(authContext)
  }

  @Post("devices/revoke")
  @RequireScopes("device:revoke")
  @AuditSensitive("device.revoke")
  async revokeDevice(
    @CurrentAuthContext() authContext: AuthContext,
    @Body() body: unknown
  ) {
    const input = RevokeDeviceInputSchema.parse(body)
    return this.deviceService.revoke(authContext, input.deviceId)
  }

  @Get("api-tokens")
  @RequireScopes("api-key:read")
  @AuditSensitive("api-key.list")
  async apiTokens(@CurrentAuthContext() authContext: AuthContext) {
    return this.apiTokenService.list(authContext)
  }

  @Post("api-tokens")
  @RequireScopes("api-key:write")
  @AuditSensitive("api-key.create")
  async createApiToken(
    @CurrentAuthContext() authContext: AuthContext,
    @Body() body: unknown
  ) {
    const input = CreateApiTokenInputSchema.parse(body)
    return this.apiTokenService.create(authContext, input)
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
    return this.apiTokenService.update(keyId, input)
  }

  @Delete("api-tokens/:id")
  @RequireScopes("api-key:write")
  @AuditSensitive("api-key.delete")
  async deleteApiToken(@Param("id") id: string) {
    const keyId = z.string().min(1).parse(id)
    return this.apiTokenService.delete(keyId)
  }
}
