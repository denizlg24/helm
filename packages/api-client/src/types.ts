export interface HelmApiClientOptions {
  baseUrl: string
  getAuthHeaders?: () =>
    | HeadersInit
    | undefined
    | Promise<HeadersInit | undefined>
  getWorkspaceId?: () => string | undefined | Promise<string | undefined>
}

export interface HelmApiRequestClient {
  request: <T>(
    path: string,
    init: RequestInit,
    parse: (value: unknown) => T
  ) => Promise<T>
  jsonRequest: <T>(
    path: string,
    body: unknown,
    parse: (value: unknown) => T
  ) => Promise<T>
  jsonRequestWithMethod: <T>(
    path: string,
    method: "POST" | "PUT" | "PATCH" | "DELETE",
    body: unknown,
    parse: (value: unknown) => T
  ) => Promise<T>
  // POST a JSON body and consume a Server-Sent Events response, yielding each
  // parsed `data:` payload as it arrives.
  stream: <T>(
    path: string,
    body: unknown,
    parse: (value: unknown) => T,
    signal?: AbortSignal
  ) => AsyncGenerator<T, void, unknown>
}
