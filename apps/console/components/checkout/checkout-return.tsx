"use client"

import type { CheckoutStatusResponse } from "@workspace/types"
import { Wordmark } from "@workspace/ui/components/auth-shell"
import { Button, buttonVariants } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"
import { AlertTriangleIcon, CheckIcon } from "lucide-react"
import Link from "next/link"
import { useCallback, useEffect, useRef, useState } from "react"
import { apiClient } from "../../lib/api-client"

const allowedDestinations = new Set(["modules", "billing", "usage"])

const POLL_INTERVAL_MS = 2500
const MAX_POLL_ATTEMPTS = 20 // ~50s total

const destinationFor = (from: string | null) => {
  if (from && allowedDestinations.has(from)) {
    return `/${from}`
  }
  return "/billing"
}

type Phase =
  | { kind: "loading" }
  | { kind: "succeeded"; product: string | null }
  | { kind: "failed"; product: string | null; reason: string }

export function CheckoutReturnFlow() {
  const [phase, setPhase] = useState<Phase>({ kind: "loading" })
  const [redirectTarget, setRedirectTarget] = useState<string | null>(null)
  const redirectedRef = useRef(false)

  const finish = useCallback(
    (outcome: "success" | "failed", product: string | null, from: string) => {
      if (redirectedRef.current) return
      redirectedRef.current = true
      const params = new URLSearchParams()
      params.set("purchase", outcome)
      if (product) params.set("product", product)
      const target = `${destinationFor(from)}?${params.toString()}`
      setRedirectTarget(target)
      // Give the user ~700ms to see the success/failure state before bouncing.
      window.setTimeout(() => {
        window.location.replace(target)
      }, 700)
    },
    []
  )

  useEffect(() => {
    if (typeof window === "undefined") return
    const params = new URLSearchParams(window.location.search)
    const checkoutId = params.get("checkout_id")
    const from = params.get("from")
    const productHint = params.get("product")

    if (!checkoutId) {
      setPhase({
        kind: "failed",
        product: productHint,
        reason: "Missing checkout reference.",
      })
      return
    }

    let attempts = 0
    let cancelled = false
    let timer: number | undefined

    const poll = async () => {
      if (cancelled) return
      attempts += 1
      let status: CheckoutStatusResponse | null = null
      try {
        status = await apiClient.billing.checkoutStatus(checkoutId)
      } catch (error) {
        if (attempts >= MAX_POLL_ATTEMPTS) {
          setPhase({
            kind: "failed",
            product: productHint,
            reason:
              error instanceof Error
                ? error.message
                : "Could not confirm checkout.",
          })
          finish("failed", productHint, from ?? "")
          return
        }
        timer = window.setTimeout(poll, POLL_INTERVAL_MS)
        return
      }

      const productName = status.productName ?? productHint

      if (status.status === "succeeded" || status.status === "confirmed") {
        setPhase({ kind: "succeeded", product: productName })
        finish("success", productName, from ?? "")
        return
      }

      if (status.status === "failed" || status.status === "expired") {
        setPhase({
          kind: "failed",
          product: productName,
          reason:
            status.status === "expired"
              ? "Checkout session expired."
              : "Payment failed.",
        })
        finish("failed", productName, from ?? "")
        return
      }

      if (attempts >= MAX_POLL_ATTEMPTS) {
        // Still pending — bounce back so the user isn't stuck here. Treat as
        // failed so the destination page shows a retry banner; the webhook
        // will activate later if the payment lands.
        setPhase({
          kind: "failed",
          product: productName,
          reason: "Confirmation is taking longer than expected.",
        })
        finish("failed", productName, from ?? "")
        return
      }

      timer = window.setTimeout(poll, POLL_INTERVAL_MS)
    }

    void poll()

    return () => {
      cancelled = true
      if (timer !== undefined) window.clearTimeout(timer)
    }
  }, [finish])

  return (
    <main className="grid min-h-svh place-items-center bg-background px-6 py-12 text-foreground">
      <div className="flex w-full max-w-sm flex-col items-center gap-8 text-center">
        <Wordmark />

        {phase.kind === "loading" ? (
          <LoadingState />
        ) : phase.kind === "succeeded" ? (
          <SuccessState product={phase.product} target={redirectTarget} />
        ) : (
          <FailedState
            product={phase.product}
            reason={phase.reason}
            target={redirectTarget}
          />
        )}
      </div>
    </main>
  )
}

function LoadingState() {
  return (
    <div className="flex flex-col items-center gap-5">
      <span aria-hidden className="flex items-center gap-1.5">
        <span className="size-2 animate-pulse rounded-full bg-foreground" />
        <span className="size-2 animate-pulse rounded-full bg-foreground [animation-delay:160ms]" />
        <span className="size-2 animate-pulse rounded-full bg-foreground [animation-delay:320ms]" />
      </span>
      <div className="space-y-2">
        <h1 className="font-medium text-foreground text-xl tracking-tight">
          Confirming your purchase
        </h1>
        <p className="text-balance text-muted-foreground text-sm leading-relaxed">
          Polar is finalizing your checkout. This usually takes just a few
          seconds.
        </p>
      </div>
    </div>
  )
}

function SuccessState({
  product,
  target,
}: {
  product: string | null
  target: string | null
}) {
  return (
    <div className="flex flex-col items-center gap-5">
      <span
        aria-hidden
        className="flex size-10 items-center justify-center rounded-full border border-foreground bg-foreground text-background"
      >
        <CheckIcon className="size-5" />
      </span>
      <div className="space-y-2">
        <h1 className="font-medium text-foreground text-xl tracking-tight">
          {product ? `${product} is active` : "Purchase complete"}
        </h1>
        <p className="text-balance text-muted-foreground text-sm leading-relaxed">
          Taking you back to your workspace…
        </p>
      </div>
      {target ? (
        <Link
          className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          href={target}
        >
          Continue
        </Link>
      ) : null}
    </div>
  )
}

function FailedState({
  product,
  reason,
  target,
}: {
  product: string | null
  reason: string
  target: string | null
}) {
  return (
    <div className="flex flex-col items-center gap-5">
      <span
        aria-hidden
        className="flex size-10 items-center justify-center rounded-full border border-destructive text-destructive"
      >
        <AlertTriangleIcon className="size-5" />
      </span>
      <div className="space-y-2">
        <h1 className="font-medium text-foreground text-xl tracking-tight">
          {product ? `${product} checkout incomplete` : "Checkout incomplete"}
        </h1>
        <p className="text-balance text-muted-foreground text-sm leading-relaxed">
          {reason}
        </p>
      </div>
      <div className="flex gap-2">
        {target ? (
          <Button asChild size="sm" variant="outline" type="button">
            <Link href={target}>Continue</Link>
          </Button>
        ) : (
          <Button asChild size="sm" type="button">
            <Link href="/billing">Back to billing</Link>
          </Button>
        )}
      </div>
    </div>
  )
}
