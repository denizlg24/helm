import { Module } from "@nestjs/common"
import { AuditModule } from "../audit/audit.module"
import { NoteGroupsController, NotesController } from "./notes.controller"
import { NotesRepository } from "./notes.repository"
import { NotesService } from "./notes.service"
import { NotesAssistantToolProvider } from "./notes-assistant-tools"

@Module({
  imports: [AuditModule],
  controllers: [NotesController, NoteGroupsController],
  providers: [NotesRepository, NotesService, NotesAssistantToolProvider],
  exports: [NotesService],
})
export class NotesModule {}
