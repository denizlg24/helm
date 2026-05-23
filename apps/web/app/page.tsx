"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import { z } from "zod"
import { authClient } from "../lib/auth-client"

const WebPageEnvSchema = z.object({
  NEXT_PUBLIC_HELM_CONSOLE_URL: z
    .string()
    .url()
    .default("http://localhost:3002"),
})

const env = WebPageEnvSchema.parse({
  NEXT_PUBLIC_HELM_CONSOLE_URL: process.env.NEXT_PUBLIC_HELM_CONSOLE_URL,
})

export default function Page() {
  const router = useRouter()
  const { data: session, isPending } = authClient.useSession()
  const [signOutError, setSignOutError] = useState<string | null>(null)

  return (
    <main style={{ fontFamily: "system-ui", padding: "2rem", maxWidth: 640 }}>
      <h1>Helm Dashboard</h1>
      {isPending ? (
        <p>Loading…</p>
      ) : session ? (
        <section>
          <p>
            Signed in as <strong>{session.user.email}</strong>
          </p>
          <button
            type="button"
            onClick={async () => {
              setSignOutError(null)
              const result = await authClient.signOut()
              if (result.error) {
                console.error("Sign out failed", result.error)
                setSignOutError(result.error.message ?? "Sign out failed")
                return
              }
              router.refresh()
            }}
          >
            Sign out
          </button>
          {signOutError ? (
            <p style={{ color: "crimson" }}>{signOutError}</p>
          ) : null}
        </section>
      ) : (
        <section>
          <p>You are not signed in.</p>
          <a
            href={`${env.NEXT_PUBLIC_HELM_CONSOLE_URL}/sign-in?next=${encodeURIComponent(
              "/"
            )}`}
          >
            Sign in on the console
          </a>
        </section>
      )}
    </main>
  )
}
