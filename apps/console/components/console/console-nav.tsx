"use client"

import { cn } from "@workspace/ui/lib/utils"
import {
  AppWindowIcon,
  GaugeIcon,
  HouseIcon,
  KeyRoundIcon,
  LaptopIcon,
  MonitorDownIcon,
  WalletIcon,
} from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import type * as React from "react"

export interface ConsoleNavItem {
  href: string
  label: string
  description: string
  icon: React.ComponentType<{ className?: string }>
}

export const consoleNavItems: readonly ConsoleNavItem[] = [
  {
    href: "/",
    label: "Overview",
    description: "Your account at a glance.",
    icon: HouseIcon,
  },
  {
    href: "/usage",
    label: "Usage",
    description: "Monthly allowance, credits, request volume.",
    icon: GaugeIcon,
  },
  {
    href: "/billing",
    label: "Billing",
    description: "Plan, subscriptions, invoices.",
    icon: WalletIcon,
  },
  {
    href: "/modules",
    label: "Modules",
    description: "Enable or disable features in your workspace.",
    icon: AppWindowIcon,
  },
  {
    href: "/devices",
    label: "Devices",
    description: "Manage signed-in desktop and mobile clients.",
    icon: LaptopIcon,
  },
  {
    href: "/desktop",
    label: "Desktop app",
    description: "Generate and download a custom desktop installer.",
    icon: MonitorDownIcon,
  },
  {
    href: "/api-tokens",
    label: "API tokens",
    description: "Personal access tokens for scripts and integrations.",
    icon: KeyRoundIcon,
  },
]

const isActive = (pathname: string | null, href: string) => {
  if (href === "/") {
    return pathname === "/"
  }
  return pathname === href || pathname?.startsWith(`${href}/`)
}

interface ConsoleNavListProps {
  onNavigate?: () => void
}

export function ConsoleNavList({ onNavigate }: ConsoleNavListProps) {
  const pathname = usePathname()

  return (
    <nav aria-label="Console sections" className="flex flex-col gap-1">
      {consoleNavItems.map((item) => {
        const active = isActive(pathname, item.href)
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
