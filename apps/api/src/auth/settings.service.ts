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

    // Deep merge modules: for each module, merge its nested fields
    const mergedModules: Record<string, unknown> = {}
    const allModuleKeys = new Set([
      ...Object.keys(current.modules ?? {}),
      ...Object.keys(input.modules ?? {}),
    ])

    for (const moduleKey of allModuleKeys) {
      const currentModule = (current.modules as Record<string, unknown>)?.[
        moduleKey
      ]
      const inputModule = (input.modules as Record<string, unknown>)?.[
        moduleKey
      ]

      if (
        inputModule &&
        typeof inputModule === "object" &&
        !Array.isArray(inputModule) &&
        currentModule &&
        typeof currentModule === "object" &&
        !Array.isArray(currentModule)
      ) {
        // Both exist and are objects: deep merge
        mergedModules[moduleKey] = {
          ...(currentModule as Record<string, unknown>),
          ...(inputModule as Record<string, unknown>),
        }
      } else if (inputModule !== undefined) {
        // Input overwrites
        mergedModules[moduleKey] = inputModule
      } else {
        // Preserve current
        mergedModules[moduleKey] = currentModule
      }
    }

    const merged = UserSettingsSchema.parse({
      appearance: { ...current.appearance, ...input.appearance },
      shortcuts: { ...current.shortcuts, ...input.shortcuts },
      assistant: { ...current.assistant, ...input.assistant },
      modules: mergedModules,
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
