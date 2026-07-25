import { BadRequestException, PipeTransform } from "@nestjs/common";
import { z } from "zod";

export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(
    private readonly schema: z.ZodType<T>,
    private readonly message = "Request body does not match the error report contract.",
  ) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);

    if (result.success) {
      return result.data;
    }

    throw new BadRequestException({
      message: this.message,
      issues: result.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    });
  }
}
