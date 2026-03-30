import "express-async-errors";
import express from "express";
import cors from "cors";
import { toNodeHandler } from "better-auth/node";
import { auth } from "./auth.js";
import { config } from "./config.js";

const app = express();

app.use(
  cors({
    origin: [config.webappUrl],
    credentials: true,
  }),
);

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.all("/auth/*", toNodeHandler(auth));

app.listen(Number(config.port), () => {
  console.log(`Auth service listening on port ${config.port}`);
});
