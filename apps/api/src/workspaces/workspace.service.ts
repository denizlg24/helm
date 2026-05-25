import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common"
import { auth } from "@workspace/auth/server"
import {
  and,
  db,
  entitlements,
  eq,
  member,
  moduleConfigs,
  onboardingSelections,
  tenants,
  user as userTable,
  workspaces,
} from "@workspace/db"
import { defaultEnabledModuleIds } from "@workspace/module-registry"
import type { AuthContext } from "@workspace/types"
// biome-ignore lint/style/useImportType: Nest DI needs runtime metadata.
import { AuditService } from "../audit/audit.service"
import { PLAN_DEFINITIONS } from "../billing/billing.catalog"
// biome-ignore lint/style/useImportType: Nest DI needs runtime metadata.
import { EntitlementService } from "../entitlements/entitlement.service"

interface ResolveAuthContextInput {
  userId: string
  sessionId?: string
  workspaceId?: string
  authMethod: AuthContext["authMethod"]
  scopes?: string[]
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
  constructor(
    private readonly auditService: AuditService,
    private readonly entitlementService: EntitlementService
  ) {}

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

    const workspaceEntitlements =
      await this.entitlementService.getWorkspaceEntitlements(
        selected.workspace.id
      )

    const userRows = await db
      .select({ name: userTable.name, email: userTable.email })
      .from(userTable)
      .where(eq(userTable.id, input.userId))
      .limit(1)
    const actorUser = userRows[0]

    return {
      userId: input.userId,
      userName: actorUser?.name,
      userEmail: actorUser?.email,
      sessionId: input.sessionId,
      workspaceId: selected.workspace.id,
      workspaceName: selected.workspace.displayName,
      tenantId: selected.workspace.tenantId,
      role: normalizeRole(selected.role),
      authMethod: input.authMethod,
      scopes: input.scopes ?? [],
      enabledModules: enabledModules.map((row) => row.moduleId),
      entitlements: workspaceEntitlements,
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

  async assertOnboardingActive(workspaceId: string): Promise<void> {
    const workspace = await this.getWorkspace(workspaceId)
    if (workspace.onboardingCompletedAt) {
      throw new ForbiddenException("Onboarding is already complete")
    }
  }

  async completeOnboarding(authContext: AuthContext) {
    const existing = await this.getWorkspace(authContext.workspaceId)

    let workspace = existing
    if (!existing.onboardingCompletedAt) {
      const now = new Date()
      const rows = await db
        .update(workspaces)
        .set({ onboardingCompletedAt: now, updatedAt: now })
        .where(eq(workspaces.id, authContext.workspaceId))
        .returning()
      if (!rows[0]) {
        throw new NotFoundException("Workspace not found")
      }
      workspace = rows[0]
    }

    // The selection only exists to restore the in-progress checkout session;
    // once onboarding is complete it is no longer needed.
    await db
      .delete(onboardingSelections)
      .where(eq(onboardingSelections.workspaceId, authContext.workspaceId))

    await this.auditService.write(authContext, {
      action: "workspace.onboarding.complete",
      resourceType: "workspace",
      resourceId: authContext.workspaceId,
    })

    return workspace
  }

  async provisionFirstWorkspace(input: {
    userId: string
    displayName: string
    slug: string
    theme: string
  }) {
    const tenantId = crypto.randomUUID()
    const now = new Date()
    const organization = await auth.api.createOrganization({
      body: {
        name: input.displayName,
        slug: input.slug,
        userId: input.userId,
      },
    })

    await db.transaction(async (tx) => {
      await tx.insert(tenants).values({
        id: tenantId,
        createdAt: now,
        updatedAt: now,
      })

      await tx.insert(workspaces).values({
        id: organization.id,
        tenantId,
        createdByUserId: input.userId,
        displayName: input.displayName,
        slug: input.slug,
        theme: input.theme,
        status: "active",
        createdAt: now,
        updatedAt: now,
      })

      await tx.insert(moduleConfigs).values(
        defaultEnabledModuleIds.map((moduleId) => ({
          id: crypto.randomUUID(),
          tenantId,
          workspaceId: organization.id,
          moduleId,
          enabled: true,
          settingsJson: {},
          createdAt: now,
          updatedAt: now,
        }))
      )

      await tx.insert(entitlements).values({
        id: crypto.randomUUID(),
        tenantId,
        workspaceId: organization.id,
        plan: "starter",
        featuresJson: PLAN_DEFINITIONS.starter.features,
        limitsJson: PLAN_DEFINITIONS.starter.limits,
        validFrom: now,
      })
    })

    await this.auditService.write(
      {
        userId: input.userId,
        workspaceId: organization.id,
        tenantId,
        role: "owner",
        authMethod: "session",
        scopes: [],
        enabledModules: [...defaultEnabledModuleIds],
        entitlements: PLAN_DEFINITIONS.starter.features,
      },
      {
        action: "workspace.create",
        resourceType: "workspace",
        resourceId: organization.id,
      }
    )

    return this.getWorkspace(organization.id)
  }
}
