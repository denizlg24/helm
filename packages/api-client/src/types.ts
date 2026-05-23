export interface HelmApiClientOptions {
  baseUrl: string
  getAuthHeaders?: () => HeadersInit | Promise<HeadersInit> | undefined
  getWorkspaceId?: () => string | Promise<string | undefined> | undefined
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
