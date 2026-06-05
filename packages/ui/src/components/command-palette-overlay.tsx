"use client"

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@workspace/ui/components/command"
import { cn } from "@workspace/ui/lib/utils"
import { Command as CommandPrimitive } from "cmdk"
import type { LucideIcon } from "lucide-react"
import { SearchIcon } from "lucide-react"
import { Dialog as DialogPrimitive } from "radix-ui"
import { useEffect, useMemo, useState } from "react"

export interface CommandPaletteEntry {
  disabled?: boolean
  group: string
  href?: string
  icon: LucideIcon
  id: string
  keywords?: string[]
  label: string
}

export interface CommandPaletteOverlayProps {
  entries: CommandPaletteEntry[]
  onSelect: (entry: CommandPaletteEntry) => void
  placeholder?: string
  title?: string
}

function normalizeSearchText(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

function scoreToken(value: string, search: string) {
  if (value === search) return 1
  if (value.startsWith(search)) return 0.92
  if (value.includes(search)) return 0.58 - value.indexOf(search) * 0.01

  let searchIndex = 0
  let firstIndex = -1
  let lastIndex = -1

  for (let valueIndex = 0; valueIndex < value.length; valueIndex++) {
    if (value[valueIndex] !== search[searchIndex]) continue
    if (firstIndex === -1) firstIndex = valueIndex
    lastIndex = valueIndex
    searchIndex++
    if (searchIndex === search.length) break
  }

  if (searchIndex !== search.length || firstIndex === -1) return 0

  const span = lastIndex - firstIndex + 1
  const density = search.length / span
  return span <= search.length * 3 ? 0.18 + density * 0.22 : 0
}

function fuzzyScore(value: string, search: string, keywords?: string[]) {
  const query = normalizeSearchText(search)
  if (!query) return 0

  const haystack = [value, ...(keywords ?? [])]
    .map(normalizeSearchText)
    .filter(Boolean)
  const queryWords = query.split(/\s+/)

  let total = 0
  for (const queryWord of queryWords) {
    const best = Math.max(
      ...haystack.flatMap((candidate) => {
        const words = candidate.split(/\s+/)
        const initials = words.map((word) => word[0] ?? "").join("")
        return [
          scoreToken(candidate, queryWord) * 0.86,
          scoreToken(initials, queryWord) * 0.72,
          ...words.map((word) => scoreToken(word, queryWord)),
        ]
      })
    )

    if (best <= 0) return 0
    total += best
  }

  return total / queryWords.length
}

export function CommandPaletteOverlay({
  entries,
  onSelect,
  placeholder = "Search pages...",
  title = "Navigation",
}: CommandPaletteOverlayProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")

  useEffect(() => {
    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key === "p" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        setOpen((current) => !current)
      }
    }

    window.addEventListener("keydown", handleKeydown)
    return () => window.removeEventListener("keydown", handleKeydown)
  }, [])

  const groupedEntries = useMemo(() => {
    const groups = new Map<string, CommandPaletteEntry[]>()
    for (const entry of entries) {
      groups.set(entry.group, [...(groups.get(entry.group) ?? []), entry])
    }
    return Array.from(groups, ([group, groupEntries]) => ({
      entries: groupEntries,
      group,
    }))
  }, [entries])

  const hasSearch = search.trim().length > 0

  const handleOpenChange = (value: boolean) => {
    setOpen(value)
    if (!value) setSearch("")
  }

  const handleSelect = (entry: CommandPaletteEntry) => {
    if (entry.disabled) return
    setOpen(false)
    setSearch("")
    onSelect(entry)
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={handleOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/50 backdrop-blur-sm data-[state=closed]:animate-out data-[state=open]:animate-in" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 fixed top-[20%] left-1/2 z-50 w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 outline-none duration-200 data-[state=closed]:animate-out data-[state=open]:animate-in sm:w-full"
        >
          <DialogPrimitive.Title className="sr-only">
            {title}
          </DialogPrimitive.Title>
          <Command
            className="overflow-visible bg-transparent"
            filter={fuzzyScore}
          >
            <div className="flex items-center gap-3 rounded-full border bg-popover px-5 shadow-lg">
              <SearchIcon className="size-5 shrink-0 text-muted-foreground" />
              <CommandPrimitive.Input
                value={search}
                onValueChange={setSearch}
                placeholder={placeholder}
                className="flex h-14 w-full bg-transparent text-base outline-none placeholder:text-muted-foreground"
              />
            </div>

            <div
              className={cn(
                "origin-top overflow-hidden rounded-xl border bg-popover shadow-lg transition-all duration-200 ease-out",
                hasSearch
                  ? "mt-2 translate-y-0 scale-y-100 opacity-100"
                  : "pointer-events-none mt-0 max-h-0 -translate-y-1 scale-y-95 border-transparent opacity-0"
              )}
            >
              <CommandList className="max-h-75">
                <CommandEmpty>No results found.</CommandEmpty>
                {groupedEntries.map(({ group, entries: groupEntries }) => (
                  <CommandGroup heading={group} key={group}>
                    {groupEntries.map((entry) => {
                      const Icon = entry.icon

                      return (
                        <CommandItem
                          disabled={entry.disabled}
                          key={entry.id}
                          value={`${entry.label} ${entry.id}`}
                          keywords={entry.keywords}
                          onSelect={() => handleSelect(entry)}
                          className={cn(
                            "grid grid-cols-[1rem_minmax(0,1fr)_7.5rem] gap-3 h-7!",
                            entry.disabled &&
                              "cursor-not-allowed text-muted-foreground/55"
                          )}
                        >
                          <Icon className="size-4 shrink-0" />
                          <span className="min-w-0 truncate">
                            {entry.label}
                          </span>
                          <span className="min-w-0 truncate text-right text-muted-foreground text-xs">
                            {entry.disabled ? "Disabled" : entry.group}
                          </span>
                        </CommandItem>
                      )
                    })}
                  </CommandGroup>
                ))}
              </CommandList>
            </div>
          </Command>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
