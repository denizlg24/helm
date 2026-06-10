"use client"

import type {
  CreateNotificationInput,
  MarkAllNotificationsReadInput,
  Notification,
  NotificationDetailResponse,
  NotificationListResponse,
  NotificationStreamEvent,
  NotificationsQuery,
  NotificationUnreadCountResponse,
} from "@workspace/types"
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
} from "react"
import { toast } from "../components/sonner"
import {
  createNotificationActionResolver,
  type NotificationActionResolver,
  type NotificationActionResolverOptions,
} from "./notification-actions"

export interface NotificationsClient {
  notifications: {
    list: (query?: NotificationsQuery) => Promise<NotificationListResponse>
    unreadCount: () => Promise<NotificationUnreadCountResponse>
    create: (
      input: CreateNotificationInput
    ) => Promise<NotificationDetailResponse>
    markRead: (ids: string[]) => Promise<{ count: number }>
    markAllRead: (
      input?: MarkAllNotificationsReadInput
    ) => Promise<{ count: number }>
    archive: (id: string) => Promise<NotificationDetailResponse>
    streamEvents: (
      signal?: AbortSignal
    ) => AsyncGenerator<NotificationStreamEvent, void, unknown>
  }
}

export interface NotificationsContextValue {
  items: Notification[]
  unreadCount: number
  connected: boolean
  loading: boolean
  hasMore: boolean
  loadMore: () => Promise<void>
  markRead: (ids: string[]) => Promise<void>
  markAllRead: (input?: MarkAllNotificationsReadInput) => Promise<void>
  archive: (id: string) => Promise<void>
  // Creates a client-originated notification; it flows back through the SSE
  // stream, which renders the toast and updates every connected device.
  publish: (input: CreateNotificationInput) => Promise<void>
  resolveAction: NotificationActionResolver
  viewAll?: () => void
}

interface NotificationsState {
  items: Notification[]
  unreadCount: number
  connected: boolean
  loading: boolean
  nextCursor: string | null
}

type NotificationsStateAction =
  | {
      type: "snapshot"
      items: Notification[]
      nextCursor: string | null
      unreadCount: number
    }
  | { type: "append"; items: Notification[]; nextCursor: string | null }
  | { type: "created"; notification: Notification }
  | { type: "updated"; notification: Notification }
  | { type: "read-all"; category: string | null }
  | { type: "connected"; connected: boolean }
  | { type: "unread-count"; count: number }

const initialState: NotificationsState = {
  items: [],
  unreadCount: 0,
  connected: false,
  loading: true,
  nextCursor: null,
}

const reducer = (
  state: NotificationsState,
  action: NotificationsStateAction
): NotificationsState => {
  switch (action.type) {
    case "snapshot":
      return {
        ...state,
        items: action.items,
        nextCursor: action.nextCursor,
        unreadCount: action.unreadCount,
        loading: false,
      }
    case "append": {
      const known = new Set(state.items.map((item) => item.id))
      return {
        ...state,
        items: [
          ...state.items,
          ...action.items.filter((item) => !known.has(item.id)),
        ],
        nextCursor: action.nextCursor,
      }
    }
    case "created": {
      if (state.items.some((item) => item.id === action.notification.id)) {
        return state
      }
      return {
        ...state,
        items: [action.notification, ...state.items],
        unreadCount:
          action.notification.readAt === null
            ? state.unreadCount + 1
            : state.unreadCount,
      }
    }
    case "updated": {
      const items = action.notification.archivedAt
        ? state.items.filter((item) => item.id !== action.notification.id)
        : state.items.map((item) =>
            item.id === action.notification.id ? action.notification : item
          )
      return { ...state, items }
    }
    case "read-all": {
      const now = new Date()
      return {
        ...state,
        items: state.items.map((item) =>
          item.readAt === null &&
          (action.category === null || item.category === action.category)
            ? { ...item, readAt: now }
            : item
        ),
        unreadCount: action.category === null ? 0 : state.unreadCount,
      }
    }
    case "connected":
      return { ...state, connected: action.connected }
    case "unread-count":
      return { ...state, unreadCount: action.count }
    default:
      return state
  }
}

const severityToast = (notification: Notification) => {
  const options = { description: notification.body ?? undefined }
  switch (notification.severity) {
    case "error":
      toast.error(notification.title, options)
      return
    case "warning":
      toast.warning(notification.title, options)
      return
    case "success":
      toast.success(notification.title, options)
      return
    default:
      toast(notification.title, options)
  }
}

const NotificationsContext = createContext<NotificationsContextValue | null>(
  null
)

export function useNotificationsOptional(): NotificationsContextValue | null {
  return useContext(NotificationsContext)
}

export function useNotifications(): NotificationsContextValue {
  const context = useContext(NotificationsContext)
  if (!context) {
    throw new Error(
      "useNotifications must be used within a NotificationsProvider"
    )
  }
  return context
}

export interface NotificationsProviderProps
  extends NotificationActionResolverOptions {
  client: NotificationsClient
  enabled: boolean
  // Navigates to the app's full notifications surface ("View all").
  viewAll?: () => void
  // Toast on incoming live notifications. On by default; turn off for
  // surfaces that render their own treatment.
  toastOnCreated?: boolean
  children: ReactNode
}

export function NotificationsProvider({
  client,
  enabled,
  viewAll,
  toastOnCreated = true,
  currentApp,
  appBaseUrls,
  navigate,
  openUrl,
  children,
}: NotificationsProviderProps) {
  const [state, dispatch] = useReducer(reducer, initialState)
  const stateRef = useRef(state)
  stateRef.current = state
  const toastOnCreatedRef = useRef(toastOnCreated)
  toastOnCreatedRef.current = toastOnCreated

  const refreshUnreadCount = useCallback(async () => {
    const response = await client.notifications.unreadCount()
    dispatch({ type: "unread-count", count: response.count })
  }, [client])

  const refresh = useCallback(async () => {
    const [list, unread] = await Promise.all([
      client.notifications.list(),
      client.notifications.unreadCount(),
    ])
    dispatch({
      type: "snapshot",
      items: list.items,
      nextCursor: list.nextCursor,
      unreadCount: unread.count,
    })
  }, [client])

  useEffect(() => {
    if (!enabled) return

    const abort = new AbortController()
    let cancelled = false

    const handleEvent = (event: NotificationStreamEvent) => {
      if (event.type === "created") {
        dispatch({ type: "created", notification: event.notification })
        if (toastOnCreatedRef.current) severityToast(event.notification)
        return
      }
      if (event.type === "updated") {
        dispatch({ type: "updated", notification: event.notification })
        // Read/archive state changed somewhere — reconcile the badge count.
        void refreshUnreadCount().catch(() => {})
        return
      }
      dispatch({ type: "read-all", category: event.category })
      void refreshUnreadCount().catch(() => {})
    }

    const run = async () => {
      let attempt = 0
      while (!cancelled) {
        try {
          await refresh()
          dispatch({ type: "connected", connected: true })
          for await (const event of client.notifications.streamEvents(
            abort.signal
          )) {
            attempt = 0
            handleEvent(event)
          }
        } catch {
          // Network failure or abort — fall through to the backoff below.
        }
        dispatch({ type: "connected", connected: false })
        if (cancelled) return
        attempt += 1
        const delay = Math.min(30_000, 1_000 * 2 ** Math.min(attempt, 5))
        await new Promise((resolve) => setTimeout(resolve, delay))
      }
    }

    void run()
    return () => {
      cancelled = true
      abort.abort()
    }
  }, [enabled, client, refresh, refreshUnreadCount])

  const loadMore = useCallback(async () => {
    const cursor = stateRef.current.nextCursor
    if (!cursor) return
    const list = await client.notifications.list({
      status: "all",
      limit: 20,
      cursor,
    })
    dispatch({ type: "append", items: list.items, nextCursor: list.nextCursor })
  }, [client])

  const markRead = useCallback(
    async (ids: string[]) => {
      if (ids.length === 0) return
      // Patch locally for snappy UI; the SSE echo is idempotent.
      const now = new Date()
      for (const id of ids) {
        const item = stateRef.current.items.find(
          (candidate) => candidate.id === id && candidate.readAt === null
        )
        if (item) {
          dispatch({ type: "updated", notification: { ...item, readAt: now } })
        }
      }
      await client.notifications.markRead(ids)
      await refreshUnreadCount().catch(() => {})
    },
    [client, refreshUnreadCount]
  )

  const markAllRead = useCallback(
    async (input?: MarkAllNotificationsReadInput) => {
      dispatch({ type: "read-all", category: input?.category ?? null })
      await client.notifications.markAllRead(input)
      await refreshUnreadCount().catch(() => {})
    },
    [client, refreshUnreadCount]
  )

  const archive = useCallback(
    async (id: string) => {
      const response = await client.notifications.archive(id)
      dispatch({ type: "updated", notification: response.notification })
      await refreshUnreadCount().catch(() => {})
    },
    [client, refreshUnreadCount]
  )

  const publish = useCallback(
    async (input: CreateNotificationInput) => {
      await client.notifications.create(input)
    },
    [client]
  )

  const resolveAction = useMemo(
    () =>
      createNotificationActionResolver({
        currentApp,
        appBaseUrls,
        navigate,
        openUrl,
      }),
    [currentApp, appBaseUrls, navigate, openUrl]
  )

  const value = useMemo<NotificationsContextValue>(
    () => ({
      items: state.items,
      unreadCount: state.unreadCount,
      connected: state.connected,
      loading: state.loading,
      hasMore: state.nextCursor !== null,
      loadMore,
      markRead,
      markAllRead,
      archive,
      publish,
      resolveAction,
      viewAll,
    }),
    [
      state.items,
      state.unreadCount,
      state.connected,
      state.loading,
      state.nextCursor,
      loadMore,
      markRead,
      markAllRead,
      archive,
      publish,
      resolveAction,
      viewAll,
    ]
  )

  return (
    <NotificationsContext.Provider value={value}>
      {children}
    </NotificationsContext.Provider>
  )
}
