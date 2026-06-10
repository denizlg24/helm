import type {
  NotificationAction,
  NotificationActionApp,
} from "@workspace/types"

export interface NotificationActionResolverOptions {
  // App the resolver runs in; navigate actions targeting it run in-app, all
  // other targets open the destination app's URL.
  currentApp: NotificationActionApp
  appBaseUrls?: Partial<Record<NotificationActionApp, string>>
  navigate?: (route: string) => void
  openUrl?: (url: string) => void
}

const defaultOpenUrl = (url: string) => {
  if (typeof window !== "undefined") {
    window.open(url, "_blank", "noopener,noreferrer")
  }
}

export const createNotificationActionResolver = (
  options: NotificationActionResolverOptions
) => {
  const openUrl = options.openUrl ?? defaultOpenUrl

  return (action: NotificationAction): void => {
    switch (action.kind) {
      case "open-url":
        openUrl(action.url)
        return
      case "navigate": {
        // Detect absolute URLs and treat them as open-url instead of in-app navigation.
        let isAbsolute = false
        try {
          new URL(action.route)
          isAbsolute = true
        } catch {
          // action.route is not an absolute URL; treat as relative.
        }
        if (isAbsolute) {
          console.warn(
            `Navigate action has absolute route "${action.route}"; treating as open-url`
          )
          openUrl(action.route)
          return
        }
        if (action.app === options.currentApp && options.navigate) {
          options.navigate(action.route)
          return
        }
        const base = options.appBaseUrls?.[action.app]
        if (base) {
          openUrl(new URL(action.route, base).toString())
          return
        }
        console.warn(
          `No handler for navigate action targeting "${action.app}"`,
          action
        )
        return
      }
      default:
        // Forward compat: older clients ignore action kinds they don't know.
        console.warn("Unsupported notification action", action)
    }
  }
}

export type NotificationActionResolver = ReturnType<
  typeof createNotificationActionResolver
>
