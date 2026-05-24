import { Injectable } from "@nestjs/common"
import { and, db, entitlements, eq, isNull } from "@workspace/db"
import {
  type PlanId,
  type WorkspaceLimits,
  WorkspaceLimitsSchema,
} from "@workspace/types"

export interface ApplyPlanInput {
  tenantId: string
  workspaceId: string
  plan: PlanId
  features: Record<string, boolean>
  limits: WorkspaceLimits
}

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

  async getActivePlan(workspaceId: string): Promise<PlanId | null> {
    const row = await this.getActiveRow(workspaceId)
    if (!row) {
      return null
    }

    return row.plan === "starter" ||
      row.plan === "pro" ||
      row.plan === "enterprise"
      ? row.plan
      : null
  }

  /**
   * Temporal entitlement write: closes the current active row (`validUntil`)
   * and inserts a fresh one. Merges feature flags so module add-ons granted
   * separately are preserved across a plan change unless explicitly removed.
   */
  async applyPlan(input: ApplyPlanInput): Promise<void> {
    const now = new Date()
    await db.transaction(async (tx) => {
      const current = await tx
        .select()
        .from(entitlements)
        .where(
          and(
            eq(entitlements.workspaceId, input.workspaceId),
            isNull(entitlements.validUntil)
          )
        )
        .limit(1)

      const previousFeatures = (current[0]?.featuresJson ?? {}) as Record<
        string,
        unknown
      >

      await tx
        .update(entitlements)
        .set({ validUntil: now })
        .where(
          and(
            eq(entitlements.workspaceId, input.workspaceId),
            isNull(entitlements.validUntil)
          )
        )

      await tx.insert(entitlements).values({
        id: crypto.randomUUID(),
        tenantId: input.tenantId,
        workspaceId: input.workspaceId,
        plan: input.plan,
        featuresJson: { ...previousFeatures, ...input.features },
        limitsJson: input.limits,
        validFrom: now,
      })
    })
  }

  /**
   * Merge additional feature flags into the active entitlement row without
   * changing the plan — used by module-expansion add-ons.
   */
  async addFeatures(
    workspaceId: string,
    features: Record<string, boolean>
  ): Promise<void> {
    const row = await this.getActiveRow(workspaceId)
    if (!row) {
      return
    }
    await db
      .update(entitlements)
      .set({ featuresJson: { ...row.featuresJson, ...features } })
      .where(eq(entitlements.id, row.id))
  }
}
