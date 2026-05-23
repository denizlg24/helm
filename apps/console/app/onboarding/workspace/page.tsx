"use client"

import { authClient } from "../../../lib/auth-client"

export default function Page() {
  return (
    <main>
      <h1>Workspace setup</h1>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          const formData = new FormData(event.currentTarget)
          void authClient.organization.create({
            name: String(formData.get("displayName") ?? ""),
            slug: String(formData.get("slug") ?? ""),
          })
        }}
      >
        <input name="displayName" placeholder="Workspace name" />
        <input name="slug" placeholder="workspace-slug" />
        <button type="submit">Create workspace</button>
      </form>
    </main>
  )
}
