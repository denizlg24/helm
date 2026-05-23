import {
  EntitlementRequiredError,
  ForbiddenError,
  ModuleDisabledError,
  RateLimitedError,
  UnauthorizedError,
  ValidationError,
} from "./errors"
import type { HelmApiClientOptions, HelmApiRequestClient } from "./types"

const parseError = async (response: Response) => {
  try {
    const body = (await response.json()) as { code?: string; message?: string }
    return {
      code: body.code,
      message: body.message ?? response.statusText,
    }
  } catch {
    return {
      code: undefined,
      message: response.statusText,
    }
  }
}

const throwForStatus = async (response: Response) => {
  if (response.ok) {
    return
  }

  const error = await parseError(response)

  if (response.status === 401) {
    throw new UnauthorizedError(error.message)
  }
  if (response.status === 403 && error.code === "MODULE_DISABLED") {
    throw new ModuleDisabledError(error.message)
  }
  if (response.status === 403 && error.code === "ENTITLEMENT_REQUIRED") {
    throw new EntitlementRequiredError(error.message)
  }
  if (response.status === 403) {
    throw new ForbiddenError(error.message)
  }
  if (response.status === 400 || response.status === 422) {
    throw new ValidationError(error.message)
  }
  if (response.status === 429) {
    throw new RateLimitedError(error.message)
  }

  throw new Error(error.message)
}

export const createRequestClient = (
  options: HelmApiClientOptions
): HelmApiRequestClient => {
  const request = async <T>(
    path: string,
    init: RequestInit,
    parse: (value: unknown) => T
  ) => {
    const headers = new Headers(init.headers)
    headers.set("accept", "application/json")

    const authHeaders = await options.getAuthHeaders?.()
    if (authHeaders) {
      new Headers(authHeaders).forEach((value, key) => {
        headers.set(key, value)
      })
    }

    const workspaceId = await options.getWorkspaceId?.()
    if (workspaceId) {
      headers.set("x-helm-workspace-id", workspaceId)
    }

    const response = await fetch(new URL(path, options.baseUrl), {
      ...init,
      headers,
      credentials: init.credentials ?? "include",
    })

    await throwForStatus(response)
    return parse(await response.json())
  }

  const jsonRequest = async <T>(
    path: string,
    body: unknown,
    parse: (value: unknown) => T
  ) =>
    request(
      path,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      },
      parse
    )

  return { request, jsonRequest }
}
