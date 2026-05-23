import { CurrentUserResponseSchema } from "@workspace/types"
import type { HelmApiRequestClient } from "../types"

export const createUserModule = ({ request }: HelmApiRequestClient) => ({
  current: () =>
    request("/api/me", {}, (value) => CurrentUserResponseSchema.parse(value)),
})

export type UserModule = ReturnType<typeof createUserModule>
