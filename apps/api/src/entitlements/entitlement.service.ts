import { Injectable } from "@nestjs/common"
import { and, db, entitlements, eq, isNull } from "@workspace/db"
import { type WorkspaceLimits, WorkspaceLimitsSchema } from "@workspace/types"

@Injectable()
export class EntitlementService {
  private async getActiveRow(workspaceId: string) {
    const rows = await db
      .select()
      .from(entitlements)
      .where(
        and(
          eq(entitlements.workspaceId, workspaceId),
          isNull(entitlements.validUntil)
        )
      )
      .limit(1)

    return rows[0]
  }

  async getWorkspaceEntitlements(workspaceId: string) {
    const row = await this.getActiveRow(workspaceId)
    return row?.featuresJson ?? {}
  }

  async getWorkspaceLimits(workspaceId: string): Promise<WorkspaceLimits> {
    const row = await this.getActiveRow(workspaceId)
    const parsed = WorkspaceLimitsSchema.safeParse(row?.limitsJson ?? {})
    if (!parsed.success) {
      throw new Error(
        `Invalid persisted limits for workspace ${workspaceId}: ${parsed.error.toString()}`
      )
    }
    return parsed.data
  }

  async hasFeature(workspaceId: string, feature: string) {
    const entitlementsJson = await this.getWorkspaceEntitlements(workspaceId)
    return Boolean(entitlementsJson[feature])
  }
}
