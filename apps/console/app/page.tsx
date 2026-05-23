"use client"

import { useRouter } from "next/navigation"
import { authClient } from "../lib/auth-client"

export default function Page() {
  const router = useRouter()
  const { data: session, isPending } = authClient.useSession()

  return (
    <main style={{ fontFamily: "system-ui", padding: "2rem", maxWidth: 640 }}>
      <h1>Helm Console</h1>
      {isPending ? (
        <p>Loading…</p>
      ) : session ? (
        <section>
          <p>
            Signed in as <strong>{session.user.email}</strong>
          </p>
          <nav style={{ display: "flex", gap: "1rem" }}>
            <a href="/device">Activate a device</a>
            <a href="/settings">Settings</a>
            <a href="/onboarding">Onboarding</a>
          </nav>
          <button
            type="button"
            onClick={async () => {
              await authClient.signOut()
              router.refresh()
            }}
            style={{ marginTop: "1rem" }}
          >
            Sign out
          </button>
        </section>
      ) : (
        <nav style={{ display: "flex", gap: "1rem" }}>
          <a href="/sign-in">Sign in</a>
          <a href="/sign-up">Sign up</a>
        </nav>
      )}
    </main>
  )
}
