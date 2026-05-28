import { HttpException, HttpStatus, Injectable } from "@nestjs/common"
import {
  and,
  count,
  db,
  eq,
  gte,
  llmUsage,
  lt,
  sum,
  usageCredits,
} from "@workspace/db"
import {
  type AuthContext,
  type GrantUsageCreditInput,
  type RecordLlmUsageInput,
  type UsageBreakdownResponse,
  type UsageFeature,
  UsageFeatureSchema,
  type UsageSummary,
} from "@workspace/types"
// biome-ignore lint/style/useImportType: Nest DI needs runtime metadata.
import { AuditService } from "../audit/audit.service"
// biome-ignore lint/style/useImportType: Nest DI needs runtime metadata.
import { EntitlementService } from "../entitlements/entitlement.service"

interface MonthBounds {
  start: Date
  end: Date
}

interface MonthlyAggregate {
  costUsdCents: number
  requestCount: number
  inputTokens: number
  outputTokens: number
}

const toInt = (value: unknown): number => {
  const parsed = typeof value === "number" ? value : Number(value)
  return Number.isFinite(parsed) ? Math.trunc(parsed) : 0
}

@Injectable()
export class UsageService {
  constructor(
    private readonly entitlementService: EntitlementService,
    private readonly auditService: AuditService
  ) {}

  private parseFeature(value: string | null): UsageFeature | null {
    if (value === null) return null
    const parsed = UsageFeatureSchema.safeParse(value)
    return parsed.success ? parsed.data : "other"
  }

  private monthBounds(now: Date = new Date()): MonthBounds {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
    const end = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)
    )
    return { start, end }
  }

  private async getMonthlyAggregate(
    workspaceId: string,
    bounds: MonthBounds
  ): Promise<MonthlyAggregate> {
    const rows = await db
      .select({
        cost: sum(llmUsage.costUsdCents),
        input: sum(llmUsage.inputTokens),
        output: sum(llmUsage.outputTokens),
        requests: count(),
      })
      .from(llmUsage)
      .where(
        and(
          eq(llmUsage.workspaceId, workspaceId),
          gte(llmUsage.createdAt, bounds.start),
          lt(llmUsage.createdAt, bounds.end)
        )
      )

    const row = rows[0]
    return {
      costUsdCents: toInt(row?.cost),
      inputTokens: toInt(row?.input),
      outputTokens: toInt(row?.output),
      requestCount: toInt(row?.requests),
    }
  }

  private async getMonthCostUsdCents(
    workspaceId: string,
    bounds: MonthBounds
  ): Promise<number> {
    const rows = await db
      .select({ cost: sum(llmUsage.costUsdCents) })
      .from(llmUsage)
      .where(
        and(
          eq(llmUsage.workspaceId, workspaceId),
          gte(llmUsage.createdAt, bounds.start),
          lt(llmUsage.createdAt, bounds.end)
        )
      )

    return toInt(rows[0]?.cost)
  }

  async getCreditBalanceUsdCents(workspaceId: string): Promise<number> {
    const rows = await db
      .select({ balance: sum(usageCredits.amountUsdCents) })
      .from(usageCredits)
      .where(eq(usageCredits.workspaceId, workspaceId))

    return toInt(rows[0]?.balance)
  }

  async getMonthlySummary(workspaceId: string): Promise<UsageSummary> {
    const bounds = this.monthBounds()
    const [aggregate, limits, creditBalance] = await Promise.all([
      this.getMonthlyAggregate(workspaceId, bounds),
      this.entitlementService.getWorkspaceLimits(workspaceId),
      this.getCreditBalanceUsdCents(workspaceId),
    ])

    const allowance = limits.llmCostUsdCentsPerMonth ?? null
    const allowanceUsed =
      allowance === null ? 0 : Math.min(aggregate.costUsdCents, allowance)
    const creditsUsed =
      allowance === null ? 0 : Math.max(0, aggregate.costUsdCents - allowance)
    const monthRemainingAllowance =
      allowance === null ? null : Math.max(0, allowance - allowanceUsed)
    const totalRemaining =
      monthRemainingAllowance === null
        ? null
        : monthRemainingAllowance + Math.max(0, creditBalance)

    return {
      periodStart: bounds.start,
      periodEnd: bounds.end,
      monthlyAllowanceUsdCents: allowance,
      monthCostUsdCents: aggregate.costUsdCents,
      monthAllowanceUsedUsdCents: allowanceUsed,
      monthCreditsUsedUsdCents: creditsUsed,
      monthRemainingAllowanceUsdCents: monthRemainingAllowance,
      creditBalanceUsdCents: creditBalance,
      totalRemainingUsdCents: totalRemaining,
      requestCount: aggregate.requestCount,
      inputTokens: aggregate.inputTokens,
      outputTokens: aggregate.outputTokens,
    }
  }

  async getMonthlyBreakdown(
    workspaceId: string
  ): Promise<UsageBreakdownResponse> {
    const bounds = this.monthBounds()
    const rows = await db
      .select({
        feature: llmUsage.feature,
        provider: llmUsage.provider,
        model: llmUsage.model,
        requests: count(),
        input: sum(llmUsage.inputTokens),
        output: sum(llmUsage.outputTokens),
        cost: sum(llmUsage.costUsdCents),
      })
      .from(llmUsage)
      .where(
        and(
          eq(llmUsage.workspaceId, workspaceId),
          gte(llmUsage.createdAt, bounds.start),
          lt(llmUsage.createdAt, bounds.end)
        )
      )
      .groupBy(llmUsage.feature, llmUsage.provider, llmUsage.model)

    const entries = rows
      .map((row) => ({
        feature: this.parseFeature(row.feature),
        provider: row.provider,
        model: row.model,
        requestCount: toInt(row.requests),
        inputTokens: toInt(row.input),
        outputTokens: toInt(row.output),
        costUsdCents: toInt(row.cost),
      }))
      .sort((a, b) => b.costUsdCents - a.costUsdCents)

    return {
      periodStart: bounds.start,
      periodEnd: bounds.end,
      entries,
    }
  }

  async assertWithinBudget(workspaceId: string): Promise<void> {
    const bounds = this.monthBounds()
    const limits = await this.entitlementService.getWorkspaceLimits(workspaceId)
    const allowance = limits.llmCostUsdCentsPerMonth
    if (allowance === undefined) {
      return
    }

    const monthCost = await this.getMonthCostUsdCents(workspaceId, bounds)
    if (monthCost < allowance) {
      return
    }

    const creditBalance = await this.getCreditBalanceUsdCents(workspaceId)
    if (creditBalance > 0) {
      return
    }

    throw new HttpException(
      {
        code: "USAGE_LIMIT_EXCEEDED",
        message: "Monthly usage allowance exhausted and no credits remaining",
      },
      HttpStatus.PAYMENT_REQUIRED
    )
  }

  async recordUsage(
    authContext: AuthContext,
    input: RecordLlmUsageInput
  ): Promise<string> {
    const bounds = this.monthBounds()
    const limits = await this.entitlementService.getWorkspaceLimits(
      authContext.workspaceId
    )
    const allowance = limits.llmCostUsdCentsPerMonth
    const cost = input.costUsdCents
    const usageId = crypto.randomUUID()

    await db.transaction(
      async (tx) => {
        const monthCostBefore =
          allowance !== undefined && cost > 0
            ? await this.getMonthCostUsdCentsInTx(
                tx,
                authContext.workspaceId,
                bounds
              )
            : 0

        let debit = 0
        if (allowance !== undefined && cost > 0) {
          const overflowBefore = Math.max(0, monthCostBefore - allowance)
          const overflowAfter = Math.max(0, monthCostBefore + cost - allowance)
          debit = overflowAfter - overflowBefore
        }

        await tx.insert(llmUsage).values({
          id: usageId,
          tenantId: authContext.tenantId,
          workspaceId: authContext.workspaceId,
          userId: input.userId ?? authContext.userId,
          provider: input.provider,
          model: input.model,
          feature: input.feature ?? null,
          inputTokens: input.inputTokens,
          outputTokens: input.outputTokens,
          costUsdCents: Math.round(cost),
        })

        if (debit > 0) {
          await tx.insert(usageCredits).values({
            id: crypto.randomUUID(),
            tenantId: authContext.tenantId,
            workspaceId: authContext.workspaceId,
            entryType: "debit",
            source: "usage",
            sourceRef: usageId,
            amountUsdCents: Math.round(-debit),
          })
        }
      },
      {
        isolationLevel: "serializable",
      }
    )

    return usageId
  }

  private async getMonthCostUsdCentsInTx(
    tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
    workspaceId: string,
    bounds: MonthBounds
  ): Promise<number> {
    const rows = await tx
      .select({ cost: sum(llmUsage.costUsdCents) })
      .from(llmUsage)
      .where(
        and(
          eq(llmUsage.workspaceId, workspaceId),
          gte(llmUsage.createdAt, bounds.start),
          lt(llmUsage.createdAt, bounds.end)
        )
      )

    return toInt(rows[0]?.cost)
  }

  private async insertGrant(
    context: { tenantId: string; workspaceId: string },
    input: GrantUsageCreditInput
  ): Promise<boolean> {
    const insertResult = await db
      .insert(usageCredits)
      .values({
        id: crypto.randomUUID(),
        tenantId: context.tenantId,
        workspaceId: context.workspaceId,
        entryType: "grant",
        source: input.source,
        sourceRef: input.sourceRef,
        amountUsdCents: input.amountUsdCents,
        note: input.note,
      })
      .onConflictDoNothing({
        target: [usageCredits.source, usageCredits.sourceRef],
      })

    return Boolean(insertResult.rowCount && insertResult.rowCount > 0)
  }

  async grant(
    authContext: AuthContext,
    input: GrantUsageCreditInput
  ): Promise<number> {
    const granted = await this.insertGrant(authContext, input)

    if (granted) {
      await this.auditService.write(authContext, {
        action: "usage.credit.grant",
        resourceType: "usage_credit",
        resourceId: input.sourceRef,
        metadataJson: {
          amountUsdCents: input.amountUsdCents,
          source: input.source,
        },
      })
    }

    return this.getCreditBalanceUsdCents(authContext.workspaceId)
  }

  /**
   * Grant credits with no user actor — used by the Polar webhook for one-time
   * token top-ups. Idempotent on `(source, sourceRef)`.
   */
  async grantSystem(
    context: { tenantId: string; workspaceId: string },
    input: GrantUsageCreditInput
  ): Promise<number> {
    const granted = await this.insertGrant(context, input)

    if (granted) {
      await this.auditService.writeSystem(context, {
        action: "usage.credit.grant",
        resourceType: "usage_credit",
        resourceId: input.sourceRef,
        metadataJson: {
          amountUsdCents: input.amountUsdCents,
          source: input.source,
        },
      })
    }

    return this.getCreditBalanceUsdCents(context.workspaceId)
  }
}
