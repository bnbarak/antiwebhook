import { betterAuth } from "better-auth";
import pg from "pg";
import { config } from "./config.js";

const pool = new pg.Pool({ connectionString: config.databaseUrl });

export const auth = betterAuth({
  database: pool,

  baseURL: config.betterAuthUrl,
  basePath: "/auth",

  secret: config.betterAuthSecret,

  emailAndPassword: {
    enabled: true,
  },

  trustedOrigins: [config.webappUrl],
});
