"use client"

import type { AssistantSurfaceContext } from "@workspace/types"
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from "react"

// The bridge lets deep module surfaces (e.g. the notes editor) feed the global
// assistant dock without a direct dependency: surfaces publish their context
// and register client-tool handlers; the dock reads/dispatches. Values live in
// refs so per-keystroke publishing never re-renders the tree.

// --- Surface context ---------------------------------------------------------

interface SurfaceContextStore {
  publish: (value: AssistantSurfaceContext | null) => void
  read: () => AssistantSurfaceContext | null
}

const SurfaceContextStoreContext = createContext<SurfaceContextStore | null>(
  null
)

export function SurfaceContextProvider({ children }: { children: ReactNode }) {
  const ref = useRef<AssistantSurfaceContext | null>(null)
  const store = useMemo<SurfaceContextStore>(
    () => ({
      publish: (value) => {
        ref.current = value
      },
      read: () => ref.current,
    }),
    []
  )
  return (
    <SurfaceContextStoreContext.Provider value={store}>
      {children}
    </SurfaceContextStoreContext.Provider>
  )
}

// Publishes the calling surface's context while mounted; clears it on unmount.
export function usePublishSurfaceContext(
  value: AssistantSurfaceContext | null
): void {
  const store = useContext(SurfaceContextStoreContext)
  // No dependency array: the latest value is written every render (cheap ref
  // assignment), and the cleanup clears it when the surface unmounts.
  useEffect(() => {
    if (!store) return
    store.publish(value)
    return () => store.publish(null)
  })
}

// Returns a stable getter the dock calls at send time.
export function useSurfaceContextReader(): () => AssistantSurfaceContext | null {
  const store = useContext(SurfaceContextStoreContext)
  return useCallback(() => store?.read() ?? null, [store])
}

// --- Client tools ------------------------------------------------------------

export interface ClientToolOutcome {
  result: string
  isError?: boolean
}

export type ClientToolHandler = (
  input: Record<string, unknown>
) => Promise<ClientToolOutcome> | ClientToolOutcome

export interface ClientToolCall {
  toolUseId: string
  name: string
  input: Record<string, unknown>
}

interface ClientToolStore {
  register: (name: string, handler: ClientToolHandler) => () => void
  dispatch: (call: ClientToolCall) => Promise<ClientToolOutcome>
}

const ClientToolStoreContext = createContext<ClientToolStore | null>(null)

export function ClientToolsProvider({ children }: { children: ReactNode }) {
  const handlers = useRef(new Map<string, ClientToolHandler>())
  const store = useMemo<ClientToolStore>(
    () => ({
      register: (name, handler) => {
        handlers.current.set(name, handler)
        return () => {
          if (handlers.current.get(name) === handler) {
            handlers.current.delete(name)
          }
        }
      },
      dispatch: async (call) => {
        const handler = handlers.current.get(call.name)
        if (!handler) {
          return {
            result: `No client handler is registered for tool "${call.name}".`,
            isError: true,
          }
        }
        try {
          return await handler(call.input)
        } catch (error) {
          return {
            result:
              error instanceof Error
                ? error.message
                : "Client tool execution failed.",
            isError: true,
          }
        }
      },
    }),
    []
  )
  return (
    <ClientToolStoreContext.Provider value={store}>
      {children}
    </ClientToolStoreContext.Provider>
  )
}

// Registers a client-tool handler while the surface is mounted.
export function useRegisterClientTool(
  name: string,
  handler: ClientToolHandler
): void {
  const store = useContext(ClientToolStoreContext)
  const handlerRef = useRef(handler)
  handlerRef.current = handler
  useEffect(() => {
    if (!store) return
    const stable: ClientToolHandler = (input) => handlerRef.current(input)
    return store.register(name, stable)
  }, [store, name])
}

// Returns the dispatcher for the dock (undefined when no provider is mounted).
export function useClientToolDispatcher():
  | ((call: ClientToolCall) => Promise<ClientToolOutcome>)
  | undefined {
  const store = useContext(ClientToolStoreContext)
  return store?.dispatch
}

// --- Data invalidation -------------------------------------------------------
// When the assistant runs a server tool that mutates a module's data, the dock
// pushes an invalidation keyed by module id; the affected surface re-fetches so
// assistant-driven changes show up without a manual refresh.

type InvalidationListener = () => void

interface DataInvalidationStore {
  subscribe: (moduleId: string, listener: InvalidationListener) => () => void
  invalidate: (moduleId: string) => void
}

const DataInvalidationStoreContext =
  createContext<DataInvalidationStore | null>(null)

export function DataInvalidationProvider({
  children,
}: {
  children: ReactNode
}) {
  const listeners = useRef(new Map<string, Set<InvalidationListener>>())
  const store = useMemo<DataInvalidationStore>(
    () => ({
      subscribe: (moduleId, listener) => {
        const set = listeners.current.get(moduleId) ?? new Set()
        set.add(listener)
        listeners.current.set(moduleId, set)
        return () => {
          set.delete(listener)
          if (set.size === 0) listeners.current.delete(moduleId)
        }
      },
      invalidate: (moduleId) => {
        for (const listener of listeners.current.get(moduleId) ?? []) {
          try {
            listener()
          } catch (error) {
            console.error(
              `Error in data invalidation listener for module ${moduleId}:`,
              error
            )
          }
        }
      },
    }),
    []
  )
  return (
    <DataInvalidationStoreContext.Provider value={store}>
      {children}
    </DataInvalidationStoreContext.Provider>
  )
}

// Subscribes a surface to invalidations for its module. No-ops when no provider
// is mounted (e.g. surfaces rendered outside the dock shell).
export function useModuleDataInvalidation(
  moduleId: string,
  onInvalidate: InvalidationListener
): void {
  const store = useContext(DataInvalidationStoreContext)
  const handlerRef = useRef(onInvalidate)
  handlerRef.current = onInvalidate
  useEffect(() => {
    if (!store) return
    return store.subscribe(moduleId, () => handlerRef.current())
  }, [store, moduleId])
}

// Returns an invalidator for the dock (no-op when no provider is mounted).
export function useDataInvalidator(): (moduleId: string) => void {
  const store = useContext(DataInvalidationStoreContext)
  return useCallback((moduleId: string) => store?.invalidate(moduleId), [store])
}
