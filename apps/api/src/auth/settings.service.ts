import { Injectable } from "@nestjs/common"
import { db, eq, userSettings } from "@workspace/db"
import {
  type UpdateUserSettingsInput,
  type UserSettings,
  UserSettingsSchema,
} from "@workspace/types"

@Injectable()
export class SettingsService {
  async get(userId: string): Promise<UserSettings> {
    const [row] = await db
      .select({ settingsJson: userSettings.settingsJson })
      .from(userSettings)
      .where(eq(userSettings.userId, userId))
      .limit(1)

    // Parsing fills defaults for missing keys and for a brand-new user.
    return UserSettingsSchema.parse(row?.settingsJson ?? {})
  }

  async update(
    userId: string,
    input: UpdateUserSettingsInput
  ): Promise<UserSettings> {
    const current = await this.get(userId)
    const merged = UserSettingsSchema.parse({
      appearance: { ...current.appearance, ...input.appearance },
      shortcuts: { ...current.shortcuts, ...input.shortcuts },
      modules: { ...current.modules, ...input.modules },
    })

    const now = new Date()
    await db
      .insert(userSettings)
      .values({
        userId,
        settingsJson: merged,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: userSettings.userId,
        set: { settingsJson: merged, updatedAt: now },
      })

    return merged
  }
}
