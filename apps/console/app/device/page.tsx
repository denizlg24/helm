"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { Suspense, useEffect, useState } from "react"
import { authClient } from "../../lib/auth-client"

type Outcome =
  | { kind: "idle" }
  | { kind: "approving" }
  | { kind: "approved" }
  | { kind: "denied" }
  | { kind: "error"; message: string }

function DevicePage() {
  const router = useRouter()
  const params = useSearchParams()
  const queryCode = params.get("user_code") ?? ""
  const [code, setCode] = useState(queryCode)
  const [outcome, setOutcome] = useState<Outcome>({ kind: "idle" })
  const { data: session, isPending } = authClient.useSession()

  useEffect(() => {
    if (!isPending && !session) {
      const nextTarget = queryCode
        ? `/device?user_code=${encodeURIComponent(queryCode)}`
        : "/device"
      router.replace(`/sign-in?next=${encodeURIComponent(nextTarget)}`)
    }
  }, [isPending, session, queryCode, router])

  if (isPending || !session) {
    return (
      <main style={{ fontFamily: "system-ui", padding: "2rem" }}>
        <p>Loading…</p>
      </main>
    )
  }

  const claim = async (userCode: string) => {
    const result = await authClient.device({ query: { user_code: userCode } })
    if (result.error) {
      return (
        result.error.error_description ??
        result.error.error ??
        "Could not verify code"
      )
    }
    return null
  }

  const approve = async () => {
    const userCode = code.trim()
    setOutcome({ kind: "approving" })
    const claimError = await claim(userCode)
    if (claimError) {
      setOutcome({ kind: "error", message: claimError })
      return
    }
    const result = await authClient.device.approve({ userCode })
    if (result.error) {
      setOutcome({
        kind: "error",
        message:
          result.error.error_description ??
          result.error.error ??
          "Approval failed",
      })
      return
    }
    setOutcome({ kind: "approved" })
  }

  const deny = async () => {
    const userCode = code.trim()
    setOutcome({ kind: "approving" })
    const claimError = await claim(userCode)
    if (claimError) {
      setOutcome({ kind: "error", message: claimError })
      return
    }
    const result = await authClient.device.deny({ userCode })
    if (result.error) {
      setOutcome({
        kind: "error",
        message:
          result.error.error_description ??
          result.error.error ??
          "Denial failed",
      })
      return
    }
    setOutcome({ kind: "denied" })
  }

  return (
    <main style={{ fontFamily: "system-ui", padding: "2rem", maxWidth: 520 }}>
      <h1>Device activation</h1>
      <p>
        Signed in as <strong>{session.user.email}</strong>.
      </p>
      {outcome.kind === "approved" ? (
        <section>
          <p>Device approved. You can return to the desktop app.</p>
        </section>
      ) : outcome.kind === "denied" ? (
        <section>
          <p>Device denied.</p>
        </section>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault()
            void approve()
          }}
        >
          <p>Enter the code shown on the desktop app.</p>
          <input
            name="userCode"
            placeholder="ABCD-EFGH"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            required
          />
          <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}>
            <button type="submit" disabled={outcome.kind === "approving"}>
              Approve
            </button>
            <button
              type="button"
              onClick={() => void deny()}
              disabled={outcome.kind === "approving"}
            >
              Deny
            </button>
          </div>
        </form>
      )}
      {outcome.kind === "error" ? (
        <p style={{ color: "crimson" }}>{outcome.message}</p>
      ) : null}
    </main>
  )
}

export default function Page() {
  return (
    <Suspense
      fallback={
        <main style={{ fontFamily: "system-ui", padding: "2rem" }}>
          <p>Loading...</p>
        </main>
      }
    >
      <DevicePage />
    </Suspense>
  )
}
