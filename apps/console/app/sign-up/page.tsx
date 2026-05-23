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
      <h1>Create account</h1>
      <form
        onSubmit={async (event) => {
          event.preventDefault()
          setPending(true)
          setError(null)
          const formData = new FormData(event.currentTarget)
          const result = await authClient.signUp.email({
            name: String(formData.get("name") ?? ""),
            email: String(formData.get("email") ?? ""),
            password: String(formData.get("password") ?? ""),
          })
          setPending(false)
          if (result.error) {
            setError(result.error.message ?? "Sign up failed")
            return
          }
          router.push(buildNext())
          router.refresh()
        }}
      >
        <input name="name" placeholder="Name" required />
        <input
          name="email"
          placeholder="email@example.com"
          type="email"
          required
        />
        <input
          name="password"
          placeholder="Password"
          type="password"
          required
          minLength={8}
        />
        <button type="submit" disabled={pending}>
          {pending ? "Creating…" : "Create account"}
        </button>
      </form>
      {error ? <p style={{ color: "crimson" }}>{error}</p> : null}
    </main>
  )
}
