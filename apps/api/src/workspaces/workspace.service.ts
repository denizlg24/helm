import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common"
import {
  and,
  db,
  entitlements,
  eq,
  member,
  moduleConfigs,
  tenants,
  workspaces,
} from "@workspace/db"
import { coreMvpModuleIds } from "@workspace/module-registry"
import type { AuthContext } from "@workspace/types"

interface ResolveAuthContextInput {
  userId: string
  sessionId?: string
  workspaceId?: string
  authMethod: AuthContext["authMethod"]
}

const normalizeRole = (role: string): AuthContext["role"] => {
  if (role.includes("owner")) {
    return "owner"
  }
  if (role.includes("admin")) {
    return "admin"
  }
  return "member"
}

@Injectable()
export class WorkspaceService {
  async listForUser(userId: string) {
    return db
      .select({ workspace: workspaces, role: member.role })
      .from(member)
      .innerJoin(workspaces, eq(member.organizationId, workspaces.id))
      .where(eq(member.userId, userId))
  }

  async resolveAuthContext(
    input: ResolveAuthContextInput
  ): Promise<AuthContext> {
    const memberships = await this.listForUser(input.userId)
    const selected =
      memberships.find(({ workspace }) => workspace.id === input.workspaceId) ??
      (input.workspaceId ? undefined : memberships[0])

    if (!selected) {
      throw new ForbiddenException("Workspace membership required")
    }

    const enabledModules = await db
      .select({ moduleId: moduleConfigs.moduleId })
      .from(moduleConfigs)
      .where(
        and(
          eq(moduleConfigs.workspaceId, selected.workspace.id),
          eq(moduleConfigs.enabled, true)
        )
      )

    const entitlementRows = await db
      .select()
      .from(entitlements)
      .where(eq(entitlements.workspaceId, selected.workspace.id))
      .limit(1)

    return {
      userId: input.userId,
      sessionId: input.sessionId,
      workspaceId: selected.workspace.id,
      tenantId: selected.workspace.tenantId,
      role: normalizeRole(selected.role),
      authMethod: input.authMethod,
      scopes: [],
      enabledModules: enabledModules.map((row) => row.moduleId),
      entitlements: entitlementRows[0]?.featuresJson ?? {},
    }
  }

  async getWorkspace(workspaceId: string) {
    const rows = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1)

    const workspace = rows[0]
    if (!workspace) {
      throw new NotFoundException("Workspace not found")
    }
    return workspace
  }

  async provisionFirstWorkspace(input: {
    organizationId: string
    userId: string
    displayName: string
    slug: string
    theme: string
  }) {
    const tenantId = crypto.randomUUID()
    const now = new Date()

    await db.insert(tenants).values({
      id: tenantId,
      createdAt: now,
      updatedAt: now,
    })

    await db.insert(workspaces).values({
      id: input.organizationId,
      tenantId,
      createdByUserId: input.userId,
      displayName: input.displayName,
      slug: input.slug,
      theme: input.theme,
      status: "active",
      createdAt: now,
      updatedAt: now,
    })

    await db.insert(moduleConfigs).values(
      coreMvpModuleIds.map((moduleId) => ({
        id: crypto.randomUUID(),
        tenantId,
        workspaceId: input.organizationId,
        moduleId,
        enabled: true,
        settingsJson: {},
        createdAt: now,
        updatedAt: now,
      }))
    )

    await db.insert(entitlements).values({
      id: crypto.randomUUID(),
      tenantId,
      workspaceId: input.organizationId,
      plan: "starter",
      featuresJson: { assistant: true },
      limitsJson: {},
      validFrom: now,
    })

    return this.getWorkspace(input.organizationId)
  }
}
