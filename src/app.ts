import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import swaggerUi from "swagger-ui-express";
import { swaggerSpec } from "./config/swagger";
import flightsRouter from "./routes/flights";
import telemetryRouter from "./routes/telemetry";

const app = express();

// Varsayılanı daralt: dev'de Vite origin'i, prod'da env ile açıkça verilmeli
const defaultOrigin = "http://localhost:5173";
const allowed = (process.env.ALLOWED_ORIGINS ?? defaultOrigin)
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);
// '*' gelirse bile default'a düş; prod için ALLOWED_ORIGINS açıkça set edilmeli
const origin = (allowed.length === 1 && allowed[0] === "*") ? defaultOrigin : allowed;
app.use(cors({ origin }));

app.use(rateLimit({ windowMs: 60_000, max: 600 }));
app.use(express.json());

// health
app.get("/health", (_req, res) => res.json({ ok: true }));

// swagger
app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// *** KRİTİK: flights router'ını buraya bağla ***
app.use("/flights", flightsRouter);

app.use("/telemetry", telemetryRouter);

// tutarlı error handler
const isProd = process.env.NODE_ENV === "production";
app.use((err: any, req: any, res: any, _next: any) => {
  const status = Number(err?.status) || 500;
  const code =
    err?.code ||
    (status === 400 ? "BAD_REQUEST" : status === 404 ? "NOT_FOUND" : "INTERNAL");
  const body: any = {
    error: err?.message || "Internal Server Error",
    code,
  };
  if (!isProd && err?.stack) body.stack = err.stack;
  console.error(`[${req.method} ${req.url}] ${status}`, err?.message);
  res.status(status).json(body);
});

export default app;
