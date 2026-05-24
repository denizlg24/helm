import { Body, Controller, Get, Post } from "@nestjs/common"
import {
  type AuthContext,
  CreateWorkspaceInputSchema,
  SetActiveWorkspaceInputSchema,
} from "@workspace/types"
import {
  type AuthSessionContext,
  CurrentAuthContext,
  CurrentAuthSession,
  RequireWorkspace,
} from "../auth/auth.decorators"
// biome-ignore lint/style/useImportType: Nest DI needs runtime metadata.
import { WorkspaceService } from "./workspace.service"

@Controller("api/workspaces")
export class WorkspaceController {
  constructor(private readonly workspaceService: WorkspaceService) {}

  @Get()
  @RequireWorkspace()
  async list(@CurrentAuthContext() authContext: AuthContext) {
    return this.workspaceService.listForUser(authContext.userId)
  }

  @Get("current")
  @RequireWorkspace()
  async current(@CurrentAuthContext() authContext: AuthContext) {
    const workspace = await this.workspaceService.getWorkspace(
      authContext.workspaceId
    )
    return {
      workspace,
      role: authContext.role,
      enabledModules: authContext.enabledModules,
      entitlements: authContext.entitlements,
    }
  }

  @Post()
  async create(
    @CurrentAuthSession() authSession: AuthSessionContext,
    @Body() body: unknown
  ) {
    const input = CreateWorkspaceInputSchema.parse(body)
    return this.workspaceService.provisionFirstWorkspace({
      userId: authSession.userId,
      displayName: input.displayName,
      slug: input.slug,
      theme: input.theme,
    })
  }

  @Post("active")
  @RequireWorkspace()
  async setActive(
    @CurrentAuthContext() authContext: AuthContext,
    @Body() body: unknown
  ) {
    const input = SetActiveWorkspaceInputSchema.parse(body)
    await this.workspaceService.resolveAuthContext({
      userId: authContext.userId,
      sessionId: authContext.sessionId,
      workspaceId: input.workspaceId,
      authMethod: authContext.authMethod,
    })

    return { workspaceId: input.workspaceId }
  }

  @Post("onboarding/complete")
  @RequireWorkspace()
  async completeOnboarding(@CurrentAuthContext() authContext: AuthContext) {
    const workspace =
      await this.workspaceService.completeOnboarding(authContext)
    return {
      workspace,
      role: authContext.role,
      enabledModules: authContext.enabledModules,
      entitlements: authContext.entitlements,
    }
  }
}
