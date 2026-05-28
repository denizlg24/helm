"use client"

import type { BillingSummaryResponse, Subscription } from "@workspace/types"
import { Alert, AlertDescription } from "@workspace/ui/components/alert"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { toast } from "@workspace/ui/components/sonner"
import { ArrowUpRightIcon, ExternalLinkIcon } from "lucide-react"
import Link from "next/link"
import { useCallback, useEffect, useState } from "react"
import { apiClient } from "../../lib/api-client"

const planLabels: Record<string, string> = {
  starter: "Starter",
  pro: "Pro",
  enterprise: "Enterprise",
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
  if (!date) {
    return null
  }
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

export function BillingOverviewSection() {
  const [summary, setSummary] = useState<BillingSummaryResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [portalPending, setPortalPending] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setSummary(await apiClient.billing.summary())
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

  if (loading && !summary) {
    return (
      <div className="space-y-10">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-40" />
        <Skeleton className="h-32" />
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
        <Button variant="outline" onClick={() => void load()}>
          Try again
        </Button>
      </div>
    )
  }

  if (!summary) {
    return null
  }

  const planSubscription = summary.subscriptions.find(
    (subscription) => subscription.productKind === "plan"
  )
  const moduleSubscriptions = summary.subscriptions.filter(
    (subscription) => subscription.productKind === "module"
  )
  const renewal = formatRenewal(planSubscription?.currentPeriodEnd ?? null)

  return (
    <div className="space-y-10">
      <Header />

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <CardDescription>Current plan</CardDescription>
            <CardTitle className="font-semibold text-2xl tracking-tight">
              {planLabels[summary.plan] ?? summary.plan}
            </CardTitle>
            {planSubscription ? (
              <div className="flex flex-wrap items-center gap-2 pt-1 text-muted-foreground text-sm">
                <Badge variant={statusVariants[planSubscription.status].tone}>
                  {statusVariants[planSubscription.status].label}
                </Badge>
                {renewal ? (
                  <span>
                    {planSubscription.cancelAtPeriodEnd
                      ? `Ends ${renewal}`
                      : `Renews ${renewal}`}
                  </span>
                ) : null}
              </div>
            ) : (
              <p className="pt-1 text-muted-foreground text-sm">
                No active subscription.
              </p>
            )}
          </div>

          <Button
            onClick={() => void handlePortal()}
            disabled={portalPending}
            aria-busy={portalPending}
          >
            {portalPending ? "Opening…" : "Manage billing"}
            {portalPending ? null : <ExternalLinkIcon className="size-4" />}
          </Button>
        </CardHeader>
      </Card>

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
                      {subscription.moduleId ?? "Module"}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {status.label}
                      {moduleRenewal
                        ? ` · ${subscription.cancelAtPeriodEnd ? "Ends" : "Renews"} ${moduleRenewal}`
                        : ""}
                    </p>
                  </div>
                  <Badge variant={status.tone}>{status.label}</Badge>
                </div>
              )
            })}
          </div>
        )}
      </section>

      <section className="space-y-4">
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
