import { Module } from "@nestjs/common"
import { AuditModule } from "../audit/audit.module"
import { PomodoroController } from "./pomodoro.controller"
import { PomodoroRepository } from "./pomodoro.repository"
import { PomodoroService } from "./pomodoro.service"
import { PomodoroAssistantToolProvider } from "./pomodoro-assistant-tools"

@Module({
  imports: [AuditModule],
  controllers: [PomodoroController],
  providers: [
    PomodoroRepository,
    PomodoroService,
    PomodoroAssistantToolProvider,
  ],
  exports: [PomodoroService],
})
export class PomodoroModule {}
