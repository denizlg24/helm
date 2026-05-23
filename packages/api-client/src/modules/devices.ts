import { RevokeDeviceInputSchema } from "@workspace/types"
import type { HelmApiRequestClient } from "../types"

export const createDevicesModule = ({
  request,
  jsonRequest,
}: HelmApiRequestClient) => ({
  list: () => request("/api/devices", {}, (value) => value),
  revoke: (deviceId: string) =>
    jsonRequest(
      "/api/devices/revoke",
      RevokeDeviceInputSchema.parse({ deviceId }),
      (value) => value
    ),
})

export type DevicesModule = ReturnType<typeof createDevicesModule>
