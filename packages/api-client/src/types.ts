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
}
