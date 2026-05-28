"use client"

import type {
  BillingCatalogEntry,
  UsageBreakdownEntry,
  UsageBreakdownResponse,
  UsageFeature,
  UsageSummary,
} from "@workspace/types"
import { Alert, AlertDescription } from "@workspace/ui/components/alert"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Progress } from "@workspace/ui/components/progress"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { toast } from "@workspace/ui/components/sonner"
import { cn } from "@workspace/ui/lib/utils"
import {
  ArrowUpRightIcon,
  ChevronDownIcon,
  SparklesIcon,
  ZapIcon,
} from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { apiClient } from "../../lib/api-client"
import {
  formatInt,
  formatMonth,
  formatUsdCents,
  formatUsdCentsCompact,
} from "../../lib/format"

interface LoadedState {
  summary: UsageSummary
  credits: BillingCatalogEntry[]
}

const FEATURE_LABELS: Record<UsageFeature, string> = {
  assistant: "Assistant",
  onboarding: "Onboarding",
  embeddings: "Embeddings",
  email_triage: "Email triage",
  note_summarize: "Note summarize",
  other: "Other",
}

const formatFeature = (feature: UsageFeature | null): string =>
  feature ? FEATURE_LABELS[feature] : "Untagged"

export function UsageBillingSection() {
  const [state, setState] = useState<LoadedState | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pendingProductId, setPendingProductId] = useState<string | null>(null)
  const [showBreakdown, setShowBreakdown] = useState(false)
  const [breakdown, setBreakdown] = useState<UsageBreakdownResponse | null>(
    null
  )
  const [breakdownLoading, setBreakdownLoading] = useState(false)
  const [breakdownError, setBreakdownError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [summary, catalog] = await Promise.all([
        apiClient.usage.summary(),
        apiClient.billing.catalog(),
      ])
      const credits = catalog.entries
        .filter((entry) => entry.kind === "credits")
        .sort(
          (a, b) =>
            (a.priceUsdCents ?? Number.POSITIVE_INFINITY) -
            (b.priceUsdCents ?? Number.POSITIVE_INFINITY)
        )
      setState({ summary, credits })
    } catch (loadError) {
      const message =
        loadError instanceof Error
          ? loadError.message
          : "Could not load usage details."
      setError(message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const loadBreakdown = useCallback(async () => {
    setBreakdownLoading(true)
    setBreakdownError(null)
    try {
      setBreakdown(await apiClient.usage.breakdown())
    } catch (loadError) {
      setBreakdownError(
        loadError instanceof Error
          ? loadError.message
          : "Could not load breakdown."
      )
    } finally {
      setBreakdownLoading(false)
    }
  }, [])

  const toggleBreakdown = useCallback(() => {
    setShowBreakdown((prev) => {
      const next = !prev
      if (next && !breakdown && !breakdownLoading) {
        void loadBreakdown()
      }
      return next
    })
  }, [breakdown, breakdownLoading, loadBreakdown])

  const handleTopUp = useCallback(async (productId: string) => {
    setPendingProductId(productId)
    try {
      const session = await apiClient.billing.checkout({ productId })
      window.location.href = session.url
    } catch (checkoutError) {
      const message =
        checkoutError instanceof Error
          ? checkoutError.message
          : "Could not start checkout."
      toast.error(message)
      setPendingProductId(null)
    }
  }, [])

  if (loading && !state) {
    return <UsageSkeleton />
  }

  if (error && !state) {
    return (
      <div className="space-y-6">
        <SectionHeader
          title="Usage & top-up"
          description="Track AI spend against your monthly allowance and add credits when you need more."
        />
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
        <Button variant="outline" onClick={() => void load()}>
          Try again
        </Button>
      </div>
    )
  }

  if (!state) {
    return null
  }

  const { summary, credits } = state
  const allowance = summary.monthlyAllowanceUsdCents
  const hasAllowance = allowance !== null
  const used = summary.monthCostUsdCents
  const creditBalance = Math.max(0, summary.creditBalanceUsdCents)
  const creditsUsed = summary.monthCreditsUsedUsdCents
  const remainingAllowance = summary.monthRemainingAllowanceUsdCents ?? 0
  const totalRemaining = summary.totalRemainingUsdCents
  const hasCredits = creditBalance > 0 || creditsUsed > 0
  // Capacity = monthly allowance + credits available this period (the leftover
  // balance plus what's already been consumed from credits).
  const capacity = (hasAllowance ? allowance : 0) + creditBalance + creditsUsed
  const usedPct = capacity > 0 ? Math.min(100, (used / capacity) * 100) : 0
  const tickPct =
    hasAllowance && capacity > 0 ? (allowance / capacity) * 100 : null
  const allowanceExhausted = hasAllowance && used >= allowance
  const lowCredits = allowanceExhausted && creditBalance < 100

  const periodStart = new Date(summary.periodStart)

  return (
    <div className="space-y-10">
      <SectionHeader
        title="Usage & top-up"
        description="Track AI spend against your monthly allowance and add credits when you need more."
        meta={formatMonth(periodStart)}
      />

      {lowCredits ? (
        <Alert variant="destructive">
          <AlertDescription>
            Monthly allowance exhausted and credit balance is low. Top up to
            keep the assistant available.
          </AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardDescription>This month</CardDescription>
          <CardTitle className="font-semibold text-3xl tabular-nums tracking-tight">
            {formatUsdCents(used)}
            <span className="ml-2 font-normal text-base text-muted-foreground">
              {hasAllowance ? (
                <>
                  of {formatUsdCents(allowance)} allowance
                  {hasCredits ? (
                    <>
                      {" + "}
                      {formatUsdCents(creditBalance + creditsUsed)} credits
                    </>
                  ) : null}
                </>
              ) : hasCredits ? (
                <>of {formatUsdCents(creditBalance + creditsUsed)} credits</>
              ) : (
                "no allowance configured"
              )}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {capacity > 0 ? (
            <div className="space-y-2">
              <div className="relative">
                <Progress value={usedPct} className="h-2 bg-background!" />
                {tickPct !== null && tickPct > 0 && tickPct < 100 ? (
                  <span
                    aria-hidden
                    className="absolute top-0 h-2 w-px bg-foreground/40"
                    style={{ left: `${tickPct}%` }}
                  />
                ) : null}
              </div>
              <div className="flex items-center justify-between text-muted-foreground text-xs">
                <span>{Math.round(usedPct)}% used</span>
                <span>
                  {hasAllowance ? (
                    <>
                      {formatUsdCents(remainingAllowance)} allowance left
                      {creditBalance > 0
                        ? ` · ${formatUsdCents(creditBalance)} credits`
                        : ""}
                    </>
                  ) : (
                    <>{formatUsdCents(creditBalance)} credits remaining</>
                  )}
                </span>
              </div>
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">
              Your plan does not include a monthly AI allowance. Add credits
              below to enable the assistant.
            </p>
          )}

          <dl className="grid grid-cols-2 gap-x-6 gap-y-4 border-t pt-4 text-sm sm:grid-cols-4">
            <Stat
              label="Credit balance"
              value={formatUsdCents(creditBalance)}
            />
            <Stat
              label="Total remaining"
              value={
                totalRemaining === null ? "—" : formatUsdCents(totalRemaining)
              }
            />
            <Stat label="Requests" value={formatInt(summary.requestCount)} />
            <Stat
              label="Tokens"
              value={`${formatInt(summary.inputTokens)} in · ${formatInt(summary.outputTokens)} out`}
            />
          </dl>
        </CardContent>
      </Card>

      <BreakdownSection
        open={showBreakdown}
        onToggle={toggleBreakdown}
        loading={breakdownLoading}
        error={breakdownError}
        data={breakdown}
        onRetry={loadBreakdown}
      />

      <section className="space-y-4">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="font-semibold text-lg tracking-tight">
              Top up credits
            </h2>
            <p className="text-muted-foreground text-sm">
              One-time purchases. Credits stack on top of your monthly allowance
              and never expire.
            </p>
          </div>
        </div>

        {credits.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-10 text-center text-muted-foreground text-sm">
              No top-up products available right now.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {credits.map((entry) => (
              <CreditOption
                key={entry.productId}
                entry={entry}
                pending={pendingProductId === entry.productId}
                disabled={pendingProductId !== null}
                onBuy={() => void handleTopUp(entry.productId)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function BreakdownSection({
  open,
  onToggle,
  loading,
  error,
  data,
  onRetry,
}: {
  open: boolean
  onToggle: () => void
  loading: boolean
  error: string | null
  data: UsageBreakdownResponse | null
  onRetry: () => void
}) {
  return (
    <section className="space-y-3">
      <button
        type="button"
        onClick={onToggle}
        className="flex items-center gap-1.5 font-medium text-muted-foreground text-sm transition-colors hover:text-foreground"
        aria-expanded={open}
      >
        <ChevronDownIcon
          className={cn(
            "size-3.5 transition-transform",
            open ? "rotate-0" : "-rotate-90"
          )}
        />
        Show detailed breakdown
      </button>

      {open ? (
        <div className="space-y-3">
          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          ) : error ? (
            <div className="space-y-2 text-sm">
              <p className="text-destructive">{error}</p>
              <button
                type="button"
                onClick={onRetry}
                className="text-muted-foreground underline-offset-4 hover:underline"
              >
                Try again
              </button>
            </div>
          ) : data && data.entries.length > 0 ? (
            <BreakdownTable entries={data.entries} />
          ) : (
            <p className="text-muted-foreground text-sm">
              No usage recorded yet this month.
            </p>
          )}
        </div>
      ) : null}
    </section>
  )
}

function BreakdownTable({ entries }: { entries: UsageBreakdownEntry[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-muted-foreground text-xs uppercase tracking-wider">
            <th className="py-2 pr-4 font-normal">Feature</th>
            <th className="py-2 pr-4 font-normal">Model</th>
            <th className="py-2 pr-4 text-right font-normal">Requests</th>
            <th className="py-2 pr-4 text-right font-normal">Tokens</th>
            <th className="py-2 text-right font-normal">Cost</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60">
          {entries.map((entry) => (
            <tr
              key={`${entry.feature ?? "_"}-${entry.provider}-${entry.model}`}
            >
              <td className="py-2 pr-4 font-medium">
                {formatFeature(entry.feature)}
              </td>
              <td className="py-2 pr-4 text-muted-foreground">{entry.model}</td>
              <td className="py-2 pr-4 text-right tabular-nums">
                {formatInt(entry.requestCount)}
              </td>
              <td className="py-2 pr-4 text-right text-muted-foreground tabular-nums">
                {formatInt(entry.inputTokens)} / {formatInt(entry.outputTokens)}
              </td>
              <td className="py-2 text-right font-medium tabular-nums">
                {formatUsdCents(entry.costUsdCents)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function SectionHeader({
  title,
  description,
  meta,
}: {
  title: string
  description: string
  meta?: string
}) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="font-semibold text-2xl tracking-tight">{title}</h1>
        {meta ? (
          <Badge variant="secondary" className="font-normal">
            {meta}
          </Badge>
        ) : null}
      </div>
      <p className="max-w-2xl text-muted-foreground text-sm">{description}</p>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <dt className="text-muted-foreground text-xs uppercase tracking-wider">
        {label}
      </dt>
      <dd className="font-medium tabular-nums">{value}</dd>
    </div>
  )
}

function CreditOption({
  entry,
  pending,
  disabled,
  onBuy,
}: {
  entry: BillingCatalogEntry
  pending: boolean
  disabled: boolean
  onBuy: () => void
}) {
  return (
    <Card className={cn("flex flex-col", pending && "ring-2 ring-primary")}>
      <CardHeader>
        <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wider">
          <SparklesIcon className="size-3.5" />
          Credits
        </div>
        <CardTitle className="font-semibold text-xl tracking-tight">
          {entry.name}
        </CardTitle>
        <CardDescription className="flex items-baseline gap-1">
          <span className="font-semibold text-2xl text-foreground tabular-nums">
            {formatUsdCentsCompact(entry.priceUsdCents)}
          </span>
          <span>one-time</span>
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-1 text-muted-foreground text-sm">
        <p className="flex items-start gap-2">
          <ZapIcon className="mt-0.5 size-4 shrink-0" />
          Adds {formatUsdCentsCompact(entry.priceUsdCents)} of AI usage on top
          of your monthly allowance.
        </p>
      </CardContent>
      <CardFooter>
        <Button
          className="w-full"
          onClick={onBuy}
          disabled={disabled}
          aria-busy={pending}
        >
          {pending ? "Redirecting…" : "Buy"}
          {pending ? null : <ArrowUpRightIcon className="size-4" />}
        </Button>
      </CardFooter>
    </Card>
  )
}

function UsageSkeleton() {
  return (
    <div className="space-y-10">
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-80" />
      </div>
      <Card>
        <CardHeader>
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-8 w-56" />
        </CardHeader>
        <CardContent className="space-y-6">
          <Skeleton className="h-2 w-full" />
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
          </div>
        </CardContent>
      </Card>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Skeleton className="h-48" />
        <Skeleton className="h-48" />
        <Skeleton className="h-48" />
      </div>
    </div>
  )
}
