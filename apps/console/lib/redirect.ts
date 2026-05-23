export const sanitizeRedirectPath = (value: string | null) => {
  if (!value?.startsWith("/") || value.startsWith("//")) {
    return "/"
  }
  return value
}

export const buildNext = (next: string, userCode: string | null) => {
  if (next === "/device" && userCode) {
    return `/device?user_code=${encodeURIComponent(userCode)}`
  }
  return next
}

export const signUpHref = (userCode: string | null) =>
  userCode
    ? `/sign-up?next=${encodeURIComponent(
        `/device?user_code=${encodeURIComponent(userCode)}`
      )}`
    : "/sign-up"

export const signInHref = (userCode: string | null) =>
  userCode
    ? `/sign-in?next=${encodeURIComponent(
        `/device?user_code=${encodeURIComponent(userCode)}`
      )}`
    : "/sign-in"
