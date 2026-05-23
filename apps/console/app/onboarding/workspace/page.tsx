"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import { apiClient } from "../../../lib/api-client"

export default function Page() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  return (
    <main>
      <h1>Workspace setup</h1>
      <form
        onSubmit={async (event) => {
          event.preventDefault()
          setPending(true)
          setError(null)
          const formData = new FormData(event.currentTarget)
          const displayName = String(formData.get("displayName") ?? "").trim()
          const slug = String(formData.get("slug") ?? "").trim()
          if (!displayName || !slug) {
            setPending(false)
            setError("Workspace name and slug are required")
            return
          }
          try {
            await apiClient.workspace.create({
              displayName,
              slug,
              theme: "sky",
            })
            router.push("/")
          } catch (error) {
            console.error("Workspace creation failed", error)
            setError(
              error instanceof Error
                ? error.message
                : "Workspace creation failed"
            )
          } finally {
            setPending(false)
          }
        }}
      >
        <input name="displayName" placeholder="Workspace name" required />
        <input
          name="slug"
          placeholder="workspace-slug"
          required
          pattern="[a-z0-9-]+"
        />
        <button type="submit" disabled={pending}>
          {pending ? "Creating..." : "Create workspace"}
        </button>
      </form>
      {error ? <p style={{ color: "crimson" }}>{error}</p> : null}
    </main>
  )
}
