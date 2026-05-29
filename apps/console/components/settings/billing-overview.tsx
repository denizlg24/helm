"use client"

import { moduleDefinitionById } from "@workspace/module-registry"
import type {
  BillingCatalogEntry,
  BillingSummaryResponse,
  PlanId,
  Subscription,
} from "@workspace/types"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@workspace/ui/components/accordion"
import { Alert, AlertDescription } from "@workspace/ui/components/alert"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@workspace/ui/components/alert-dialog"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { toast } from "@workspace/ui/components/sonner"
import { cn } from "@workspace/ui/lib/utils"
import {
  ArrowUpRightIcon,
  CheckIcon,
  ExternalLinkIcon,
  SparklesIcon,
} from "lucide-react"
import Link from "next/link"
import { useCallback, useEffect, useState } from "react"
import { apiClient } from "../../lib/api-client"

const planOrder: readonly PlanId[] = ["starter", "pro", "enterprise"]

const planLabels: Record<PlanId, string> = {
  starter: "Starter",
  pro: "Pro",
  enterprise: "Enterprise",
}

const planCopy: Record<
  PlanId,
  {
    tagline: string
    allowance: string
    rpm: string
    features: readonly string[]
  }
> = {
  starter: {
    tagline: "Get your daily operating system online.",
    allowance: "$0.50 AI / mo",
    rpm: "60 requests / min",
    features: [
      "Core dashboard, Kanban, Calendar, Pomodoro",
      "1 desktop device",
      "Email + assistant on light usage",
    ],
  },
  pro: {
    tagline: "Heavier assistant use and a fuller command center.",
    allowance: "$20 AI / mo",
    rpm: "240 requests / min",
    features: [
      "Everything in Starter",
      "Higher rate limits across the workspace",
      "All paid modules eligible",
    ],
  },
  enterprise: {
    tagline: "Intensive usage, publishing, and larger workflows.",
    allowance: "$250 AI / mo",
    rpm: "600 requests / min",
    features: [
      "Everything in Pro",
      "Top monthly AI allowance",
      "Publish modules and high-volume jobs",
    ],
  },
}

const statusVariants: Record<
  Subscription["status"],
  { label: string; tone: "default" | "secondary" | "destructive" | "outline" }
> = {
  active: { label: "Active", tone: "default" },
  trialing: { label: "Trialing", tone: "secondary" },
  past_due: { label: "Past due", tone: "destructive" },
  canceled: { label: "Canceled", tone: "outline" },
  incomplete: { label: "Incomplete", tone: "destructive" },
  unpaid: { label: "Unpaid", tone: "destructive" },
}

const formatRenewal = (date: Date | null | undefined): string | null => {
  if (!date) return null
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

const formatUsd = (priceUsdCents: number | null | undefined): string => {
  if (priceUsdCents === null || priceUsdCents === undefined) return "—"
  if (priceUsdCents === 0) return "$0"
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: priceUsdCents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(priceUsdCents / 100)
}

const TAX_FOOTNOTE = "Plus applicable VAT/sales tax, calculated at checkout."

const moduleSubscriptionLabel = (subscription: Subscription): string => {
  if (subscription.moduleId) {
    const definition = moduleDefinitionById.get(subscription.moduleId)
    if (definition) return definition.name
    return subscription.moduleId
  }
  return "Module"
}

const planRank = (plan: PlanId) => planOrder.indexOf(plan)

interface SpendModuleLine {
  id: string
  label: string
  priceUsdCents: number | null
  taxUsdCents: number | null
  hint?: string
}

type PlanAction =
  | { kind: "current" }
  | { kind: "subscribe"; entry: BillingCatalogEntry }
  | { kind: "upgrade"; entry: BillingCatalogEntry }
  | { kind: "switch"; entry: BillingCatalogEntry }
  | { kind: "downgrade-to-starter" }
  | { kind: "unavailable" }

export function BillingOverviewSection() {
  const [summary, setSummary] = useState<BillingSummaryResponse | null>(null)
  const [catalog, setCatalog] = useState<BillingCatalogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [portalPending, setPortalPending] = useState(false)
  const [pendingProductId, setPendingProductId] = useState<string | null>(null)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [downgradeOpen, setDowngradeOpen] = useState(false)
  const [moduleManageSubscription, setModuleManageSubscription] =
    useState<Subscription | null>(null)
  const [pendingPlanChange, setPendingPlanChange] = useState<{
    entry: BillingCatalogEntry
    direction: "upgrade" | "switch"
  } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [nextSummary, nextCatalog] = await Promise.all([
        apiClient.billing.summary(),
        apiClient.billing.catalog(),
      ])
      setSummary(nextSummary)
      setCatalog(nextCatalog.entries)
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Could not load billing details."
      )
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const reloadWhenVisible = () => {
      if (document.visibilityState === "visible") void load()
    }
    window.addEventListener("focus", reloadWhenVisible)
    document.addEventListener("visibilitychange", reloadWhenVisible)
    return () => {
      window.removeEventListener("focus", reloadWhenVisible)
      document.removeEventListener("visibilitychange", reloadWhenVisible)
    }
  }, [load])

  // Surface the resume path that bypasses Polar checkout when a canceled but
  // still-revivable subscription gets re-activated server-side.
  useEffect(() => {
    if (typeof window === "undefined") return
    const params = new URLSearchParams(window.location.search)
    if (params.has("resumed")) {
      toast.success("Plan resumed — no new checkout needed.")
      params.delete("resumed")
      const next = params.toString()
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}${next ? `?${next}` : ""}`
      )
    }
  }, [])

  const handlePortal = useCallback(async () => {
    setPortalPending(true)
    try {
      const response = await apiClient.billing.openPortal()
      window.location.href = response.url
    } catch (portalError) {
      toast.error(
        portalError instanceof Error
          ? portalError.message
          : "Could not open billing portal."
      )
      setPortalPending(false)
    }
  }, [])

  const handlePlanCheckout = useCallback(async (entry: BillingCatalogEntry) => {
    setPendingProductId(entry.productId)
    try {
      const successUrl = `${window.location.origin}/checkout/return?checkout_id={CHECKOUT_ID}&from=billing&product=${encodeURIComponent(entry.name)}`
      const session = await apiClient.billing.checkout({
        productId: entry.productId,
        successUrl,
      })
      window.location.href = session.url
    } catch (checkoutError) {
      toast.error(
        checkoutError instanceof Error
          ? checkoutError.message
          : "Could not start checkout."
      )
      setPendingProductId(null)
    }
  }, [])

  if (loading && !summary) {
    return (
      <div className="space-y-10">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-40" />
        <Skeleton className="h-72" />
      </div>
    )
  }

  if (error && !summary) {
    return (
      <div className="space-y-6">
        <Header />
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
        <Button onClick={() => void load()} variant="outline">
          Try again
        </Button>
      </div>
    )
  }

  if (!summary) return null

  const planSubscription = summary.subscriptions.find(
    (subscription) =>
      subscription.productKind === "plan" &&
      subscription.status !== "canceled" &&
      subscription.status !== "incomplete"
  )
  const moduleSubscriptions = summary.subscriptions.filter(
    (subscription) =>
      subscription.productKind === "module" &&
      subscription.status !== "canceled" &&
      subscription.status !== "incomplete"
  )

  const productPrices = new Map<string, number | null>(
    catalog.map((entry) => [entry.productId, entry.priceUsdCents])
  )
  const planEntries = new Map<PlanId, BillingCatalogEntry>(
    catalog
      .filter(
        (entry): entry is BillingCatalogEntry & { plan: PlanId } =>
          entry.kind === "plan" &&
          entry.plan !== null &&
          entry.plan !== undefined
      )
      .map((entry) => [entry.plan, entry])
  )
  const currentPlanEntry = planEntries.get(summary.plan)
  const currentPlanPrice = currentPlanEntry?.priceUsdCents ?? 0
  const planRenewal = formatRenewal(planSubscription?.currentPeriodEnd ?? null)

  const moduleSpendLines: SpendModuleLine[] = moduleSubscriptions.map(
    (subscription) => ({
      id: subscription.id,
      label: moduleSubscriptionLabel(subscription),
      priceUsdCents:
        subscription.subtotalUsdCents ??
        (subscription.polarProductId
          ? (productPrices.get(subscription.polarProductId) ?? null)
          : null),
      taxUsdCents: subscription.taxUsdCents ?? null,
      hint: subscription.cancelAtPeriodEnd
        ? `Ends ${formatRenewal(subscription.currentPeriodEnd) ?? "soon"}`
        : undefined,
    })
  )
  const moduleSpendTotal = moduleSpendLines.reduce(
    (total, line) => total + (line.priceUsdCents ?? 0),
    0
  )
  const monthlyTotal = currentPlanPrice + moduleSpendTotal
  const onPaidPlan = summary.plan !== "starter"

  const taxBearingSubs: Subscription[] = [
    ...(planSubscription ? [planSubscription] : []),
    ...moduleSubscriptions,
  ]
  const totalTaxCents = taxBearingSubs.reduce(
    (sum, sub) => sum + (sub.taxUsdCents ?? 0),
    0
  )
  const anyTaxKnown = taxBearingSubs.some(
    (sub) => sub.taxUsdCents !== null && sub.taxUsdCents !== undefined
  )
  const grandTotalWithTax = monthlyTotal + totalTaxCents
  const planTaxCents = planSubscription?.taxUsdCents ?? null

  const actionFor = (plan: PlanId): PlanAction => {
    if (plan === summary.plan) return { kind: "current" }
    const entry = planEntries.get(plan)
    if (!entry) {
      // Starter has no Polar product (it's free); represent downgrade-to-starter
      // explicitly when the user is on a paid plan.
      if (plan === "starter" && onPaidPlan) {
        return { kind: "downgrade-to-starter" }
      }
      return { kind: "unavailable" }
    }
    if (planRank(plan) > planRank(summary.plan)) {
      if (summary.plan === "starter") return { kind: "subscribe", entry }
      return { kind: "upgrade", entry }
    }
    return { kind: "switch", entry }
  }

  return (
    <div className="space-y-10">
      <Header />

      <Card>
        <CardHeader className="gap-2">
          <CardDescription>Monthly total</CardDescription>
          <CardTitle className="font-semibold text-3xl tabular-nums tracking-tight">
            {formatUsd(monthlyTotal)}
            <span className="ml-1 font-normal text-base text-muted-foreground">
              / month
            </span>
          </CardTitle>
          {anyTaxKnown && totalTaxCents > 0 ? (
            <p className="text-muted-foreground text-xs tabular-nums">
              + {formatUsd(totalTaxCents)} tax ·{" "}
              <span className="font-medium text-foreground">
                {formatUsd(grandTotalWithTax)}
              </span>{" "}
              charged / month
            </p>
          ) : (
            <p className="text-muted-foreground text-xs">
              Tax added at checkout based on billing address.
            </p>
          )}
        </CardHeader>
        <CardContent className="space-y-1">
          <div className="flex items-center justify-between gap-4 border-border border-t py-3 text-sm">
            <div className="min-w-0">
              <p className="font-medium text-foreground">
                {planLabels[summary.plan] ?? summary.plan} plan
              </p>
              <p className="text-muted-foreground text-xs">
                {planSubscription
                  ? planSubscription.cancelAtPeriodEnd
                    ? `Ends ${planRenewal ?? "soon"}`
                    : planRenewal
                      ? `Renews ${planRenewal}`
                      : statusVariants[planSubscription.status].label
                  : "Free tier"}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <span className="font-medium tabular-nums">
                {formatUsd(currentPlanPrice)}
              </span>
              <span className="ml-0.5 font-normal text-muted-foreground text-xs">
                /mo
              </span>
              {planTaxCents !== null && planTaxCents > 0 ? (
                <p className="text-[10px] text-muted-foreground tabular-nums">
                  + {formatUsd(planTaxCents)} tax
                </p>
              ) : null}
            </div>
          </div>

          <Accordion type="single" collapsible className="border-t">
            <AccordionItem value="modules" className="border-b-0">
              <AccordionTrigger className="items-center py-3 hover:no-underline">
                <div className="flex w-full items-center justify-between gap-4 pr-2 text-sm">
                  <div className="min-w-0 text-left">
                    <p className="font-medium text-foreground">
                      {moduleSpendLines.length} module
                      {moduleSpendLines.length === 1 ? "" : "s"}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      Paid add-ons
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <span className="font-medium tabular-nums">
                      {formatUsd(moduleSpendTotal)}
                    </span>
                    <span className="ml-0.5 font-normal text-muted-foreground text-xs">
                      /mo
                    </span>
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                {moduleSpendLines.length === 0 ? (
                  <p className="py-1 text-muted-foreground text-xs">
                    No paid modules. Add some from{" "}
                    <Link
                      className="font-medium text-foreground underline-offset-4 hover:underline"
                      href="/settings/modules"
                    >
                      Modules
                    </Link>
                    .
                  </p>
                ) : (
                  <dl className="divide-y divide-border/60">
                    {moduleSpendLines.map((line) => (
                      <div
                        className="flex items-center justify-between gap-4 py-2 text-xs"
                        key={line.id}
                      >
                        <dt className="min-w-0">
                          <span className="block truncate text-foreground">
                            {line.label}
                          </span>
                          {line.hint ? (
                            <span className="block text-muted-foreground">
                              {line.hint}
                            </span>
                          ) : null}
                        </dt>
                        <dd className="shrink-0 text-right font-medium tabular-nums">
                          <div>
                            {formatUsd(line.priceUsdCents)}
                            <span className="ml-0.5 font-normal text-muted-foreground">
                              /mo
                            </span>
                          </div>
                          {line.taxUsdCents !== null && line.taxUsdCents > 0 ? (
                            <div className="font-normal text-[10px] text-muted-foreground">
                              + {formatUsd(line.taxUsdCents)} tax
                            </div>
                          ) : null}
                        </dd>
                      </div>
                    ))}
                  </dl>
                )}
              </AccordionContent>
            </AccordionItem>
          </Accordion>

          <p className="pt-2 text-muted-foreground text-xs">
            Recurring charges only. AI credit top-ups appear under{" "}
            <Link
              className="font-medium text-foreground underline-offset-4 hover:underline"
              href="/settings/usage"
            >
              Usage
            </Link>
            .
          </p>
        </CardContent>
      </Card>

      <section className="space-y-4">
        <div className="space-y-1">
          <h2 className="font-semibold text-lg tracking-tight">Plans</h2>
          <p className="text-muted-foreground text-sm">
            Subscribe through Polar checkout, or switch paid tiers directly on
            the existing subscription.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {planOrder.map((plan) => (
            <PlanCard
              action={actionFor(plan)}
              copy={planCopy[plan]}
              entry={planEntries.get(plan)}
              isCurrent={plan === summary.plan}
              key={plan}
              onCancel={() => setCancelOpen(true)}
              cancelAtPeriodEnd={
                plan === summary.plan
                  ? (planSubscription?.cancelAtPeriodEnd ?? false)
                  : false
              }
              onCheckout={(entry) => void handlePlanCheckout(entry)}
              onConfirmChange={(entry, direction) =>
                setPendingPlanChange({ entry, direction })
              }
              onKeepPlan={() => setCancelOpen(true)}
              onDowngrade={() => setDowngradeOpen(true)}
              pending={
                pendingProductId !== null &&
                planEntries.get(plan)?.productId === pendingProductId
              }
              plan={plan}
              renewal={planRenewal}
              statusLabel={
                planSubscription && plan === summary.plan
                  ? statusVariants[planSubscription.status].label
                  : null
              }
            />
          ))}
        </div>

        <p className="text-muted-foreground text-xs">{TAX_FOOTNOTE}</p>

        {onPaidPlan && planSubscription ? (
          <div className="pt-1 text-sm">
            {planSubscription.cancelAtPeriodEnd ? (
              <>
                <button
                  type="button"
                  onClick={() => setCancelOpen(true)}
                  className="mr-2 inline-flex text-foreground hover:cursor-pointer hover:underline"
                >
                  Keep current plan.
                </button>
                <span className="text-muted-foreground text-xs">
                  Cancellation scheduled for {planRenewal ?? "period end"} —
                  click to resume renewal before then.
                </span>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setCancelOpen(true)}
                  className="mr-2 inline-flex text-destructive hover:cursor-pointer hover:text-destructive hover:underline"
                >
                  Cancel current plan.
                </button>
                <span className="text-muted-foreground text-xs">
                  Ends access at renewal. Use the cards above to switch tiers.
                </span>
              </>
            )}
          </div>
        ) : null}
      </section>

      <section className="space-y-4">
        <div className="space-y-1">
          <h2 className="font-semibold text-lg tracking-tight">
            Module add-ons
          </h2>
          <p className="text-muted-foreground text-sm">
            Paid modules attached to your workspace.
          </p>
        </div>

        {moduleSubscriptions.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-10 text-center text-muted-foreground text-sm">
              No paid modules. Enable more from{" "}
              <Link
                href="/settings/modules"
                className="font-medium text-foreground underline-offset-4 hover:underline"
              >
                Modules
              </Link>
              .
            </CardContent>
          </Card>
        ) : (
          <div className="divide-y rounded-lg border">
            {moduleSubscriptions.map((subscription) => {
              const status = statusVariants[subscription.status]
              const moduleRenewal = formatRenewal(
                subscription.currentPeriodEnd ?? null
              )
              return (
                <div
                  key={subscription.id}
                  className="flex items-center justify-between gap-4 px-4 py-3"
                >
                  <div className="min-w-0 space-y-0.5">
                    <p className="truncate font-medium text-sm">
                      {moduleSubscriptionLabel(subscription)}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {status.label}
                      {moduleRenewal
                        ? ` · ${subscription.cancelAtPeriodEnd ? "Ends" : "Renews"} ${moduleRenewal}`
                        : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge variant={status.tone}>{status.label}</Badge>
                    <Button
                      onClick={() => setModuleManageSubscription(subscription)}
                      size="sm"
                      variant="outline"
                    >
                      {subscription.cancelAtPeriodEnd ? "Resume" : "Cancel"}
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div className="space-y-1">
          <h2 className="font-semibold text-lg tracking-tight">Payment</h2>
          <p className="text-muted-foreground text-sm">
            Update card, invoices, and receipts in the Polar portal.
          </p>
        </div>
        <Button
          aria-busy={portalPending}
          disabled={portalPending}
          onClick={() => void handlePortal()}
          variant="outline"
        >
          {portalPending ? "Opening…" : "Open Polar portal"}
          {portalPending ? null : <ExternalLinkIcon className="size-4" />}
        </Button>
      </section>

      <section className="space-y-3">
        <div className="space-y-1">
          <h2 className="font-semibold text-lg tracking-tight">Usage</h2>
          <p className="text-muted-foreground text-sm">
            Track AI spend and add credits on the usage page.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/settings/usage">
            View usage
            <ArrowUpRightIcon className="size-4" />
          </Link>
        </Button>
      </section>

      <ManagePlanDialog
        onClose={() => setCancelOpen(false)}
        onCompleted={() => {
          setCancelOpen(false)
          void load()
        }}
        open={cancelOpen}
        planLabel={planLabels[summary.plan] ?? summary.plan}
        renewal={planRenewal}
        subscriptionKind="plan"
        subscription={planSubscription ?? null}
      />

      <ManagePlanDialog
        onClose={() => setModuleManageSubscription(null)}
        onCompleted={() => {
          setModuleManageSubscription(null)
          void load()
        }}
        open={moduleManageSubscription !== null}
        planLabel={
          moduleManageSubscription
            ? moduleSubscriptionLabel(moduleManageSubscription)
            : "Module"
        }
        renewal={formatRenewal(
          moduleManageSubscription?.currentPeriodEnd ?? null
        )}
        subscriptionKind="module"
        subscription={moduleManageSubscription}
      />

      <PlanChangeConfirmDialog
        catalog={catalog}
        currentEntry={currentPlanEntry ?? null}
        currentPlanLabel={planLabels[summary.plan] ?? summary.plan}
        onClose={() => setPendingPlanChange(null)}
        onConfirmed={() => {
          setPendingPlanChange(null)
          void load()
        }}
        pending={pendingPlanChange}
        renewal={planRenewal}
      />

      <DowngradeConfirmDialog
        onClose={() => setDowngradeOpen(false)}
        onCompleted={() => {
          setDowngradeOpen(false)
          void load()
        }}
        open={downgradeOpen}
        planLabel={planLabels[summary.plan] ?? summary.plan}
        renewal={planRenewal}
        subscription={planSubscription ?? null}
      />
    </div>
  )
}

function Header() {
  return (
    <div className="space-y-2">
      <h1 className="font-semibold text-2xl tracking-tight">Billing</h1>
      <p className="max-w-2xl text-muted-foreground text-sm">
        Manage your plan, paid modules, and payment method.
      </p>
    </div>
  )
}

function PlanCard({
  action,
  cancelAtPeriodEnd,
  copy,
  entry,
  isCurrent,
  onCancel,
  onCheckout,
  onConfirmChange,
  onDowngrade,
  onKeepPlan,
  pending,
  plan,
  renewal,
  statusLabel,
}: {
  action: PlanAction
  cancelAtPeriodEnd: boolean
  copy: (typeof planCopy)[PlanId]
  entry: BillingCatalogEntry | undefined
  isCurrent: boolean
  onCancel: () => void
  onCheckout: (entry: BillingCatalogEntry) => void
  onConfirmChange: (
    entry: BillingCatalogEntry,
    direction: "upgrade" | "switch"
  ) => void
  onDowngrade: () => void
  onKeepPlan: () => void
  pending: boolean
  plan: PlanId
  renewal: string | null
  statusLabel: string | null
}) {
  const price = plan === "starter" ? 0 : (entry?.priceUsdCents ?? null)
  const priceLabel = formatUsd(price)

  return (
    <Card
      className={cn(
        "flex h-full flex-col",
        isCurrent && "border-foreground/40 ring-1 ring-foreground/30"
      )}
    >
      <CardHeader className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground text-xs uppercase tracking-wide">
            {planLabels[plan]}
          </span>
          {isCurrent ? (
            cancelAtPeriodEnd ? (
              <Badge variant="outline" className="text-xs">
                Ends {renewal ?? "soon"}
              </Badge>
            ) : (
              <Badge variant="default" className="text-xs">
                Current
              </Badge>
            )
          ) : plan === "enterprise" ? (
            <span className="flex items-center gap-1 text-muted-foreground text-xs">
              <SparklesIcon className="size-3.5" />
              Top tier
            </span>
          ) : null}
        </div>
        <CardTitle className="font-semibold text-2xl tabular-nums tracking-tight">
          {priceLabel}
          <span className="ml-1 font-normal text-muted-foreground text-sm">
            / month
          </span>
        </CardTitle>
        <CardDescription className="text-sm leading-snug">
          {copy.tagline}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4">
        <ul className="space-y-2 text-foreground text-sm">
          <li className="flex items-start gap-2">
            <CheckIcon className="mt-0.5 size-4 shrink-0 text-foreground" />
            <span>{copy.allowance}</span>
          </li>
          <li className="flex items-start gap-2">
            <CheckIcon className="mt-0.5 size-4 shrink-0 text-foreground" />
            <span>{copy.rpm}</span>
          </li>
          {copy.features.map((feature) => (
            <li className="flex items-start gap-2" key={feature}>
              <CheckIcon className="mt-0.5 size-4 shrink-0 text-foreground" />
              <span>{feature}</span>
            </li>
          ))}
        </ul>

        <div className="mt-auto space-y-2 pt-2">
          {action.kind === "current" ? (
            statusLabel ? (
              <p className="text-muted-foreground text-xs">
                {statusLabel}
                {renewal
                  ? ` · ${cancelAtPeriodEnd ? "Ends" : "Renews"} ${renewal}`
                  : ""}
              </p>
            ) : (
              <p className="text-muted-foreground text-xs">Free tier</p>
            )
          ) : action.kind === "subscribe" ||
            action.kind === "upgrade" ||
            action.kind === "switch" ? (
            <Button
              aria-busy={pending}
              className="w-full"
              disabled={pending}
              onClick={() => {
                if (action.kind === "subscribe") {
                  onCheckout(action.entry)
                  return
                }
                onConfirmChange(
                  action.entry,
                  action.kind === "upgrade" ? "upgrade" : "switch"
                )
              }}
            >
              {pending && action.kind === "subscribe"
                ? "Redirecting…"
                : action.kind === "subscribe"
                  ? "Subscribe"
                  : action.kind === "upgrade"
                    ? "Upgrade"
                    : "Switch"}
              {pending || action.kind !== "subscribe" ? null : (
                <ArrowUpRightIcon className="size-3.5" />
              )}
            </Button>
          ) : action.kind === "downgrade-to-starter" ? (
            <Button className="w-full" onClick={onDowngrade} variant="outline">
              Downgrade to Starter
            </Button>
          ) : (
            <Button className="w-full" disabled variant="outline">
              Unavailable
            </Button>
          )}

          {isCurrent && plan !== "starter" ? (
            cancelAtPeriodEnd ? (
              <Button
                className="w-full"
                onClick={onKeepPlan}
                size="sm"
                variant="outline"
              >
                Keep plan
              </Button>
            ) : (
              <Button
                className="w-full"
                onClick={onCancel}
                size="sm"
                variant="destructive"
              >
                Cancel plan
              </Button>
            )
          ) : null}
        </div>
      </CardContent>
    </Card>
  )
}

function ManagePlanDialog({
  open,
  onClose,
  onCompleted,
  planLabel,
  renewal,
  subscriptionKind,
  subscription,
}: {
  open: boolean
  onClose: () => void
  onCompleted: () => void
  planLabel: string
  renewal: string | null
  subscriptionKind: "plan" | "module"
  subscription: Subscription | null
}) {
  const [submitting, setSubmitting] = useState<"none" | "scheduled" | "resume">(
    "none"
  )
  const scheduledForCancel = subscription?.cancelAtPeriodEnd === true

  const handleCancel = async () => {
    if (!subscription) return
    setSubmitting("scheduled")
    try {
      await apiClient.billing.cancelSubscription(subscription.id)
      toast.success(
        `${planLabel} ${subscriptionKind} will end on ${
          renewal ?? "the next renewal"
        }.`
      )
      onCompleted()
    } catch (cancelError) {
      toast.error(
        cancelError instanceof Error
          ? cancelError.message
          : "Could not cancel this plan."
      )
    } finally {
      setSubmitting("none")
    }
  }

  const handleResume = async () => {
    if (!subscription) return
    setSubmitting("resume")
    try {
      await apiClient.billing.resumeSubscription(subscription.id)
      toast.success(`${planLabel} ${subscriptionKind} will renew normally.`)
      onCompleted()
    } catch (resumeError) {
      toast.error(
        resumeError instanceof Error
          ? resumeError.message
          : "Could not resume this plan."
      )
    } finally {
      setSubmitting("none")
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && submitting === "none") onClose()
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {scheduledForCancel
              ? `Keep ${planLabel} ${subscriptionKind}`
              : `Cancel ${planLabel} ${subscriptionKind}`}
          </DialogTitle>
          <DialogDescription>
            {scheduledForCancel
              ? `Cancellation is scheduled for ${renewal ?? "the next renewal"}. Resuming keeps this ${subscriptionKind} active and renews it normally.`
              : renewal
                ? subscriptionKind === "plan"
                  ? `The plan stays active until ${renewal}; after that the workspace returns to Starter. You can resume any time before then.`
                  : `The module stays active until ${renewal}; after that Helm disables it. You can resume any time before then.`
                : subscriptionKind === "plan"
                  ? "The plan stays active until the next renewal, then returns to Starter."
                  : "The module stays active until the next renewal, then Helm disables it."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2 pt-1">
          {scheduledForCancel ? (
            <Button
              aria-busy={submitting === "resume"}
              className="w-full"
              disabled={submitting !== "none"}
              onClick={() => void handleResume()}
            >
              {submitting === "resume" ? "Resuming…" : "Resume renewal"}
            </Button>
          ) : (
            <Button
              aria-busy={submitting === "scheduled"}
              className="w-full"
              disabled={submitting !== "none"}
              onClick={() => void handleCancel()}
              variant="destructive"
            >
              {submitting === "scheduled"
                ? "Scheduling…"
                : "Cancel at period end"}
            </Button>
          )}
        </div>

        <DialogFooter className="sm:justify-start">
          <DialogClose asChild>
            <Button variant="ghost" size="sm" disabled={submitting !== "none"}>
              Close
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function PlanChangeConfirmDialog({
  catalog,
  currentEntry,
  currentPlanLabel,
  onClose,
  onConfirmed,
  pending,
  renewal,
}: {
  catalog: BillingCatalogEntry[]
  currentEntry: BillingCatalogEntry | null
  currentPlanLabel: string
  onClose: () => void
  onConfirmed: () => void
  pending: {
    entry: BillingCatalogEntry
    direction: "upgrade" | "switch"
  } | null
  renewal: string | null
}) {
  const [submitting, setSubmitting] = useState(false)

  const handleConfirm = async () => {
    if (!pending) return
    setSubmitting(true)
    try {
      await apiClient.billing.changePlan({ productId: pending.entry.productId })
      toast.success(
        pending.direction === "upgrade"
          ? `Upgraded to ${pending.entry.name}.`
          : `Switched to ${pending.entry.name}.`
      )
      onConfirmed()
    } catch (changeError) {
      toast.error(
        changeError instanceof Error
          ? changeError.message
          : "Could not change plan."
      )
    } finally {
      setSubmitting(false)
    }
  }

  const open = pending !== null
  const action = pending?.direction === "upgrade" ? "Upgrade" : "Switch"
  const newPrice = pending ? formatUsd(pending.entry.priceUsdCents) : "—"
  const currentPrice = currentEntry
    ? formatUsd(currentEntry.priceUsdCents)
    : "—"

  // Suppress unused-var lint: catalog passed in for parity with future
  // enhancements (e.g., showing module diff side-by-side).
  void catalog

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !submitting) onClose()
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {action} to {pending?.entry.name ?? "plan"}
          </DialogTitle>
          <DialogDescription>
            {pending?.direction === "upgrade"
              ? "Polar applies the change immediately and prorates the difference on your next invoice."
              : "Polar applies the change immediately. Any unused time on the current plan is prorated against the new one."}
          </DialogDescription>
        </DialogHeader>

        <dl className="divide-y divide-border border-border border-y text-sm">
          <div className="flex items-center justify-between gap-4 py-3">
            <dt className="text-muted-foreground">Current</dt>
            <dd className="text-right">
              <div className="font-medium">{currentPlanLabel}</div>
              <div className="text-muted-foreground text-xs tabular-nums">
                {currentPrice}/mo
              </div>
            </dd>
          </div>
          <div className="flex items-center justify-between gap-4 py-3">
            <dt className="text-muted-foreground">New</dt>
            <dd className="text-right">
              <div className="font-medium">{pending?.entry.name ?? "—"}</div>
              <div className="text-muted-foreground text-xs tabular-nums">
                {newPrice}/mo
              </div>
            </dd>
          </div>
          <div className="flex items-center justify-between gap-4 py-3">
            <dt className="text-muted-foreground">Renews</dt>
            <dd className="text-right text-foreground text-sm">
              {renewal ?? "—"}
            </dd>
          </div>
        </dl>

        <p className="text-muted-foreground text-xs">
          Plan-only change — paid modules and credits are unaffected. New
          allowance and rate limits apply on confirmation.
        </p>

        <DialogFooter className="gap-2 sm:justify-end">
          <DialogClose asChild>
            <Button variant="ghost" size="sm" disabled={submitting}>
              Close
            </Button>
          </DialogClose>
          <Button
            aria-busy={submitting}
            disabled={submitting}
            onClick={() => void handleConfirm()}
          >
            {submitting
              ? `${action === "Upgrade" ? "Upgrading" : "Switching"}…`
              : `Confirm ${action.toLowerCase()}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DowngradeConfirmDialog({
  open,
  onClose,
  onCompleted,
  planLabel,
  renewal,
  subscription,
}: {
  open: boolean
  onClose: () => void
  onCompleted: () => void
  planLabel: string
  renewal: string | null
  subscription: Subscription | null
}) {
  const [submitting, setSubmitting] = useState(false)

  const handleDowngrade = async () => {
    if (!subscription) return
    setSubmitting(true)
    try {
      await apiClient.billing.cancelSubscription(subscription.id)
      toast.success(
        `${planLabel} plan will end on ${renewal ?? "the next renewal"}; workspace returns to Starter then.`
      )
      onCompleted()
    } catch (downgradeError) {
      toast.error(
        downgradeError instanceof Error
          ? downgradeError.message
          : "Could not schedule the downgrade."
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !submitting) onClose()
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Downgrade to Starter</AlertDialogTitle>
          <AlertDialogDescription>
            {renewal
              ? `Your ${planLabel} plan stays active until ${renewal}. After that, the workspace returns to the free Starter plan.`
              : `Your ${planLabel} plan will end at the next renewal, then the workspace returns to the free Starter plan.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex flex-col gap-2 pt-1">
          <AlertDialogAction asChild>
            <Button
              aria-busy={submitting}
              className="w-full"
              disabled={submitting}
              onClick={(event) => {
                event.preventDefault()
                void handleDowngrade()
              }}
            >
              {submitting ? "Scheduling…" : "Confirm downgrade"}
            </Button>
          </AlertDialogAction>
          <AlertDialogCancel className="mt-0 w-full" disabled={submitting}>
            Keep {planLabel}
          </AlertDialogCancel>
        </div>
        <p className="pt-2 text-muted-foreground text-xs leading-relaxed">
          This schedules the plan to end at renewal. Polar keeps access active
          until the current period ends.
        </p>
      </AlertDialogContent>
    </AlertDialog>
  )
}
