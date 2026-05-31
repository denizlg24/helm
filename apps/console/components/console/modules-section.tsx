"use client"

import {
  coreModuleIds,
  defaultEnabledModuleIds,
  type ModuleDefinition,
  moduleDefinitions,
} from "@workspace/module-registry"
import type {
  BillingCatalogEntry,
  BillingSummaryResponse,
  Subscription,
} from "@workspace/types"
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
import { Skeleton } from "@workspace/ui/components/skeleton"
import { toast } from "@workspace/ui/components/sonner"
import { cn } from "@workspace/ui/lib/utils"
import { ArrowUpRightIcon, CheckIcon } from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { apiClient } from "../../lib/api-client"

const groupLabels: Record<string, string> = {
  core: "Core",
  knowledge: "Knowledge",
  work: "Work",
  relationships: "Relationships",
  communications: "Communications",
  infrastructure: "Infrastructure",
  publish: "Publish",
}

const groupOrder: readonly string[] = [
  "knowledge",
  "work",
  "relationships",
  "communications",
  "infrastructure",
  "publish",
  "core",
]

const moduleDescriptions: Record<string, string> = {
  notes: "Capture, connect, and retrieve private knowledge.",
  whiteboard: "Sketch systems, plans, and open-ended thinking.",
  spreadsheets: "Track structured personal data and lightweight models.",
  timetable: "Plan recurring routines with a fixed weekly shape.",
  journal: "Keep a dated private record of decisions and days.",
  pomodoro: "Run focused sessions from the dashboard and desktop.",
  people: "Maintain a private CRM for relationships and reminders.",
  "imap-inbox": "Bring mail into Helm without making email the center.",
  triage: "Use assistant-powered sorting for incoming messages.",
  resources: "Monitor personal infrastructure, domains, and services.",
  blog: "Publish long-form writing from selected private material.",
  projects: "Show public work without exposing private workspace data.",
  timeline: "Publish chronological updates and milestones.",
  now: "Maintain a public snapshot of what has your attention.",
  comments: "Receive public responses without shared sessions.",
  "contact-form": "Accept public messages through a controlled endpoint.",
  kanban: "Plan work in flexible boards.",
  calendar: "See time blocks at a glance.",
  home: "Your daily dashboard.",
  settings: "Workspace, billing, and devices.",
  assistant: "Helm's AI assistant.",
  "llm-usage": "Track AI spend.",
  "api-tokens": "Personal access tokens.",
  "data-export": "Export workspace data.",
}

const coreSet = new Set<string>(coreModuleIds)
const defaultEnabledSet = new Set<string>(defaultEnabledModuleIds)

type RowStatus =
  | { kind: "included" }
  | { kind: "enabled-paid"; subscription: Subscription }
  | { kind: "buy"; entry: BillingCatalogEntry }
  | { kind: "pending"; entry: BillingCatalogEntry | null }
  | { kind: "coming-soon" }

interface ModuleRow {
  definition: ModuleDefinition
  status: RowStatus
  priceLabel: string | null
}

const formatPrice = (priceUsdCents: number | null | undefined) => {
  if (priceUsdCents === null || priceUsdCents === undefined) {
    return null
  }
  if (priceUsdCents === 0) {
    return "Free"
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: priceUsdCents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(priceUsdCents / 100)
}

const formatRenewal = (date: Date | null | undefined): string | null => {
  if (!date) return null
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

export function ModulesSettingsSection() {
  const [summary, setSummary] = useState<BillingSummaryResponse | null>(null)
  const [catalog, setCatalog] = useState<BillingCatalogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pendingProductId, setPendingProductId] = useState<string | null>(null)
  const [manageSubscription, setManageSubscription] =
    useState<Subscription | null>(null)
  const [purchaseNotice, setPurchaseNotice] = useState<
    | { kind: "success"; label: string }
    | { kind: "failed"; label: string }
    | null
  >(null)

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
          : "Could not load modules."
      )
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  // Read one-shot banner state from /checkout/return redirect.
  useEffect(() => {
    if (typeof window === "undefined") return
    const params = new URLSearchParams(window.location.search)
    const purchase = params.get("purchase")
    const label = params.get("product") ?? "module"
    if (purchase === "success") {
      setPurchaseNotice({ kind: "success", label })
    } else if (purchase === "failed") {
      setPurchaseNotice({ kind: "failed", label })
    }
    if (purchase) {
      params.delete("purchase")
      params.delete("product")
      const next = params.toString()
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}${next ? `?${next}` : ""}`
      )
    }
  }, [])

  const moduleEntries = useMemo(
    () =>
      new Map(
        catalog
          .filter((entry) => entry.kind === "module" && entry.moduleId)
          .map((entry) => [entry.moduleId as string, entry])
      ),
    [catalog]
  )

  const moduleSubscriptions = useMemo(() => {
    if (!summary) return new Map<string, Subscription>()
    return new Map(
      summary.subscriptions
        .filter(
          (subscription) =>
            subscription.productKind === "module" && subscription.moduleId
        )
        .map((subscription) => [subscription.moduleId as string, subscription])
    )
  }, [summary])

  const rows = useMemo<ModuleRow[]>(() => {
    if (!summary) return []
    const enabledModuleIds = new Set(summary.enabledModuleIds)
    const pendingProductIds = new Set(
      summary.activeCheckoutSessions.map((session) => session.productId)
    )

    return moduleDefinitions.map((definition) => {
      const included = defaultEnabledSet.has(definition.id)
      const catalogEntry = moduleEntries.get(definition.id) ?? null
      const subscription = moduleSubscriptions.get(definition.id)

      let status: RowStatus
      let priceLabel: string | null = null

      if (included) {
        status = { kind: "included" }
      } else if (subscription && enabledModuleIds.has(definition.id)) {
        status = { kind: "enabled-paid", subscription }
        priceLabel = catalogEntry
          ? formatPrice(catalogEntry.priceUsdCents)
          : null
      } else if (
        catalogEntry &&
        pendingProductIds.has(catalogEntry.productId)
      ) {
        status = { kind: "pending", entry: catalogEntry }
        priceLabel = formatPrice(catalogEntry.priceUsdCents)
      } else if (catalogEntry) {
        status = { kind: "buy", entry: catalogEntry }
        priceLabel = formatPrice(catalogEntry.priceUsdCents)
      } else {
        status = { kind: "coming-soon" }
      }

      return { definition, status, priceLabel }
    })
  }, [moduleEntries, moduleSubscriptions, summary])

  const grouped = useMemo(() => {
    const groups = new Map<string, ModuleRow[]>()
    for (const row of rows) {
      const list = groups.get(row.definition.group) ?? []
      list.push(row)
      groups.set(row.definition.group, list)
    }
    return groupOrder
      .filter((group) => groups.has(group))
      .map((group) => ({ group, rows: groups.get(group) ?? [] }))
  }, [rows])

  const handleBuy = useCallback(async (entry: BillingCatalogEntry) => {
    setPendingProductId(entry.productId)
    try {
      const successUrl = `${window.location.origin}/checkout/return?checkout_id={CHECKOUT_ID}&from=modules&product=${encodeURIComponent(entry.name)}`
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
    return <ModulesSkeleton />
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

  return (
    <div className="space-y-10">
      <Header />

      {purchaseNotice ? (
        <Alert
          variant={purchaseNotice.kind === "failed" ? "destructive" : "default"}
        >
          <AlertDescription>
            {purchaseNotice.kind === "success"
              ? `${purchaseNotice.label} is now active in your workspace.`
              : `Checkout for ${purchaseNotice.label} did not complete. You can try again below.`}
          </AlertDescription>
        </Alert>
      ) : null}

      {grouped.map(({ group, rows: groupRows }) => (
        <section className="space-y-3" key={group}>
          <h2 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
            {groupLabels[group] ?? group}
          </h2>
          <div className="divide-y divide-border border-border border-y">
            {groupRows.map((row) => (
              <ModuleRowItem
                key={row.definition.id}
                onBuy={() =>
                  row.status.kind === "buy"
                    ? void handleBuy(row.status.entry)
                    : undefined
                }
                onManage={() =>
                  row.status.kind === "enabled-paid"
                    ? setManageSubscription(row.status.subscription)
                    : undefined
                }
                pendingBuy={
                  row.status.kind === "buy" &&
                  pendingProductId === row.status.entry.productId
                }
                row={row}
              />
            ))}
          </div>
        </section>
      ))}

      <p className="text-muted-foreground text-xs">
        Prices shown excl. tax. VAT/sales tax is calculated and added at
        checkout.
      </p>

      <CancelModuleDialog
        catalog={moduleEntries}
        onClose={() => setManageSubscription(null)}
        onCompleted={() => {
          setManageSubscription(null)
          void load()
        }}
        subscription={manageSubscription}
      />
    </div>
  )
}

function Header() {
  return (
    <div className="space-y-2">
      <h1 className="font-semibold text-2xl tracking-tight">Modules</h1>
      <p className="max-w-2xl text-muted-foreground text-sm">
        Add new surfaces to your workspace or cancel ones you no longer use.
        Core, Kanban, Calendar, and Pomodoro are always included.
      </p>
    </div>
  )
}

function ModuleRowItem({
  row,
  onBuy,
  onManage,
  pendingBuy,
}: {
  row: ModuleRow
  onBuy: () => void
  onManage: () => void
  pendingBuy: boolean
}) {
  const { definition, status, priceLabel } = row
  const description =
    moduleDescriptions[definition.id] ?? "Add this module to your workspace."

  return (
    <div className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:gap-6">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="font-medium text-foreground text-sm">
            {definition.name}
          </p>
          {status.kind === "enabled-paid" &&
          status.subscription.cancelAtPeriodEnd ? (
            <Badge variant="outline" className="font-normal text-xs">
              Ends{" "}
              {formatRenewal(status.subscription.currentPeriodEnd) ?? "soon"}
            </Badge>
          ) : null}
        </div>
        <p className="mt-0.5 text-muted-foreground text-sm leading-snug">
          {description}
        </p>
      </div>

      <div className="flex items-center justify-between gap-4 sm:justify-end">
        <span
          className={cn(
            "text-xs tabular-nums",
            status.kind === "coming-soon"
              ? "text-muted-foreground/70"
              : "text-muted-foreground"
          )}
        >
          {status.kind === "included"
            ? "Included"
            : status.kind === "coming-soon"
              ? "Coming soon"
              : status.kind === "pending"
                ? "Checkout open"
                : priceLabel
                  ? `${priceLabel}/mo`
                  : null}
        </span>

        {status.kind === "enabled-paid" ? (
          <Button onClick={onManage} size="sm" variant="outline">
            Manage
          </Button>
        ) : status.kind === "buy" ? (
          <Button
            aria-busy={pendingBuy}
            disabled={pendingBuy}
            onClick={onBuy}
            size="sm"
          >
            {pendingBuy ? "Redirecting…" : "Buy"}
            {pendingBuy ? null : <ArrowUpRightIcon className="size-3.5" />}
          </Button>
        ) : status.kind === "included" ? (
          <span className="flex items-center gap-1 text-muted-foreground text-xs">
            <CheckIcon className="size-3.5" />
            Active
          </span>
        ) : null}
      </div>
    </div>
  )
}

function CancelModuleDialog({
  subscription,
  catalog,
  onClose,
  onCompleted,
}: {
  subscription: Subscription | null
  catalog: Map<string, BillingCatalogEntry>
  onClose: () => void
  onCompleted: () => void
}) {
  const [submitting, setSubmitting] = useState<"none" | "scheduled" | "resume">(
    "none"
  )

  const moduleId = subscription?.moduleId ?? null
  const catalogEntry = moduleId ? catalog.get(moduleId) : null
  const moduleName = catalogEntry?.name ?? moduleId ?? "module"
  const renewal = formatRenewal(subscription?.currentPeriodEnd)
  const scheduledForCancel = subscription?.cancelAtPeriodEnd === true

  const handleCancel = async () => {
    if (!subscription) return
    setSubmitting("scheduled")
    try {
      await apiClient.billing.cancelSubscription(subscription.id)
      toast.success(
        `${moduleName} will stay active until ${renewal ?? "the period ends"}.`
      )
      onCompleted()
    } catch (cancelError) {
      toast.error(
        cancelError instanceof Error
          ? cancelError.message
          : "Could not cancel this subscription."
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
      toast.success(`${moduleName} will renew normally.`)
      onCompleted()
    } catch (resumeError) {
      toast.error(
        resumeError instanceof Error
          ? resumeError.message
          : "Could not resume this subscription."
      )
    } finally {
      setSubmitting("none")
    }
  }

  return (
    <AlertDialog
      open={subscription !== null}
      onOpenChange={(open) => {
        if (!open && submitting === "none") onClose()
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {scheduledForCancel ? `Keep ${moduleName}` : `Cancel ${moduleName}`}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {scheduledForCancel
              ? `Cancellation is scheduled for ${renewal ?? "the next renewal"}. Resuming keeps the module active.`
              : renewal
                ? `The module stays active until ${renewal}, then renewal stops. You can resume any time before then.`
                : "The module stays active until the next renewal, then renewal stops."}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="flex flex-col gap-2 pt-1">
          {scheduledForCancel ? (
            <AlertDialogAction asChild>
              <Button
                aria-busy={submitting === "resume"}
                className="w-full"
                disabled={submitting !== "none"}
                onClick={(event) => {
                  event.preventDefault()
                  void handleResume()
                }}
              >
                {submitting === "resume" ? "Resuming…" : "Resume renewal"}
              </Button>
            </AlertDialogAction>
          ) : (
            <AlertDialogAction asChild>
              <Button
                aria-busy={submitting === "scheduled"}
                className="w-full"
                disabled={submitting !== "none"}
                onClick={(event) => {
                  event.preventDefault()
                  void handleCancel()
                }}
                variant="destructive"
              >
                {submitting === "scheduled"
                  ? "Scheduling…"
                  : "Cancel at period end"}
              </Button>
            </AlertDialogAction>
          )}
          <AlertDialogCancel
            className="mt-0 w-full"
            disabled={submitting !== "none"}
          >
            Close
          </AlertDialogCancel>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  )
}

function ModulesSkeleton() {
  return (
    <div className="space-y-10">
      <div className="space-y-2">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-72" />
      </div>
      {[1, 2, 3].map((index) => (
        <div className="space-y-3" key={index}>
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ))}
    </div>
  )
}
