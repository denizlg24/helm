import { Module, type Provider } from "@nestjs/common"
import { z } from "zod"
import { DenizCloudStorageAdapter } from "./adapters/deniz-cloud.adapter"
import {
  STORAGE_ADAPTER,
  type StorageAdapter,
} from "./adapters/storage-adapter.interface"
import { StorageController } from "./storage.controller"
import { StorageRepository } from "./storage.repository"
import { StorageService } from "./storage.service"

const StorageDriverSchema = z.enum(["deniz-cloud"]).default("deniz-cloud")

// Binds the active storage backend. Adding S3/R2 later is a new adapter class
// plus a branch here — nothing else in the module changes.
const storageAdapterProvider: Provider = {
  provide: STORAGE_ADAPTER,
  useFactory: (): StorageAdapter => {
    const driver = StorageDriverSchema.parse(process.env.STORAGE_DRIVER)
    switch (driver) {
      case "deniz-cloud":
        return new DenizCloudStorageAdapter()
    }
  },
}

@Module({
  controllers: [StorageController],
  providers: [StorageRepository, StorageService, storageAdapterProvider],
  exports: [StorageService],
})
export class StorageModule {}
