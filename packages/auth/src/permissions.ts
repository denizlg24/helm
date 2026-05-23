import { moduleDefinitions } from "@workspace/module-registry"
import { createAccessControl } from "better-auth/plugins/access"
import {
  adminAc,
  defaultStatements,
  memberAc,
  ownerAc,
} from "better-auth/plugins/organization/access"

const modulePermissionEntries = Object.fromEntries(
  moduleDefinitions.map((moduleDefinition) => [
    moduleDefinition.id,
    ["read", "write", "delete", "admin"],
  ])
) as Record<(typeof moduleDefinitions)[number]["id"], string[]>

export const helmPermissionStatement = {
  ...defaultStatements,
  workspace: ["read", "update", "delete"],
  module: ["read", "enable", "disable", "configure"],
  apiKey: ["create", "read", "update", "delete"],
  device: ["create", "read", "revoke"],
  billing: ["read", "manage"],
  usage: ["read"],
  ...modulePermissionEntries,
} as const

export const helmAccessControl = createAccessControl(helmPermissionStatement)

export const owner = helmAccessControl.newRole({
  ...ownerAc.statements,
  workspace: ["read", "update", "delete"],
  module: ["read", "enable", "disable", "configure"],
  apiKey: ["create", "read", "update", "delete"],
  device: ["create", "read", "revoke"],
  billing: ["read", "manage"],
  usage: ["read"],
  ...modulePermissionEntries,
})

export const admin = helmAccessControl.newRole({
  ...adminAc.statements,
  workspace: ["read", "update"],
  module: ["read", "enable", "disable", "configure"],
  apiKey: ["create", "read", "update", "delete"],
  device: ["create", "read", "revoke"],
  billing: ["read", "manage"],
  usage: ["read"],
})

export const member = helmAccessControl.newRole({
  ...memberAc.statements,
  workspace: ["read"],
  module: ["read"],
  device: ["read"],
  billing: ["read"],
  usage: ["read"],
})

export const helmApiKeyPermissionStatement = {
  workspace: ["read", "update"],
  module: ["read", "configure"],
  apiKey: ["read", "update"],
  device: ["read", "revoke"],
  usage: ["read"],
  ...modulePermissionEntries,
} as const
