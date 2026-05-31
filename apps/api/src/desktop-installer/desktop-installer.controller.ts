import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
} from "@nestjs/common"
import {
  type AuthContext,
  CreateDesktopBuildInputSchema,
  DesktopBuildCallbackInputSchema,
} from "@workspace/types"
import {
  CurrentAuthContext,
  Public,
  RequireWorkspace,
} from "../auth/auth.decorators"
// biome-ignore lint/style/useImportType: Nest DI needs runtime metadata.
import { DesktopInstallerService } from "./desktop-installer.service"

@Controller("api/desktop-installer")
export class DesktopInstallerController {
  constructor(
    private readonly desktopInstallerService: DesktopInstallerService
  ) {}

  @Get("builds")
  @RequireWorkspace()
  async list(@CurrentAuthContext() authContext: AuthContext) {
    const builds = await this.desktopInstallerService.list(authContext)
    return { builds }
  }

  @Post("builds")
  @RequireWorkspace()
  async create(
    @CurrentAuthContext() authContext: AuthContext,
    @Body() body: unknown
  ) {
    const input = CreateDesktopBuildInputSchema.parse(body)
    return this.desktopInstallerService.create(authContext, input)
  }

  @Get("builds/:id")
  @RequireWorkspace()
  async get(
    @CurrentAuthContext() authContext: AuthContext,
    @Param("id") id: string
  ) {
    return this.desktopInstallerService.get(authContext, id)
  }

  @Post("builds/:id/callback")
  @Public()
  @HttpCode(200)
  async callback(
    @Param("id") id: string,
    @Headers("x-helm-build-token") token: string | undefined,
    @Body() body: unknown
  ) {
    const input = DesktopBuildCallbackInputSchema.parse(body)
    // First, query the build to get its workspaceId for workspace isolation in the transaction
    const build = await this.desktopInstallerService.getBuildWorkspaceId(id)
    return this.desktopInstallerService.applyCallback(
      id,
      token ?? "",
      input,
      build.workspaceId
    )
  }
}
