"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import {
  AuthAside,
  AuthHeader,
  AuthShell,
} from "@workspace/ui/components/auth-shell"
import { Button } from "@workspace/ui/components/button"
import { FieldGroup } from "@workspace/ui/components/field"
import { OtpField } from "@workspace/ui/components/form-field"
import { toast } from "@workspace/ui/components/sonner"
import { Spinner } from "@workspace/ui/components/spinner"
import { useRouter, useSearchParams } from "next/navigation"
import { Suspense, useEffect, useState } from "react"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { authClient } from "../../lib/auth-client"

const normalizeCode = (value: string) =>
  value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase()

const DeviceSchema = z.object({
  code: z
    .string()
    .transform(normalizeCode)
    .pipe(z.string().length(8, "Enter the full 8-character code")),
})

type DeviceValues = { code: string }

type Outcome = "pending" | "approved" | "denied"

function CenteredSpinner() {
  return (
    <div className="flex min-h-svh items-center justify-center">
      <Spinner className="size-5 text-muted-foreground" />
    </div>
  )
}

function DeviceForm() {
  const router = useRouter()
  const params = useSearchParams()
  const prefilled = normalizeCode(params.get("user_code") ?? "")
  const { data: session, isPending } = authClient.useSession()
  const [outcome, setOutcome] = useState<Outcome>("pending")
  const [activeAction, setActiveAction] = useState<"approve" | "deny" | null>(
    null
  )

  const form = useForm<DeviceValues>({
    resolver: zodResolver(DeviceSchema),
    defaultValues: { code: prefilled },
  })

  const nextTarget = prefilled
    ? `/device?user_code=${encodeURIComponent(prefilled)}`
    : "/device"

  useEffect(() => {
    if (!isPending && !session) {
      router.replace(`/sign-in?next=${encodeURIComponent(nextTarget)}`)
    }
  }, [isPending, session, nextTarget, router])

  if (isPending || !session) {
    return <CenteredSpinner />
  }

  const claim = async (userCode: string) => {
    const result = await authClient.device({ query: { user_code: userCode } })
    if (result.error) {
      return (
        result.error.error_description ??
        result.error.error ??
        "Could not verify this code"
      )
    }
    return null
  }

  const decide = async (decision: "approve" | "deny") => {
    setActiveAction(decision)
    try {
      const userCode = normalizeCode(form.getValues("code"))
      const claimError = await claim(userCode)
      if (claimError) {
        toast.error(claimError)
        return
      }
      const result =
        decision === "approve"
          ? await authClient.device.approve({ userCode })
          : await authClient.device.deny({ userCode })
      if (result.error) {
        toast.error(
          result.error.error_description ??
            result.error.error ??
            (decision === "approve" ? "Approval failed" : "Denial failed")
        )
        return
      }
      setOutcome(decision === "approve" ? "approved" : "denied")
    } finally {
      setActiveAction(null)
    }
  }

  const onApprove = form.handleSubmit(() => decide("approve"))
  const onDeny = form.handleSubmit(() => decide("deny"))
  const pending = form.formState.isSubmitting

  return (
    <AuthShell
      aside={
        <AuthAside
          attribution="Helm"
          quote="Connect a device once. Steer it from anywhere."
        />
      }
    >
      {outcome === "approved" ? (
        <AuthHeader
          description="Device approved. Return to the desktop app to finish — you can close this tab."
          title="Device connected"
        />
      ) : outcome === "denied" ? (
        <AuthHeader
          description="The request was denied. No device was connected."
          title="Request denied"
        />
      ) : (
        <>
          <AuthHeader
            description={`Signed in as ${session.user.email}. Confirm the code shown on the desktop app.`}
            title="Activate device"
          />
          <form className="" noValidate onSubmit={onApprove}>
            <FieldGroup className="mx-auto items-center">
              <OtpField
                control={form.control}
                disabled={pending}
                name="code"
                containerClassName="justify-center"
                pattern="^[a-zA-Z0-9]*$"
              />
              <Button
                className="w-full"
                disabled={pending}
                loading={activeAction === "approve"}
                size="lg"
                type="submit"
              >
                Approve device
              </Button>
              <Button
                className="w-full"
                disabled={pending}
                loading={activeAction === "deny"}
                onClick={onDeny}
                size="lg"
                type="button"
                variant="ghost"
              >
                Deny
              </Button>
            </FieldGroup>
          </form>
        </>
      )}
    </AuthShell>
  )
}

export default function Page() {
  return (
    <Suspense fallback={<CenteredSpinner />}>
      <DeviceForm />
    </Suspense>
  )
}
