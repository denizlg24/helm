"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import {
  AuthAside,
  AuthFooter,
  AuthHeader,
  AuthShell,
} from "@workspace/ui/components/auth-shell"
import { Button } from "@workspace/ui/components/button"
import { FieldGroup, FieldSeparator } from "@workspace/ui/components/field"
import { TextField } from "@workspace/ui/components/form-field"
import { toast } from "@workspace/ui/components/sonner"
import { useSearchParams } from "next/navigation"
import { Suspense, useState } from "react"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { authClient } from "../../lib/auth-client"
import { consoleSignUpHref } from "../../lib/env"

const sanitizeRedirectPath = (value: string | null) => {
  if (!value?.startsWith("/") || value.startsWith("//")) {
    return "/"
  }
  return value
}

const SignInSchema = z.object({
  email: z.string().min(1, "Email is required").email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
})

type SignInValues = z.infer<typeof SignInSchema>

function SignInForm() {
  const params = useSearchParams()
  const next = sanitizeRedirectPath(params.get("next"))
  const [socialPending, setSocialPending] = useState(false)

  const form = useForm<SignInValues>({
    resolver: zodResolver(SignInSchema),
    defaultValues: { email: "", password: "" },
  })

  const onSubmit = form.handleSubmit(async (values) => {
    const result = await authClient.signIn.email(values)
    if (result.error) {
      toast.error(result.error.message ?? "Sign in failed")
      return
    }
    window.location.assign(next)
  })

  const continueWithGoogle = async () => {
    setSocialPending(true)
    const result = await authClient.signIn.social({
      provider: "google",
      callbackURL: next,
    })
    if (result.error) {
      setSocialPending(false)
      toast.error(result.error.message ?? "Google sign-in failed")
    }
  }

  const pending = form.formState.isSubmitting || socialPending

  return (
    <AuthShell
      aside={
        <AuthAside
          attribution="Helm"
          quote="Open your dashboard and pick up exactly where you left off."
        />
      }
    >
      <AuthHeader
        description="Sign in to open your Helm dashboard."
        title="Sign in"
      />

      <form noValidate onSubmit={onSubmit}>
        <FieldGroup>
          <TextField
            autoComplete="email"
            autoFocus
            control={form.control}
            disabled={pending}
            label="Email"
            name="email"
            placeholder="you@example.com"
            type="email"
          />
          <TextField
            autoComplete="current-password"
            control={form.control}
            disabled={pending}
            label="Password"
            name="password"
            placeholder="••••••••"
            type="password"
          />
          <Button
            className="w-full"
            disabled={pending}
            loading={form.formState.isSubmitting}
            size="lg"
            type="submit"
          >
            Sign in
          </Button>

          <FieldSeparator>or</FieldSeparator>

          <Button
            className="w-full"
            disabled={pending}
            loading={socialPending}
            onClick={continueWithGoogle}
            size="lg"
            type="button"
            variant="outline"
          >
            Continue with Google
          </Button>
        </FieldGroup>
      </form>

      <AuthFooter>
        Need an account?{" "}
        <a href={consoleSignUpHref}>Create one on the console</a>
      </AuthFooter>
    </AuthShell>
  )
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <SignInForm />
    </Suspense>
  )
}
