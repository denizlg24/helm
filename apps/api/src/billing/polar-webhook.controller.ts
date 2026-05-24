import {
  Controller,
  ForbiddenException,
  Headers,
  HttpCode,
  Post,
  Req,
} from "@nestjs/common"
import type { FastifyRequest } from "fastify"
import { Public } from "../auth/auth.decorators"
// biome-ignore lint/style/useImportType: Nest DI needs runtime metadata for PolarWebhookService.
import {
  InvalidWebhookSignatureError,
  PolarWebhookService,
} from "./polar-webhook.service"

@Controller("api/billing")
export class PolarWebhookController {
  constructor(private readonly webhookService: PolarWebhookService) {}

  @Post("webhook")
  @Public()
  @HttpCode(200)
  async handle(
    @Req() request: FastifyRequest,
    @Headers("webhook-id") webhookId: string,
    @Headers("webhook-timestamp") webhookTimestamp: string,
    @Headers("webhook-signature") webhookSignature: string
  ) {
    const rawBody = request.rawBody?.toString("utf8") ?? ""

    let event: ReturnType<PolarWebhookService["verify"]>
    try {
      event = this.webhookService.verify(rawBody, {
        "webhook-id": webhookId ?? "",
        "webhook-timestamp": webhookTimestamp ?? "",
        "webhook-signature": webhookSignature ?? "",
      })
    } catch (error) {
      if (error instanceof InvalidWebhookSignatureError) {
        throw new ForbiddenException({ received: false })
      }
      throw error
    }

    await this.webhookService.dispatch(webhookId, event)
    return { received: true }
  }
}
