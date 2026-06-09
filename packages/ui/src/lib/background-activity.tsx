"use client"

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import type { AppHeaderBackgroundItem } from "../components/app-header"

// Generic activity bridge: long-running module surfaces (Pomodoro timer, sync
// jobs, exports) publish an item while active and every AppHeader renders the
// combined list, so activity stays visible from any screen. Unlike the
// assistant bridge this is state-based — the UI must re-render as items change.

interface BackgroundActivityStore {
  items: AppHeaderBackgroundItem[]
  set: (key: string, item: AppHeaderBackgroundItem | null) => void
}

const BackgroundActivityContext = createContext<BackgroundActivityStore | null>(
  null
)

export function BackgroundActivityProvider({
  children,
}: {
  children: ReactNode
}) {
  const [itemsByKey, setItemsByKey] = useState<
    Map<string, AppHeaderBackgroundItem>
  >(() => new Map())

  const set = useCallback(
    (key: string, item: AppHeaderBackgroundItem | null) => {
      setItemsByKey((current) => {
        const existing = current.get(key)
        if (item === null) {
          if (!existing) return current
          const next = new Map(current)
          next.delete(key)
          return next
        }
        if (
          existing &&
          existing.id === item.id &&
          existing.label === item.label &&
          existing.status === item.status
        ) {
          return current
        }
        const next = new Map(current)
        next.set(key, item)
        return next
      })
    },
    []
  )

  const store = useMemo<BackgroundActivityStore>(
    () => ({ items: [...itemsByKey.values()], set }),
    [itemsByKey, set]
  )

  return (
    <BackgroundActivityContext.Provider value={store}>
      {children}
    </BackgroundActivityContext.Provider>
  )
}

// Publishes (or clears, with null) one activity item while mounted. The key
// identifies the publisher so updates replace rather than accumulate.
export function usePublishBackgroundActivity(
  key: string,
  item: AppHeaderBackgroundItem | null
): void {
  const store = useContext(BackgroundActivityContext)
  const set = store?.set
  useEffect(() => {
    if (!set) return
    set(key, item)
  }, [set, key, item])
  // Clear on unmount only — separate effect so item updates don't flicker.
  const cleanupRef = useRef<(() => void) | null>(null)
  cleanupRef.current = set ? () => set(key, null) : null
  useEffect(() => () => cleanupRef.current?.(), [])
}

// Items for AppHeader's activity panel. Empty without a provider, so module
// surfaces can pass this unconditionally.
export function useBackgroundActivities(): AppHeaderBackgroundItem[] {
  const store = useContext(BackgroundActivityContext)
  return store?.items ?? []
}
