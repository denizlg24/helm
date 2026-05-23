import { getSessionCookie } from "better-auth/cookies"
import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"

const WebProxyEnvSchema = z.object({
  HELM_CONSOLE_URL: z.string().url().default("http://localhost:3002"),
})

const env = WebProxyEnvSchema.parse(process.env)

export function proxy(request: NextRequest) {
  const sessionCookie = getSessionCookie(request)
  if (!sessionCookie) {
    const signInUrl = new URL("/sign-in", env.HELM_CONSOLE_URL)
    signInUrl.searchParams.set("redirect", request.nextUrl.href)
    return NextResponse.redirect(signInUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/((?!_next|favicon.ico|icon.png).*)"],
}
