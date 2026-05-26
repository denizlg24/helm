import "reflect-metadata"
import fastifyMultipart from "@fastify/multipart"
import { Logger } from "@nestjs/common"
import { NestFactory } from "@nestjs/core"
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify"
import {
  HELM_AUTH_BASE_PATH,
  HELM_DESKTOP_PRODUCTION_ORIGINS,
} from "@workspace/auth/constants"
import { HelmApiRuntimeEnvSchema } from "@workspace/auth/env"
import { auth } from "@workspace/auth/server"
import type { FastifyReply, FastifyRequest } from "fastify"
import { AppModule } from "./app.module"
import { ZodExceptionFilter } from "./zod-exception.filter"

async function bootstrap() {
  const env = HelmApiRuntimeEnvSchema.parse(process.env)
  const logger = new Logger("Bootstrap")
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
    { rawBody: true }
  )

  app.useGlobalFilters(new ZodExceptionFilter())
  app.enableCors({
    origin: [
      env.HELM_CONSOLE_URL,
      env.HELM_WEB_URL,
      env.HELM_DESKTOP_URL,
      ...HELM_DESKTOP_PRODUCTION_ORIGINS,
    ],
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    credentials: true,
  })

  const fastify = app.getHttpAdapter().getInstance()

  const DEFAULT_MAX_UPLOAD_BYTES = 1_073_741_824
  const parsedUploadBytes = Number.parseInt(
    process.env.STORAGE_MAX_UPLOAD_BYTES ?? "",
    10
  )
  const maxUploadBytes =
    Number.isFinite(parsedUploadBytes) && parsedUploadBytes > 0
      ? parsedUploadBytes
      : DEFAULT_MAX_UPLOAD_BYTES
  await fastify.register(fastifyMultipart, {
    limits: { fileSize: maxUploadBytes, files: 1 },
  })

  const authBasePath = HELM_AUTH_BASE_PATH.replace(/\/$/, "")
  fastify.route({
    method: ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"],
    url: `${authBasePath}/*`,
    handler: async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const url = new URL(request.url, env.HELM_AUTH_BASE_URL)
        const headers = new Headers()
        for (const [key, value] of Object.entries(request.headers)) {
          if (value === undefined) continue
          if (Array.isArray(value)) {
            for (const v of value) headers.append(key, v)
          } else {
            headers.append(key, String(value))
          }
        }
        const init: RequestInit = {
          method: request.method,
          headers,
        }
        if (request.method !== "GET" && request.method !== "HEAD") {
          init.body =
            request.body === undefined || request.body === null
              ? undefined
              : typeof request.body === "string"
                ? request.body
                : JSON.stringify(request.body)
        }
        const response = await auth.handler(new Request(url.toString(), init))
        reply.status(response.status)
        response.headers.forEach((value, key) => {
          reply.header(key, value)
        })
        const body = response.body ? await response.text() : null
        reply.send(body)
      } catch (error) {
        logger.error("Better Auth handler error", error as Error)
        reply.status(500).send({
          error: "Internal authentication error",
          code: "AUTH_FAILURE",
        })
      }
    },
  })

  await app.listen(env.PORT, "0.0.0.0")
  logger.log(`API listening on http://localhost:${env.PORT}`)
  logger.log(`Better Auth mounted at ${authBasePath}/*`)
}

bootstrap().catch((error: unknown) => {
  console.error(error)
  process.exit(1)
})
