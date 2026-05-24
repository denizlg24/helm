import { Injectable } from "@nestjs/common"
import { db, eq, onboardingSelections } from "@workspace/db"
import type {
  OnboardingSelection,
  PlanId,
  SetOnboardingSelectionInput,
} from "@workspace/types"
import { PlanIdSchema } from "@workspace/types"

interface SelectionContext {
  workspaceId: string
  tenantId: string
}

@Injectable()
export class OnboardingSelectionService {
  async get(workspaceId: string): Promise<OnboardingSelection | null> {
    const rows = await db
      .select({
        plan: onboardingSelections.plan,
        moduleIds: onboardingSelections.moduleIds,
      })
      .from(onboardingSelections)
      .where(eq(onboardingSelections.workspaceId, workspaceId))
      .limit(1)

    const row = rows[0]
    if (!row) {
      return null
    }
    return {
      plan: PlanIdSchema.catch("starter").parse(row.plan),
      moduleIds: row.moduleIds,
    }
  }

  // Idempotent: re-running "continue to checkout" upserts the single
  // per-workspace row instead of creating duplicate sessions.
  async upsert(
    context: SelectionContext,
    input: SetOnboardingSelectionInput
  ): Promise<OnboardingSelection> {
    const now = new Date()
    const plan: PlanId = input.plan
    const moduleIds = [...new Set(input.moduleIds)]

    await db
      .insert(onboardingSelections)
      .values({
        id: crypto.randomUUID(),
        tenantId: context.tenantId,
        workspaceId: context.workspaceId,
        plan,
        moduleIds,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: onboardingSelections.workspaceId,
        set: { plan, moduleIds, updatedAt: now },
      })

    return { plan, moduleIds }
  }

  async clear(workspaceId: string): Promise<void> {
    await db
      .delete(onboardingSelections)
      .where(eq(onboardingSelections.workspaceId, workspaceId))
  }
}
