import {
  type ArgumentsHost,
  BadRequestException,
  Catch,
  type ExceptionFilter,
} from "@nestjs/common"
import { ZodError } from "zod"

@Catch(ZodError)
export class ZodExceptionFilter implements ExceptionFilter {
  catch(error: ZodError, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<{
      status: (statusCode: number) => {
        send: (body: unknown) => void
      }
    }>()
    const exception = new BadRequestException({
      code: "VALIDATION_ERROR",
      message: "Validation failed",
      issues: error.issues,
    })

    const exceptionResponse = exception.getResponse()
    response
      .status(exception.getStatus())
      .send(
        typeof exceptionResponse === "string"
          ? { message: exceptionResponse }
          : exceptionResponse
      )
  }
}
