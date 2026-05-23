import { Injectable, NotFoundException } from "@nestjs/common"
import { and, db, devices, eq, isNull } from "@workspace/db"
import type { AuthContext } from "@workspace/types"

@Injectable()
export class DeviceService {
  async list(authContext: AuthContext) {
    return db
      .select()
      .from(devices)
      .where(
        and(
          eq(devices.workspaceId, authContext.workspaceId),
          eq(devices.userId, authContext.userId),
          isNull(devices.revokedAt)
        )
      )
  }

  async revoke(authContext: AuthContext, deviceId: string) {
    const now = new Date()
    const rows = await db
      .update(devices)
      .set({ revokedAt: now, updatedAt: now })
      .where(
        and(
          eq(devices.id, deviceId),
          eq(devices.workspaceId, authContext.workspaceId),
          eq(devices.userId, authContext.userId),
          isNull(devices.revokedAt)
        )
      )
      .returning({ id: devices.id })

    if (!rows[0]) {
      throw new NotFoundException("Device not found")
    }

    return { revoked: true, deviceId: rows[0].id }
  }
}
