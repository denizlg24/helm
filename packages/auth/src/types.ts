import type { AuthContext, WorkspaceRole } from "@workspace/types"

export type HelmAuthContext = AuthContext
export type HelmWorkspaceRole = WorkspaceRole

export interface HelmAuthSession {
  user: {
    id: string
    email?: string
    name?: string
  }
  session: {
    id: string
    activeOrganizationId?: string | null
  }
}

export interface CreateHelmAuthClientOptions {
  baseURL?: string
  bearerToken?: () => string | Promise<string>
}
