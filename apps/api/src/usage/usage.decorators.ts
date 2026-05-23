import { SetMetadata } from "@nestjs/common"
import { REQUIRE_USAGE_BUDGET_KEY } from "./usage.constants"

export const RequireUsageBudget = () =>
  SetMetadata(REQUIRE_USAGE_BUDGET_KEY, true)
