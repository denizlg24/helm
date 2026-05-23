import { Controller, Get } from "@nestjs/common"
import type { AuthContext } from "@workspace/types"
import {
  CurrentAuthContext,
  RequireScopes,
  RequireWorkspace,
} from "../auth/auth.decorators"
// biome-ignore lint/style/useImportType: Nest DI needs runtime metadata.
import { UsageService } from "./usage.service"

@Controller("api/usage")
@RequireWorkspace()
export class UsageController {
  constructor(private readonly usageService: UsageService) {}

  @Get()
  @RequireScopes("usage:read")
  async summary(@CurrentAuthContext() authContext: AuthContext) {
    return this.usageService.getMonthlySummary(authContext.workspaceId)
  }
}
