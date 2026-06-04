import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common"
import {
  type AuthContext,
  CreateNoteGroupInputSchema,
  CreateNoteInputSchema,
  NotesQuerySchema,
  UpdateNoteGroupInputSchema,
  UpdateNoteInputSchema,
} from "@workspace/types"
import { z } from "zod"
import {
  CurrentAuthContext,
  RequireModule,
  RequireScopes,
  RequireWorkspace,
} from "../auth/auth.decorators"
// biome-ignore lint/style/useImportType: Nest DI needs runtime metadata.
import { NotesService } from "./notes.service"

const IdParamSchema = z.string().min(1)

@Controller("api/notes")
@RequireWorkspace()
@RequireModule("notes")
export class NotesController {
  constructor(private readonly notes: NotesService) {}

  @Get()
  @RequireScopes("notes:read")
  async list(
    @CurrentAuthContext() actor: AuthContext,
    @Query() query: Record<string, string | undefined>
  ) {
    return this.notes.list(actor, NotesQuerySchema.parse(query))
  }

  @Get("graph")
  @RequireScopes("notes:read")
  async graph(@CurrentAuthContext() actor: AuthContext) {
    return this.notes.graph(actor)
  }

  @Get("folders")
  @RequireScopes("notes:read")
  async folders(@CurrentAuthContext() actor: AuthContext) {
    return this.notes.folders(actor)
  }

  @Get("tags")
  @RequireScopes("notes:read")
  async tags(@CurrentAuthContext() actor: AuthContext) {
    return this.notes.tags(actor)
  }

  @Post()
  @RequireScopes("notes:write")
  async create(
    @CurrentAuthContext() actor: AuthContext,
    @Body() body: unknown
  ) {
    return this.notes.create(actor, CreateNoteInputSchema.parse(body))
  }

  @Get(":id")
  @RequireScopes("notes:read")
  async get(@CurrentAuthContext() actor: AuthContext, @Param("id") id: string) {
    return this.notes.get(actor, IdParamSchema.parse(id))
  }

  @Patch(":id")
  @RequireScopes("notes:write")
  async update(
    @CurrentAuthContext() actor: AuthContext,
    @Param("id") id: string,
    @Body() body: unknown
  ) {
    return this.notes.update(
      actor,
      IdParamSchema.parse(id),
      UpdateNoteInputSchema.parse(body)
    )
  }

  @Delete(":id")
  @RequireScopes("notes:write")
  async delete(
    @CurrentAuthContext() actor: AuthContext,
    @Param("id") id: string
  ) {
    return this.notes.delete(actor, IdParamSchema.parse(id))
  }
}

@Controller("api/note-groups")
@RequireWorkspace()
@RequireModule("notes")
export class NoteGroupsController {
  constructor(private readonly notes: NotesService) {}

  @Get()
  @RequireScopes("notes:read")
  async list(@CurrentAuthContext() actor: AuthContext) {
    return this.notes.listGroups(actor)
  }

  @Post()
  @RequireScopes("notes:write")
  async create(
    @CurrentAuthContext() actor: AuthContext,
    @Body() body: unknown
  ) {
    return this.notes.createGroup(actor, CreateNoteGroupInputSchema.parse(body))
  }

  @Patch(":id")
  @RequireScopes("notes:write")
  async update(
    @CurrentAuthContext() actor: AuthContext,
    @Param("id") id: string,
    @Body() body: unknown
  ) {
    return this.notes.updateGroup(
      actor,
      IdParamSchema.parse(id),
      UpdateNoteGroupInputSchema.parse(body)
    )
  }

  @Delete(":id")
  @RequireScopes("notes:write")
  async delete(
    @CurrentAuthContext() actor: AuthContext,
    @Param("id") id: string
  ) {
    return this.notes.deleteGroup(actor, IdParamSchema.parse(id))
  }
}
