import express from "express";
import cors from "cors";
import swaggerUi from "swagger-ui-express";
import { swaggerSpec } from "./config/swagger";
import flightsRouter from "./routes/flights";
import telemetryRouter from "./routes/telemetry";

const app = express();

app.use(cors());
app.use(express.json());

// health
app.get("/health", (_req, res) => res.json({ ok: true }));

// swagger
app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// *** KRİTİK: flights router'ını buraya bağla ***
app.use("/flights", flightsRouter);

app.use("/telemetry", telemetryRouter);
// basit error handler
app.use((err: any, _req: any, res: any, _next: any) => {
  console.error(err);
  res
    .status(err?.status || 500)
    .json({ error: err?.message || "Internal Server Error" });
});

export default app;
