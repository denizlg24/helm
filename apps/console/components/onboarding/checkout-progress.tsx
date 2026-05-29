"use client"

import {
  coreModuleIds,
  defaultEnabledModuleIds,
  moduleDefinitions,
} from "@workspace/module-registry"
import type {
  BillingCatalogEntry,
  BillingSummaryResponse,
  PlanId,
} from "@workspace/types"
import { Alert, AlertDescription } from "@workspace/ui/components/alert"
import { Wordmark } from "@workspace/ui/components/auth-shell"
import { Button, buttonVariants } from "@workspace/ui/components/button"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { toast } from "@workspace/ui/components/sonner"
import { cn } from "@workspace/ui/lib/utils"
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckIcon,
  RefreshCwIcon,
} from "lucide-react"
import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"
import { apiClient } from "../../lib/api-client"

const planLabels: Record<PlanId, string> = {
  starter: "Starter plan",
  pro: "Pro plan",
  enterprise: "Enterprise plan",
}

const paidModuleIds: ReadonlySet<string> = new Set(
  moduleDefinitions
    .filter(
      (moduleDefinition) =>
        !coreModuleIds.includes(
          moduleDefinition.id as (typeof coreModuleIds)[number]
        ) &&
        !defaultEnabledModuleIds.includes(
          moduleDefinition.id as (typeof defaultEnabledModuleIds)[number]
        )
    )
    .map((moduleDefinition) => moduleDefinition.id)
)

const formatPrice = (priceUsdCents: number | null | undefined) => {
  if (priceUsdCents === null || priceUsdCents === undefined) {
    return "TBD"
  }
  if (priceUsdCents === 0) {
    return "$0"
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: priceUsdCents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(priceUsdCents / 100)
}

type CheckoutStatus = "enabled" | "pending" | "unavailable"

interface CheckoutItem {
  id: string
  label: string
  detail: string
  productId: string | null
  priceUsdCents: number | null
  status: CheckoutStatus
}

const statusCopy: Record<CheckoutStatus, string> = {
  enabled: "Purchased",
  pending: "Awaiting checkout",
  unavailable: "Unavailable",
}

export function OnboardingCheckoutProgress() {
  const [catalog, setCatalog] = useState<BillingCatalogEntry[]>([])
  const [summary, setSummary] = useState<BillingSummaryResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [checkoutProductId, setCheckoutProductId] = useState<string | null>(
    null
  )

  const selection = useMemo(() => summary?.selection ?? null, [summary])

  const load = useCallback(async (quiet = false) => {
    try {
      if (quiet) {
        setRefreshing(true)
      } else {
        setLoading(true)
      }
      const [currentWorkspace, nextSummary, nextCatalog] = await Promise.all([
        apiClient.workspace.current(),
        apiClient.billing.summary(),
        apiClient.billing.catalog(),
      ])
      if (currentWorkspace.workspace.onboardingCompletedAt) {
        window.location.href = "/"
        return
      }
      setSummary(nextSummary)
      setCatalog(nextCatalog.entries)
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to load checkout state"
      )
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const planEntries = useMemo(
    () =>
      new Map(
        catalog
          .filter((entry) => entry.kind === "plan" && entry.plan)
          .map((entry) => [entry.plan as PlanId, entry])
      ),
    [catalog]
  )

  const moduleEntries = useMemo(
    () =>
      new Map(
        catalog
          .filter((entry) => entry.kind === "module" && entry.moduleId)
          .map((entry) => [entry.moduleId as string, entry])
      ),
    [catalog]
  )

  const productEntries = useMemo(
    () => new Map(catalog.map((entry) => [entry.productId, entry])),
    [catalog]
  )

  const enabledModuleIds = useMemo(
    () => new Set(summary?.enabledModuleIds ?? []),
    [summary]
  )

  const items = useMemo<CheckoutItem[]>(() => {
    if (!summary) {
      return []
    }

    if (!selection) {
      return summary.activeCheckoutSessions.map((session) => {
        const entry = productEntries.get(session.productId)
        return {
          id: `checkout:${session.checkoutId}`,
          label: entry?.name ?? "Active Polar checkout",
          detail: "Checkout session already started",
          productId: session.productId,
          priceUsdCents: entry?.priceUsdCents ?? null,
          status: "pending",
        } satisfies CheckoutItem
      })
    }

    const selectedPlanEntry = planEntries.get(selection.plan)
    const planEnabled =
      selection.plan === "starter" || summary.plan === selection.plan
    const planItem: CheckoutItem = {
      id: `plan:${selection.plan}`,
      label: planLabels[selection.plan],
      detail: "Workspace usage plan",
      productId: selectedPlanEntry?.productId ?? null,
      priceUsdCents: selectedPlanEntry?.priceUsdCents ?? 0,
      status: planEnabled
        ? "enabled"
        : selectedPlanEntry
          ? "pending"
          : "unavailable",
    }

    const moduleItems = selection.moduleIds
      .filter((moduleId) => paidModuleIds.has(moduleId))
      .map((moduleId) => {
        const definition = moduleDefinitions.find(
          (moduleDefinition) => moduleDefinition.id === moduleId
        )
        const entry = moduleEntries.get(moduleId)
        return {
          id: `module:${moduleId}`,
          label: definition?.name ?? moduleId,
          detail: "Paid workspace module",
          productId: entry?.productId ?? null,
          priceUsdCents: entry?.priceUsdCents ?? null,
          status: enabledModuleIds.has(moduleId)
            ? "enabled"
            : entry
              ? "pending"
              : "unavailable",
        } satisfies CheckoutItem
      })

    return [planItem, ...moduleItems]
  }, [
    enabledModuleIds,
    moduleEntries,
    planEntries,
    productEntries,
    selection,
    summary,
  ])

  const pendingItems = items.filter((item) => item.status === "pending")
  const unavailableItems = items.filter((item) => item.status === "unavailable")
  const enabledItems = items.filter((item) => item.status === "enabled")
  const nextItem = pendingItems[0]
  const totalUsdCents = items.reduce(
    (total, item) => total + (item.priceUsdCents ?? 0),
    0
  )

  useEffect(() => {
    if (!summary || pendingItems.length === 0) {
      return
    }

    // Each poll fans out to three endpoints; keep the cadence slow enough to
    // stay clear of the read rate limit while a webhook lands.
    let attempts = 0
    const interval = window.setInterval(() => {
      attempts += 1
      void load(true)
      if (attempts >= 10) {
        window.clearInterval(interval)
      }
    }, 8000)

    return () => window.clearInterval(interval)
  }, [load, summary, pendingItems.length])

  const startCheckout = async () => {
    if (!nextItem?.productId) {
      return
    }

    try {
      setCheckoutProductId(nextItem.productId)
      const checkout = await apiClient.billing.checkout({
        productId: nextItem.productId,
        successUrl: `${window.location.origin}/onboarding/checkout?checkout=return`,
      })
      window.location.href = checkout.url
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to start checkout"
      )
      setCheckoutProductId(null)
    }
  }

  const finishSetup = async () => {
    try {
      await apiClient.workspace.completeOnboarding()
      window.location.href = "/"
    } catch (error) {
      console.error("Failed to complete onboarding:", error)
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to finish setup. Please try again."
      )
    }
  }

  if (loading) {
    return <CheckoutProgressSkeleton />
  }

  if (!selection && items.length === 0) {
    return (
      <main className="min-h-svh bg-background px-6 py-14 text-foreground">
        <div className="mx-auto flex min-h-[70svh] max-w-sm flex-col justify-center gap-6">
          <Wordmark />
          <div className="space-y-2">
            <h1 className="font-medium text-2xl text-foreground tracking-tight">
              Nothing to check out
            </h1>
            <p className="text-balance text-muted-foreground text-sm">
              Select a plan and modules before starting checkout.
            </p>
          </div>
          <Link className={cn(buttonVariants(), "w-fit")} href="/onboarding">
            Back to setup
          </Link>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-svh bg-background text-foreground">
      <div className="mx-auto grid max-w-4xl gap-12 px-6 py-12 lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-16">
        <section className="space-y-10">
          <header className="space-y-5">
            <Wordmark className="flex w-fit" />
            <Link
              className="flex w-fit items-center gap-1.5 text-muted-foreground text-sm transition hover:text-foreground"
              href="/onboarding"
            >
              <ArrowLeftIcon className="size-4" />
              Edit selection
            </Link>
            <div className="space-y-3">
              <h1 className="font-medium text-2xl text-foreground tracking-tight">
                Finish activating Helm
              </h1>
              <p className="max-w-xl text-balance text-muted-foreground text-sm leading-normal">
                Polar handles one subscription checkout at a time. Helm keeps
                the full selection here and marks each item as it becomes
                active.
              </p>
            </div>
          </header>

          <div className="divide-y divide-border border-border border-y">
            {items.map((item, index) => (
              <CheckoutProgressRow
                index={index + 1}
                item={item}
                key={item.id}
                loading={checkoutProductId === item.productId}
              />
            ))}
          </div>

          {unavailableItems.length > 0 ? (
            <Alert>
              <AlertDescription>
                Some selected items are missing from the Polar catalog. Edit the
                selection or create those products before checkout.
              </AlertDescription>
            </Alert>
          ) : null}
        </section>

        <aside className="lg:sticky lg:top-12 lg:h-fit">
          <div className="space-y-6">
            <div>
              <p className="text-muted-foreground text-sm">Monthly total</p>
              <p className="font-medium text-3xl text-foreground tracking-tight">
                {formatPrice(totalUsdCents)}
                <span className="ml-1 font-normal text-muted-foreground text-sm">
                  / month
                </span>
              </p>
              <p className="mt-1 text-muted-foreground text-xs">
                Excl. tax — VAT/sales tax added at checkout.
              </p>
            </div>

            <div className="space-y-3 border-border border-t pt-6 text-sm">
              <StatusLine label="Enabled" value={enabledItems.length} />
              <StatusLine label="Pending" value={pendingItems.length} />
              <StatusLine label="Blocked" value={unavailableItems.length} />
            </div>

            <div className="space-y-3 border-border border-t pt-6">
              {nextItem ? (
                <>
                  <div className="space-y-1">
                    <p className="text-muted-foreground text-xs uppercase tracking-wide">
                      Next checkout
                    </p>
                    <p className="font-medium text-foreground">
                      {nextItem.label}
                    </p>
                    <p className="text-muted-foreground text-sm tabular-nums">
                      {formatPrice(nextItem.priceUsdCents)} / month
                    </p>
                  </div>
                  <Button
                    className="w-full"
                    loading={checkoutProductId === nextItem.productId}
                    onClick={startCheckout}
                    type="button"
                  >
                    Continue with Polar
                    <ArrowRightIcon className="size-4" />
                  </Button>
                </>
              ) : (
                <Button className="w-full" onClick={finishSetup} type="button">
                  Finish setup
                  <CheckIcon className="size-4" />
                </Button>
              )}
              <Button
                className="w-full"
                disabled={refreshing}
                onClick={() => void load(true)}
                type="button"
                variant="ghost"
              >
                <RefreshCwIcon
                  className={cn("size-4", refreshing && "animate-spin")}
                />
                Refresh status
              </Button>
            </div>
          </div>
        </aside>
      </div>
    </main>
  )
}

function CheckoutProgressRow({
  index,
  item,
  loading,
}: {
  index: number
  item: CheckoutItem
  loading: boolean
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-4 py-4 transition",
        loading && "opacity-60"
      )}
    >
      <span
        className={cn(
          "flex size-7 shrink-0 items-center justify-center rounded-full border text-sm tabular-nums",
          item.status === "enabled"
            ? "border-foreground bg-foreground text-background"
            : item.status === "unavailable"
              ? "border-border text-muted-foreground/60"
              : "border-border text-muted-foreground"
        )}
      >
        {item.status === "enabled" ? <CheckIcon className="size-4" /> : index}
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-medium text-foreground text-sm">{item.label}</p>
        <p className="text-muted-foreground text-sm">{item.detail}</p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-foreground text-sm tabular-nums">
          {formatPrice(item.priceUsdCents)}/mo
        </p>
        <p
          className={cn(
            "text-xs",
            item.status === "enabled"
              ? "text-foreground"
              : item.status === "unavailable"
                ? "text-destructive"
                : "text-muted-foreground"
          )}
        >
          {statusCopy[item.status]}
        </p>
      </div>
    </div>
  )
}

function StatusLine({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground tabular-nums">{value}</span>
    </div>
  )
}

function CheckoutProgressSkeleton() {
  return (
    <main className="min-h-svh bg-background px-6 py-12">
      <div className="mx-auto grid max-w-4xl gap-12 lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-16">
        <section className="space-y-8">
          <div className="space-y-3">
            <Skeleton className="h-5 w-16" />
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-full max-w-xl" />
          </div>
          <div className="space-y-4">
            {[1, 2, 3, 4].map((item) => (
              <Skeleton className="h-12 w-full" key={item} />
            ))}
          </div>
        </section>
        <Skeleton className="h-64 w-full" />
      </div>
    </main>
  )
}
