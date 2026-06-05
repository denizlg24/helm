import {
  CurrentUserResponseSchema,
  type UpdateUserSettingsInput,
  UserSettingsResponseSchema,
} from "@workspace/types"
import type { HelmApiRequestClient } from "../types"

export const createUserModule = ({ request }: HelmApiRequestClient) => ({
  current: () =>
    request("/api/me", {}, (value) => CurrentUserResponseSchema.parse(value)),

  settings: () =>
    request("/api/me/settings", {}, (value) =>
      UserSettingsResponseSchema.parse(value)
    ),

  updateSettings: (input: UpdateUserSettingsInput) =>
    request(
      "/api/me/settings",
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      },
      (value) => UserSettingsResponseSchema.parse(value)
    ),
})

export type UserModule = ReturnType<typeof createUserModule>
