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
    if (
      response.status === 204 ||
      response.headers.get("content-length") === "0"
    ) {
      return parse(undefined)
    }
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

  async function* stream<T>(
    path: string,
    body: unknown,
    parse: (value: unknown) => T,
    signal?: AbortSignal
  ): AsyncGenerator<T, void, unknown> {
    const headers = new Headers({
      "content-type": "application/json",
      accept: "text/event-stream",
    })

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
      method: "POST",
      headers,
      body: JSON.stringify(body),
      credentials: "include",
      signal,
    })

    await throwForStatus(response)

    const reader = response.body?.getReader()
    if (!reader) {
      return
    }

    const decoder = new TextDecoder()
    let buffer = ""

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        let separator = buffer.indexOf("\n\n")
        while (separator !== -1) {
          const rawEvent = buffer.slice(0, separator)
          buffer = buffer.slice(separator + 2)
          const data = rawEvent
            .split("\n")
            .filter((line) => line.startsWith("data:"))
            .map((line) => line.slice(5).trimStart())
            .join("\n")
          if (data.length > 0) {
            yield parse(JSON.parse(data))
          }
          separator = buffer.indexOf("\n\n")
        }
      }
    } finally {
      reader.releaseLock()
    }
  }

  return { request, jsonRequest, stream }
}
