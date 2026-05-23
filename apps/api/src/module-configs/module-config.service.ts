import { Injectable } from "@nestjs/common"
import { and, db, eq, moduleConfigs } from "@workspace/db"

@Injectable()
export class ModuleConfigService {
  async listEnabledModuleIds(workspaceId: string) {
    const rows = await db
      .select({ moduleId: moduleConfigs.moduleId })
      .from(moduleConfigs)
      .where(
        and(
          eq(moduleConfigs.workspaceId, workspaceId),
          eq(moduleConfigs.enabled, true)
        )
      )

    return rows.map((row) => row.moduleId)
  }
}
