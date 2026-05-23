"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { useState } from "react"
import { authClient } from "../../lib/auth-client"

export default function Page() {
  const router = useRouter()
  const params = useSearchParams()
  const next = params.get("next") ?? "/"
  const userCode = params.get("user_code")
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const buildNext = () => {
    if (next === "/device" && userCode) {
      return `/device?user_code=${encodeURIComponent(userCode)}`
    }
    return next
  }

  return (
    <main style={{ fontFamily: "system-ui", padding: "2rem", maxWidth: 480 }}>
      <h1>Sign in</h1>
      {userCode ? (
        <p>
          You are signing in to activate a device with code{" "}
          <strong>{userCode}</strong>.
        </p>
      ) : null}
      <form
        onSubmit={async (event) => {
          event.preventDefault()
          setPending(true)
          setError(null)
          const formData = new FormData(event.currentTarget)
          const result = await authClient.signIn.email({
            email: String(formData.get("email") ?? ""),
            password: String(formData.get("password") ?? ""),
          })
          setPending(false)
          if (result.error) {
            setError(result.error.message ?? "Sign in failed")
            return
          }
          router.push(buildNext())
          router.refresh()
        }}
      >
        <div>
          <input
            name="email"
            placeholder="email@example.com"
            type="email"
            required
          />
        </div>
        <div>
          <input
            name="password"
            placeholder="Password"
            type="password"
            required
          />
        </div>
        <button type="submit" disabled={pending}>
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </form>
      {error ? <p style={{ color: "crimson" }}>{error}</p> : null}
      <button
        type="button"
        onClick={() => {
          void authClient.signIn.social({
            provider: "google",
            callbackURL: buildNext(),
          })
        }}
      >
        Continue with Google
      </button>
      <p>
        <a
          href={`/sign-up${userCode ? `?next=/device&user_code=${encodeURIComponent(userCode)}` : ""}`}
        >
          Need an account? Sign up
        </a>
      </p>
    </main>
  )
}
