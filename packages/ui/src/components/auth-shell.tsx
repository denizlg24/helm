import { cn } from "@workspace/ui/lib/utils"
import type * as React from "react"

function AuthShell({
  children,
  aside,
  className,
}: {
  children: React.ReactNode
  aside?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn("grid min-h-svh lg:grid-cols-2", className)}>
      {aside !== undefined ? (
        <aside className="relative hidden flex-col justify-between border-border border-r bg-secondary px-10 py-12 lg:flex">
          {aside}
        </aside>
      ) : null}
      <main className="flex items-center justify-center px-6 py-14 sm:px-10">
        <div className="w-full max-w-sm">{children}</div>
      </main>
    </div>
  )
}

function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <img
        alt=""
        aria-hidden="true"
        className="size-5 rounded"
        src="/logo-icon.png"
      />
      <span className="font-medium text-foreground text-lg lowercase tracking-tight">
        helm
      </span>
    </span>
  )
}

function AuthAside({
  quote,
  attribution,
}: {
  quote: string
  attribution?: string
}) {
  return (
    <>
      <Wordmark />
      <figure className="max-w-md">
        <blockquote className="text-balance font-medium text-2xl text-foreground leading-snug tracking-tight">
          {quote}
        </blockquote>
        {attribution ? (
          <figcaption className="mt-4 text-muted-foreground text-sm">
            {attribution}
          </figcaption>
        ) : null}
      </figure>
    </>
  )
}

function AuthHeader({
  title,
  description,
  wordmark = true,
  className,
}: {
  title: string
  description?: React.ReactNode
  wordmark?: boolean
  className?: string
}) {
  return (
    <header className={cn("mb-8 flex flex-col gap-2", className)}>
      {wordmark ? <Wordmark className="mb-4 lg:hidden" /> : null}
      <h1 className="font-medium text-2xl text-foreground tracking-tight">
        {title}
      </h1>
      {description ? (
        <p className="text-balance text-muted-foreground text-sm leading-normal">
          {description}
        </p>
      ) : null}
    </header>
  )
}

function AuthFooter({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <footer
      className={cn(
        "mt-8 text-center text-muted-foreground text-sm [&_a:hover]:text-primary [&_a]:font-medium [&_a]:text-foreground [&_a]:underline [&_a]:underline-offset-4",
        className
      )}
    >
      {children}
    </footer>
  )
}

export { AuthAside, AuthFooter, AuthHeader, AuthShell, Wordmark }
