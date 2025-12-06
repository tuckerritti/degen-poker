import pino from "pino";
import { isProduction } from "./env.js";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? (isProduction ? "info" : "debug"),
});
