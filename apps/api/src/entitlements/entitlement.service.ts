import { Injectable } from "@nestjs/common"
import { and, db, entitlements, eq, isNull } from "@workspace/db"

@Injectable()
export class EntitlementService {
  async getWorkspaceEntitlements(workspaceId: string) {
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

    return rows[0]?.featuresJson ?? {}
  }

  async hasFeature(workspaceId: string, feature: string) {
    const entitlementsJson = await this.getWorkspaceEntitlements(workspaceId)
    return Boolean(entitlementsJson[feature])
  }
}
