import path from "path";
import { config } from "dotenv";

// Load env files for local dev: prefer .env.local, then .env
config({ path: path.join(process.cwd(), ".env.local") });
config();

import { z } from "zod";

const envSchema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  ENGINE_PORT: z.string().optional(),
  NODE_ENV: z.string().optional(),
  ENGINE_CORS_ORIGIN: z.string().optional(), // e.g., http://localhost:3000 or *
});

export const env = envSchema.parse(process.env);
export const port = Number(env.ENGINE_PORT ?? 3001);
export const isProduction = (env.NODE_ENV ?? "development") === "production";
const defaultCors = "http://localhost:3000";
if (isProduction && (env.ENGINE_CORS_ORIGIN ?? "*") === "*") {
  throw new Error("ENGINE_CORS_ORIGIN cannot be '*' in production");
}
export const corsOrigin = env.ENGINE_CORS_ORIGIN ?? defaultCors;
