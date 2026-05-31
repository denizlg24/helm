"use client"

import type {
  BillingSummaryResponse,
  CurrentWorkspaceResponse,
} from "@workspace/types"
import { Alert, AlertDescription } from "@workspace/ui/components/alert"
import { Button } from "@workspace/ui/components/button"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { ArrowRightIcon } from "lucide-react"
import Link from "next/link"
import { useCallback, useEffect, useState } from "react"
import { apiClient } from "../../lib/api-client"

const planLabels: Record<string, string> = {
  starter: "Starter",
  pro: "Pro",
  enterprise: "Enterprise",
}

const formatDate = (date: Date | null | undefined): string | null => {
  if (!date) {
    return null
  }
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

interface OverviewData {
  workspace: CurrentWorkspaceResponse
  billing: BillingSummaryResponse
}

export function AccountOverview() {
  const [data, setData] = useState<OverviewData | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const [workspace, billing] = await Promise.all([
        apiClient.workspace.current(),
        apiClient.billing.summary(),
      ])
      setData({ workspace, billing })
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Could not load your account."
      )
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  if (error && !data) {
    return (
      <div className="space-y-6">
        <Header name={null} />
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
        <Button onClick={() => void load()} variant="outline">
          Try again
        </Button>
      </div>
    )
  }

  if (!data) {
    return <OverviewSkeleton />
  }

  const planSubscription = data.billing.subscriptions.find(
    (subscription) => subscription.productKind === "plan"
  )
  const planName = planLabels[data.billing.plan] ?? data.billing.plan
  const renewal = formatDate(planSubscription?.currentPeriodEnd)
  const moduleCount = data.billing.enabledModuleIds.length

  return (
    <div className="space-y-12">
      <Header name={data.workspace.workspace.displayName} />

      <section className="space-y-3">
        <h2 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
          At a glance
        </h2>
        <div className="divide-y divide-border border-border border-y">
          <OverviewRow
            href="/billing"
            label="Plan"
            linkLabel="Manage"
            value={renewal ? `${planName} · renews ${renewal}` : planName}
          />
          <OverviewRow
            href="/modules"
            label="Modules"
            linkLabel="Browse"
            value={`${moduleCount} enabled`}
          />
          <OverviewRow
            href="/usage"
            label="Usage"
            linkLabel="View"
            value="Allowance and credits"
          />
          <OverviewRow
            href="/devices"
            label="Devices"
            linkLabel="Manage"
            value="Signed-in clients"
          />
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
          Desktop app
        </h2>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <p className="max-w-md text-muted-foreground text-sm leading-snug">
            Build a desktop installer customized with your theme and the modules
            you use, then download it for Linux, Windows, or macOS.
          </p>
          <Button asChild className="self-start sm:self-auto">
            <Link href="/desktop">
              Generate installer
              <ArrowRightIcon className="size-3.5" />
            </Link>
          </Button>
        </div>
      </section>
    </div>
  )
}

function Header({ name }: { name: string | null }) {
  return (
    <div className="space-y-2">
      <h1 className="font-semibold text-2xl tracking-tight">
        {name ?? "Your account"}
      </h1>
      <p className="max-w-2xl text-muted-foreground text-sm">
        Manage your plan, modules, devices, and desktop installers.
      </p>
    </div>
  )
}

function OverviewRow({
  label,
  value,
  href,
  linkLabel,
}: {
  label: string
  value: string
  href: string
  linkLabel: string
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-4">
      <div className="min-w-0">
        <p className="font-medium text-foreground text-sm">{label}</p>
        <p className="mt-0.5 truncate text-muted-foreground text-sm">{value}</p>
      </div>
      <Link
        className="shrink-0 text-foreground text-sm underline-offset-4 hover:underline"
        href={href}
      >
        {linkLabel}
      </Link>
    </div>
  )
}

function OverviewSkeleton() {
  return (
    <div className="space-y-12">
      <div className="space-y-2">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-80" />
      </div>
      <div className="space-y-3">
        <Skeleton className="h-4 w-24" />
        {[1, 2, 3, 4].map((index) => (
          <Skeleton className="h-12 w-full" key={index} />
        ))}
      </div>
    </div>
  )
}
