import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Res,
} from "@nestjs/common"
import {
  ApproveAssistantToolInputSchema,
  type AuthContext,
  RenameAssistantConversationInputSchema,
  StartAssistantChatInputSchema,
} from "@workspace/types"
import type { FastifyReply } from "fastify"
import { z } from "zod"
import {
  AuditSensitive,
  CurrentAuthContext,
  RequireScopes,
  RequireWorkspace,
} from "../auth/auth.decorators"
import { RateLimit } from "../rate-limit/rate-limit.decorators"
// biome-ignore lint/style/useImportType: Nest DI needs runtime metadata.
import { AssistantService } from "./assistant.service"

type SseEvent = Parameters<Parameters<AssistantService["start"]>[2]>[0]

const ConversationIdSchema = z.string().min(1)

@Controller("api/assistant")
@RequireWorkspace()
export class AssistantController {
  constructor(private readonly assistant: AssistantService) {}

  @Get("conversations")
  @RequireScopes("assistant:read")
  async list(@CurrentAuthContext() actor: AuthContext) {
    return this.assistant.listConversations(actor)
  }

  @Get("conversations/:id")
  @RequireScopes("assistant:read")
  async get(@CurrentAuthContext() actor: AuthContext, @Param("id") id: string) {
    const validatedId = ConversationIdSchema.parse(id)
    return this.assistant.getConversation(actor, validatedId)
  }

  @Patch("conversations/:id")
  @RequireScopes("assistant:write")
  async rename(
    @CurrentAuthContext() actor: AuthContext,
    @Param("id") id: string,
    @Body() body: unknown
  ) {
    const validatedId = ConversationIdSchema.parse(id)
    const input = RenameAssistantConversationInputSchema.parse(body)
    return this.assistant.renameConversation(actor, validatedId, input.title)
  }

  @Post("conversations/:id/rename")
  @RequireScopes("assistant:write")
  async renameWithPost(
    @CurrentAuthContext() actor: AuthContext,
    @Param("id") id: string,
    @Body() body: unknown
  ) {
    const validatedId = ConversationIdSchema.parse(id)
    const input = RenameAssistantConversationInputSchema.parse(body)
    return this.assistant.renameConversation(actor, validatedId, input.title)
  }

  @Delete("conversations/:id")
  @RequireScopes("assistant:write")
  @AuditSensitive("assistant.conversation.delete")
  async remove(
    @CurrentAuthContext() actor: AuthContext,
    @Param("id") id: string
  ) {
    const validatedId = ConversationIdSchema.parse(id)
    await this.assistant.deleteConversation(actor, validatedId)
    return { ok: true }
  }

  @Post("stream")
  @RequireScopes("assistant:write")
  @RateLimit({ max: 120, windowMs: 10 * 60 * 1000 })
  async stream(
    @CurrentAuthContext() actor: AuthContext,
    @Body() body: unknown,
    @Res() reply: FastifyReply
  ) {
    const input = StartAssistantChatInputSchema.parse(body)
    const emit = this.openStream(reply)
    try {
      await this.assistant.start(actor, input, emit.send)
    } finally {
      emit.close()
    }
  }

  @Post("conversations/:id/approve")
  @RequireScopes("assistant:write")
  @AuditSensitive("assistant.tool.approve")
  @RateLimit({ max: 120, windowMs: 10 * 60 * 1000 })
  async approve(
    @CurrentAuthContext() actor: AuthContext,
    @Param("id") id: string,
    @Body() body: unknown,
    @Res() reply: FastifyReply
  ) {
    const validatedId = ConversationIdSchema.parse(id)
    const input = ApproveAssistantToolInputSchema.parse(body)
    const emit = this.openStream(reply)
    try {
      await this.assistant.approve(actor, validatedId, input, emit.send)
    } finally {
      emit.close()
    }
  }

  // Opens an SSE response on the raw socket. Merges headers already set by the
  // Fastify CORS plugin (bypassed by writing to reply.raw directly) and hijacks
  // the reply so Fastify does not also try to send a body.
  private openStream(reply: FastifyReply): {
    send: (event: SseEvent) => void
    close: () => void
  } {
    reply.hijack()
    // Carry over headers the Fastify CORS plugin set on the reply — writing to
    // the raw socket bypasses Fastify's own send path.
    for (const [key, value] of Object.entries(reply.getHeaders())) {
      if (value !== undefined) reply.raw.setHeader(key, value)
    }
    reply.raw.setHeader("content-type", "text/event-stream")
    reply.raw.setHeader("cache-control", "no-cache, no-transform")
    reply.raw.setHeader("connection", "keep-alive")
    reply.raw.setHeader("x-accel-buffering", "no")
    reply.raw.writeHead(200)

    let closed = false
    reply.raw.on("close", () => {
      closed = true
    })

    return {
      send: (event: SseEvent) => {
        if (closed || reply.raw.writableEnded) return
        reply.raw.write(`data: ${JSON.stringify(event)}\n\n`)
      },
      close: () => {
        if (closed || reply.raw.writableEnded) return
        reply.raw.end()
      },
    }
  }
}
