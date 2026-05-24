import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Headers,
  HttpCode,
  Post,
  Req,
} from "@nestjs/common"
import type { FastifyRequest } from "fastify"
import { z } from "zod"
import { Public } from "../auth/auth.decorators"
// biome-ignore lint/style/useImportType: Nest DI needs runtime metadata for PolarWebhookService.
import {
  InvalidWebhookSignatureError,
  PolarWebhookService,
} from "./polar-webhook.service"

const webhookHeadersSchema = z.object({
  "webhook-id": z.string().min(1),
  "webhook-timestamp": z.string().min(1),
  "webhook-signature": z.string().min(1),
})

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

    const headersValidation = webhookHeadersSchema.safeParse({
      "webhook-id": webhookId,
      "webhook-timestamp": webhookTimestamp,
      "webhook-signature": webhookSignature,
    })

    if (!headersValidation.success) {
      throw new BadRequestException({
        received: false,
        error: "Invalid webhook headers",
      })
    }

    const validatedHeaders = headersValidation.data

    let event: ReturnType<PolarWebhookService["verify"]>
    try {
      event = this.webhookService.verify(rawBody, validatedHeaders)
    } catch (error) {
      if (error instanceof InvalidWebhookSignatureError) {
        throw new ForbiddenException({ received: false })
      }
      throw error
    }

    await this.webhookService.dispatch(validatedHeaders["webhook-id"], event)
    return { received: true }
  }
}
