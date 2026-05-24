import { Injectable } from "@nestjs/common"
import { db } from "@workspace/db"
import { auditLog } from "@workspace/db/schema"
import type { AuthContext } from "@workspace/types"

@Injectable()
export class AuditService {
  async write(
    authContext: AuthContext,
    input: {
      action: string
      resourceType: string
      resourceId?: string
      metadataJson?: Record<string, unknown>
    }
  ) {
    await db.insert(auditLog).values({
      id: crypto.randomUUID(),
      tenantId: authContext.tenantId,
      workspaceId: authContext.workspaceId,
      actorUserId: authContext.userId,
      actorType: authContext.authMethod === "api-key" ? "api-key" : "user",
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      metadataJson: input.metadataJson ?? {},
    })
  }

  async writeSystem(
    context: { tenantId: string; workspaceId: string },
    input: {
      action: string
      resourceType: string
      resourceId?: string
      metadataJson?: Record<string, unknown>
    }
  ) {
    await db.insert(auditLog).values({
      id: crypto.randomUUID(),
      tenantId: context.tenantId,
      workspaceId: context.workspaceId,
      actorUserId: null,
      actorType: "system",
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      metadataJson: input.metadataJson ?? {},
    })
  }
}
