"use client"

import { cn } from "@workspace/ui/lib/utils"
import {
  AppWindowIcon,
  GaugeIcon,
  KeyRoundIcon,
  LaptopIcon,
  WalletIcon,
} from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import type * as React from "react"

export interface SettingsNavItem {
  href: string
  label: string
  description: string
  icon: React.ComponentType<{ className?: string }>
}

export const settingsNavItems: readonly SettingsNavItem[] = [
  {
    href: "/settings/usage",
    label: "Usage",
    description: "Monthly allowance, credits, request volume.",
    icon: GaugeIcon,
  },
  {
    href: "/settings/billing",
    label: "Billing",
    description: "Plan, subscriptions, invoices.",
    icon: WalletIcon,
  },
  {
    href: "/settings/modules",
    label: "Modules",
    description: "Enable or disable features in your workspace.",
    icon: AppWindowIcon,
  },
  {
    href: "/settings/devices",
    label: "Devices",
    description: "Manage signed-in desktop and mobile clients.",
    icon: LaptopIcon,
  },
  {
    href: "/settings/api-tokens",
    label: "API tokens",
    description: "Personal access tokens for scripts and integrations.",
    icon: KeyRoundIcon,
  },
]

interface SettingsNavListProps {
  onNavigate?: () => void
}

export function SettingsNavList({ onNavigate }: SettingsNavListProps) {
  const pathname = usePathname()

  return (
    <nav aria-label="Settings sections" className="flex flex-col gap-1">
      {settingsNavItems.map((item) => {
        const active =
          pathname === item.href || pathname?.startsWith(`${item.href}/`)
        const Icon = item.icon

        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
              "text-muted-foreground hover:bg-accent hover:text-foreground",
              active && "bg-accent text-foreground"
            )}
          >
            <Icon
              className={cn(
                "size-4 shrink-0",
                active ? "text-foreground" : "text-muted-foreground"
              )}
            />
            <span className="font-medium">{item.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
