import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from "@nestjs/common"
import {
  type AuthContext,
  CreatePomodoroSessionInputSchema,
  PomodoroSessionsQuerySchema,
  UpdatePomodoroSessionInputSchema,
  UpdatePomodoroSettingsInputSchema,
} from "@workspace/types"
import { z } from "zod"
import {
  CurrentAuthContext,
  RequireModule,
  RequireScopes,
  RequireWorkspace,
} from "../auth/auth.decorators"
// biome-ignore lint/style/useImportType: Nest DI needs runtime metadata.
import { PomodoroService } from "./pomodoro.service"

const IdParamSchema = z.string().min(1)

@Controller("api/pomodoro")
@RequireWorkspace()
@RequireModule("pomodoro")
export class PomodoroController {
  constructor(private readonly pomodoro: PomodoroService) {}

  @Get("settings")
  @RequireScopes("pomodoro:read")
  async getSettings(@CurrentAuthContext() actor: AuthContext) {
    return this.pomodoro.getSettings(actor)
  }

  @Put("settings")
  @RequireScopes("pomodoro:write")
  async updateSettings(
    @CurrentAuthContext() actor: AuthContext,
    @Body() body: unknown
  ) {
    return this.pomodoro.updateSettings(
      actor,
      UpdatePomodoroSettingsInputSchema.parse(body)
    )
  }

  @Get("sessions")
  @RequireScopes("pomodoro:read")
  async listSessions(
    @CurrentAuthContext() actor: AuthContext,
    @Query() query: Record<string, string | undefined>
  ) {
    return this.pomodoro.listSessions(
      actor,
      PomodoroSessionsQuerySchema.parse(query)
    )
  }

  @Post("sessions")
  @RequireScopes("pomodoro:write")
  async createSession(
    @CurrentAuthContext() actor: AuthContext,
    @Body() body: unknown
  ) {
    return this.pomodoro.createSession(
      actor,
      CreatePomodoroSessionInputSchema.parse(body)
    )
  }

  @Patch("sessions/:id")
  @RequireScopes("pomodoro:write")
  async updateSession(
    @CurrentAuthContext() actor: AuthContext,
    @Param("id") id: string,
    @Body() body: unknown
  ) {
    return this.pomodoro.updateSession(
      actor,
      IdParamSchema.parse(id),
      UpdatePomodoroSessionInputSchema.parse(body)
    )
  }

  @Delete("sessions/:id")
  @RequireScopes("pomodoro:write")
  async deleteSession(
    @CurrentAuthContext() actor: AuthContext,
    @Param("id") id: string
  ) {
    return this.pomodoro.deleteSession(actor, IdParamSchema.parse(id))
  }
}
