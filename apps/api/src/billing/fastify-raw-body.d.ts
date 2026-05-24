import "fastify"

declare module "fastify" {
  interface FastifyRequest {
    // Populated by Nest's rawBody option so the Polar webhook can verify the
    // signature against the unparsed payload.
    rawBody?: Buffer
  }
}
