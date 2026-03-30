function env(key: string, defaultValue: string): string {
  return process.env[key] || defaultValue;
}

export const config = {
  port: env("PORT", "8401"),
  nodeEnv: env("NODE_ENV", "development"),

  databaseUrl: env(
    "DATABASE_URL",
    "postgresql://admin:secret@localhost:5434/antiwebhooks",
  ),

  betterAuthSecret: env(
    "BETTER_AUTH_SECRET",
    "dev-secret-32-chars-minimum-here!",
  ),

  betterAuthUrl: env("BETTER_AUTH_URL", "http://localhost:8401"),

  webappUrl: env("WEBAPP_URL", "http://localhost:4000"),
} as const;
