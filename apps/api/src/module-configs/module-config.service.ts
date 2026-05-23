import { Injectable } from "@nestjs/common"
import { db, eq, moduleConfigs } from "@workspace/db"

@Injectable()
export class ModuleConfigService {
  async listEnabledModuleIds(workspaceId: string) {
    const rows = await db
      .select({ moduleId: moduleConfigs.moduleId })
      .from(moduleConfigs)
      .where(eq(moduleConfigs.workspaceId, workspaceId))

    return rows.map((row) => row.moduleId)
  }
}
