import { Body, Controller, Post } from "@nestjs/common";
import { ApiBadRequestResponse, ApiBody, ApiCreatedResponse, ApiTags } from "@nestjs/swagger";

import {
  ErrorReportReceipt,
  ErrorReportRequest,
  errorReportRequestSchema,
} from "./error-report.contract";
import { nodeErrorReportExample, pythonErrorReportExample } from "./error-report.examples";
import { ErrorReportService } from "./error-report.service";
import { ZodValidationPipe } from "./zod-validation.pipe";

@ApiTags("Error reporting")
@Controller({ path: "error-reports", version: "1" })
export class ErrorReportController {
  constructor(private readonly errorReportService: ErrorReportService) {}

  /**
   * Receive a normalized error report.
   *
   * @remarks
   * Python and JavaScript reporters convert runtime-specific exception data into the shared
   * versioned contract. Repeating the same eventId is safe and returns the first receipt.
   *
   * @returns The server identifier and the timestamp at which the event was first received.
   */
  @Post()
  @ApiBody({
    schema: { $ref: "#/components/schemas/ErrorReportRequestV1" },
    examples: {
      node: {
        summary: "Node.js unhandled rejection",
        value: nodeErrorReportExample,
      },
      python: {
        summary: "Python exception group",
        value: pythonErrorReportExample,
      },
    },
  })
  @ApiCreatedResponse({
    description: "The report was accepted, or a prior receipt was found for the same eventId.",
    schema: { $ref: "#/components/schemas/ErrorReportReceiptV1" },
  })
  @ApiBadRequestResponse({
    description: "The body does not satisfy the versioned error report contract.",
  })
  receive(
    @Body(new ZodValidationPipe(errorReportRequestSchema)) report: ErrorReportRequest,
  ): Promise<ErrorReportReceipt> {
    return this.errorReportService.receive(report);
  }
}
