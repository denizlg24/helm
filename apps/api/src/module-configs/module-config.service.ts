import { Injectable } from "@nestjs/common"
import { and, db, eq, inArray, moduleConfigs } from "@workspace/db"

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

  /**
   * Enable a set of modules for a workspace (idempotent). Used by billing when
   * a module-expansion add-on is purchased.
   */
  async enableModules(
    tenantId: string,
    workspaceId: string,
    moduleIds: string[]
  ): Promise<void> {
    if (moduleIds.length === 0) {
      return
    }
    const now = new Date()
    await db
      .insert(moduleConfigs)
      .values(
        moduleIds.map((moduleId) => ({
          id: crypto.randomUUID(),
          tenantId,
          workspaceId,
          moduleId,
          enabled: true,
          settingsJson: {},
          createdAt: now,
          updatedAt: now,
        }))
      )
      .onConflictDoUpdate({
        target: [moduleConfigs.workspaceId, moduleConfigs.moduleId],
        set: { enabled: true, updatedAt: now },
      })
  }

  /**
   * Disable a set of modules for a workspace (idempotent). Used by billing when
   * a module add-on subscription is revoked.
   */
  async disableModules(
    workspaceId: string,
    moduleIds: string[]
  ): Promise<void> {
    if (moduleIds.length === 0) {
      return
    }
    await db
      .update(moduleConfigs)
      .set({ enabled: false, updatedAt: new Date() })
      .where(
        and(
          eq(moduleConfigs.workspaceId, workspaceId),
          inArray(moduleConfigs.moduleId, moduleIds)
        )
      )
  }
}
