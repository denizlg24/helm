"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import {
  AuthAside,
  AuthFooter,
  AuthHeader,
  AuthShell,
} from "@workspace/ui/components/auth-shell"
import { Button } from "@workspace/ui/components/button"
import { FieldGroup } from "@workspace/ui/components/field"
import { TextField } from "@workspace/ui/components/form-field"
import { toast } from "@workspace/ui/components/sonner"
import { useSearchParams } from "next/navigation"
import { Suspense } from "react"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { authClient } from "../../lib/auth-client"
import { buildNext, sanitizeRedirectPath, signInHref } from "../../lib/redirect"

const SignUpSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().min(1, "Email is required").email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
})

type SignUpValues = z.infer<typeof SignUpSchema>

function SignUpForm() {
  const params = useSearchParams()
  const next = sanitizeRedirectPath(params.get("next"))
  const userCode = params.get("user_code")

  const form = useForm<SignUpValues>({
    resolver: zodResolver(SignUpSchema),
    defaultValues: { name: "", email: "", password: "" },
  })

  const onSubmit = form.handleSubmit(async (values) => {
    const result = await authClient.signUp.email(values)
    if (result.error) {
      toast.error(result.error.message ?? "Sign up failed")
      return
    }
    window.location.assign(buildNext(next, userCode))
  })

  const pending = form.formState.isSubmitting

  return (
    <AuthShell
      aside={
        <AuthAside
          attribution="Helm"
          quote="Your private operating system for notes, tasks, people, and more."
        />
      }
    >
      <AuthHeader
        description="Create your account to set up a workspace."
        title="Create account"
      />

      <form noValidate onSubmit={onSubmit}>
        <FieldGroup>
          <TextField
            autoComplete="name"
            autoFocus
            control={form.control}
            disabled={pending}
            label="Name"
            name="name"
            placeholder="Ada Lovelace"
          />
          <TextField
            autoComplete="email"
            control={form.control}
            disabled={pending}
            label="Email"
            name="email"
            placeholder="you@example.com"
            type="email"
          />
          <TextField
            autoComplete="new-password"
            control={form.control}
            description="At least 8 characters."
            disabled={pending}
            label="Password"
            name="password"
            placeholder="••••••••"
            type="password"
          />
          <Button className="w-full" loading={pending} size="lg" type="submit">
            Create account
          </Button>
        </FieldGroup>
      </form>

      <AuthFooter>
        Already have an account? <a href={signInHref(userCode)}>Sign in</a>
      </AuthFooter>
    </AuthShell>
  )
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <SignUpForm />
    </Suspense>
  )
}
