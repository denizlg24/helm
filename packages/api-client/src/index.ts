import {
  type ApiTokensModule,
  createApiTokensModule,
} from "./modules/api-tokens"
import {
  type AssistantModule,
  createAssistantModule,
} from "./modules/assistant"
import { type BillingModule, createBillingModule } from "./modules/billing"
import {
  createDesktopInstallerModule,
  type DesktopInstallerModule,
} from "./modules/desktop-installer"
import { createDevicesModule, type DevicesModule } from "./modules/devices"
import { createFilesModule, type FilesModule } from "./modules/files"
import { createNotesModule, type NotesModule } from "./modules/notes"
import {
  createNotificationsModule,
  type NotificationsModule,
} from "./modules/notifications"
import {
  createOnboardingModule,
  type OnboardingModule,
} from "./modules/onboarding"
import { createPomodoroModule, type PomodoroModule } from "./modules/pomodoro"
import { createUsageModule, type UsageModule } from "./modules/usage"
import { createUserModule, type UserModule } from "./modules/user"
import {
  createWorkspaceModule,
  type WorkspaceModule,
} from "./modules/workspace"
import { createRequestClient } from "./request-client"
import type { HelmApiClientOptions } from "./types"

export * from "./errors"
export type { HelmApiClientOptions, HelmApiRequestClient } from "./types"

export interface HelmApiClient {
  user: UserModule
  workspace: WorkspaceModule
  devices: DevicesModule
  apiTokens: ApiTokensModule
  billing: BillingModule
  onboarding: OnboardingModule
  assistant: AssistantModule
  notes: NotesModule
  notifications: NotificationsModule
  pomodoro: PomodoroModule
  files: FilesModule
  usage: UsageModule
  desktopInstaller: DesktopInstallerModule
}

export const createHelmApiClient = (
  options: HelmApiClientOptions
): HelmApiClient => {
  const requestClient = createRequestClient(options)

  return {
    user: createUserModule(requestClient),
    workspace: createWorkspaceModule(requestClient),
    devices: createDevicesModule(requestClient),
    apiTokens: createApiTokensModule(requestClient),
    billing: createBillingModule(requestClient),
    onboarding: createOnboardingModule(requestClient),
    assistant: createAssistantModule(requestClient),
    notes: createNotesModule(requestClient),
    notifications: createNotificationsModule(requestClient),
    pomodoro: createPomodoroModule(requestClient),
    files: createFilesModule(requestClient),
    usage: createUsageModule(requestClient),
    desktopInstaller: createDesktopInstallerModule(requestClient),
  }
}
