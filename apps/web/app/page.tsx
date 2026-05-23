"use client"

import { useRouter } from "next/navigation"
import { authClient } from "../lib/auth-client"

const CONSOLE_URL =
  process.env.NEXT_PUBLIC_HELM_CONSOLE_URL ?? "http://localhost:3002"

export default function Page() {
  const router = useRouter()
  const { data: session, isPending } = authClient.useSession()

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
              await authClient.signOut()
              router.refresh()
            }}
          >
            Sign out
          </button>
        </section>
      ) : (
        <section>
          <p>You are not signed in.</p>
          <a href={`${CONSOLE_URL}/sign-in?next=${encodeURIComponent("/")}`}>
            Sign in on the console
          </a>
        </section>
      )}
    </main>
  )
}
