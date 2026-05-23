import { Body, Controller, Get, Post } from "@nestjs/common"
import { auth } from "@workspace/auth/server"
import {
  type AuthContext,
  CreateWorkspaceInputSchema,
  SetActiveWorkspaceInputSchema,
} from "@workspace/types"
import {
  AuditSensitive,
  CurrentAuthContext,
  RequireWorkspace,
} from "../auth/auth.decorators"
// biome-ignore lint/style/useImportType: Nest DI needs runtime metadata.
import { WorkspaceService } from "./workspace.service"

@Controller("api/workspaces")
@RequireWorkspace()
export class WorkspaceController {
  constructor(private readonly workspaceService: WorkspaceService) {}

  @Get()
  async list(@CurrentAuthContext() authContext: AuthContext) {
    return this.workspaceService.listForUser(authContext.userId)
  }

  @Get("current")
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
  @AuditSensitive("workspace.create")
  async create(
    @CurrentAuthContext() authContext: AuthContext,
    @Body() body: unknown
  ) {
    const input = CreateWorkspaceInputSchema.parse(body)
    const organization = await auth.api.createOrganization({
      body: {
        name: input.displayName,
        slug: input.slug,
        userId: authContext.userId,
      },
    })

    return this.workspaceService.provisionFirstWorkspace({
      organizationId: organization.id,
      userId: authContext.userId,
      displayName: input.displayName,
      slug: input.slug,
      theme: input.theme,
    })
  }

  @Post("active")
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
}
