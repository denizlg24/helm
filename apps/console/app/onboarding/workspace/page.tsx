"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { CreateWorkspaceInputSchema } from "@workspace/types"
import {
  AuthAside,
  AuthHeader,
  AuthShell,
} from "@workspace/ui/components/auth-shell"
import { Button } from "@workspace/ui/components/button"
import { FieldGroup } from "@workspace/ui/components/field"
import { TextField } from "@workspace/ui/components/form-field"
import { toast } from "@workspace/ui/components/sonner"
import { useRouter } from "next/navigation"
import { useEffect, useRef } from "react"
import { useForm } from "react-hook-form"
import type { z } from "zod"
import { apiClient } from "../../../lib/api-client"

type WorkspaceValues = z.input<typeof CreateWorkspaceInputSchema>

const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)

export default function Page() {
  const router = useRouter()
  const lastAutoSlug = useRef("")

  const form = useForm<WorkspaceValues>({
    resolver: zodResolver(CreateWorkspaceInputSchema),
    defaultValues: { displayName: "", slug: "", theme: "sky" },
  })

  const displayName = form.watch("displayName")

  // Keep the slug in sync with the name until the user edits it directly.
  useEffect(() => {
    const next = slugify(displayName)
    const current = form.getValues("slug")
    if (current === "" || current === lastAutoSlug.current) {
      lastAutoSlug.current = next
      form.setValue("slug", next, { shouldValidate: current !== "" })
    }
  }, [displayName, form])

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await apiClient.workspace.create({
        ...values,
        theme: values.theme ?? "sky",
      })
      router.push("/onboarding")
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Workspace creation failed"
      )
    }
  })

  const pending = form.formState.isSubmitting

  return (
    <AuthShell
      aside={
        <AuthAside
          attribution="Helm"
          quote="A workspace is your home base — name it, then start steering."
        />
      }
    >
      <AuthHeader
        description="Set up your workspace to finish getting started."
        title="Create your workspace"
      />

      <form noValidate onSubmit={onSubmit}>
        <FieldGroup>
          <TextField
            autoFocus
            control={form.control}
            disabled={pending}
            label="Workspace name"
            name="displayName"
            placeholder="Personal"
          />
          <TextField
            control={form.control}
            description="Lowercase letters, numbers, and hyphens."
            disabled={pending}
            label="Workspace URL slug"
            name="slug"
            placeholder="personal"
          />
          <Button className="w-full" loading={pending} size="lg" type="submit">
            Create workspace
          </Button>
        </FieldGroup>
      </form>
    </AuthShell>
  )
}
