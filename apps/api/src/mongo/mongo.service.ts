import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common"
import mongoose, { type Connection } from "mongoose"
import { z } from "zod"

const MongoEnvSchema = z.object({
  MONGO_URL: z.string().min(1),
})

// Holds the single Mongoose connection used for all dashboard/module entities.
// Postgres (Drizzle) owns product-level entities; MongoDB owns module data.
@Injectable()
export class MongoService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MongoService.name)
  private connection?: Connection

  async onModuleInit(): Promise<void> {
    const env = MongoEnvSchema.parse(process.env)
    this.connection = await mongoose
      .createConnection(env.MONGO_URL, {
        serverSelectionTimeoutMS: 10_000,
      })
      .asPromise()
    this.logger.log("MongoDB connection established")
  }

  getConnection(): Connection {
    if (!this.connection) {
      throw new Error("MongoDB connection not initialized")
    }
    return this.connection
  }

  async onModuleDestroy(): Promise<void> {
    await this.connection?.close()
  }
}
