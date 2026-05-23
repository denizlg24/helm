"use client"

import { useSearchParams } from "next/navigation"
import { Suspense, useState } from "react"
import { authClient } from "../../lib/auth-client"

const sanitizeRedirectPath = (value: string | null) => {
  if (!value?.startsWith("/") || value.startsWith("//")) {
    return "/"
  }
  return value
}

function SignInPage() {
  const params = useSearchParams()
  const next = sanitizeRedirectPath(params.get("next"))
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
          window.location.assign(buildNext())
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
        disabled={pending}
        onClick={async () => {
          setPending(true)
          setError(null)
          const result = await authClient.signIn.social({
            provider: "google",
            callbackURL: buildNext(),
          })
          setPending(false)
          if (result.error) {
            console.error("Social sign-in failed", result.error)
            setError(result.error.message ?? "Social sign-in failed")
          }
        }}
      >
        Continue with Google
      </button>
      <p>
        <a
          href={`/sign-up${
            userCode
              ? `?next=${encodeURIComponent(
                  `/device?user_code=${encodeURIComponent(userCode)}`
                )}`
              : ""
          }`}
        >
          Need an account? Sign up
        </a>
      </p>
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
      <SignInPage />
    </Suspense>
  )
}
