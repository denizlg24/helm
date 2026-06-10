import { Module } from "@nestjs/common"
import { NotificationsController } from "./notifications.controller"
import { NotificationsRepository } from "./notifications.repository"
import { NotificationsService } from "./notifications.service"
import { NotificationsEventsService } from "./notifications-events.service"

@Module({
  controllers: [NotificationsController],
  providers: [
    NotificationsRepository,
    NotificationsEventsService,
    NotificationsService,
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
