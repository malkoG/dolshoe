import { LoggerService } from "@nestjs/common";
import { getLogger } from "@logtape/logtape";

const logger = getLogger(["dolshoe", "nest"]);

export class LogTapeLogger implements LoggerService {
  log(message: unknown, ...optionalParameters: unknown[]): void {
    logger.info("Nest log: {message}", {
      message,
      optionalParameters,
    });
  }

  fatal(message: unknown, ...optionalParameters: unknown[]): void {
    logger.fatal("Nest fatal error: {message}", {
      message,
      optionalParameters,
    });
  }

  error(message: unknown, ...optionalParameters: unknown[]): void {
    logger.error("Nest error: {message}", {
      message,
      optionalParameters,
    });
  }

  warn(message: unknown, ...optionalParameters: unknown[]): void {
    logger.warning("Nest warning: {message}", {
      message,
      optionalParameters,
    });
  }

  debug(message: unknown, ...optionalParameters: unknown[]): void {
    logger.debug("Nest debug: {message}", {
      message,
      optionalParameters,
    });
  }

  verbose(message: unknown, ...optionalParameters: unknown[]): void {
    logger.trace("Nest trace: {message}", {
      message,
      optionalParameters,
    });
  }
}
