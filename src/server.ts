import "dotenv/config";
import http from "http";
import app from "./app";
import { connectDB, disconnectDB } from "./config/db";
import expressWs from "express-ws";
import { mountWs } from "./ws";
import Flight from "./config/models/flight";
import Telemetry from "./config/models/telemetry";
import { startSimForFlight, shutdownRealtime } from "./realtime";

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is missing");

  const port = Number(process.env.PORT ?? 3000);


  await connectDB(uri);


  await Flight.init();
  await Telemetry.init();
  console.log("[db] Flight & Telemetry indexes in sync");


  const server = http.createServer(app);
  expressWs(app as any, server);
  mountWs(app as any);

  
  const existing = await Flight.find().lean();
  if (process.env.AUTO_SIM === "1") {
    for (const f of existing) startSimForFlight(f);
  } 


  server.listen(port, () => {
    console.log(`[server] listening on http://localhost:${port}`);
    console.log(`[ws]     ws://localhost:${port}/ws`);
  });


  const shutdown = async (reason?: string) => {
    if (reason) console.warn(`[server] shutdown (${reason})`);
    const t = setTimeout(() => {
      console.warn("[server] forced shutdown after 10s");
      process.exit(1);
    }, 10_000);

    server.close(async () => {
      clearTimeout(t);
      try { await shutdownRealtime(); } catch {}
      try { await disconnectDB(); } catch {}
      process.exit(0);
    });
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("unhandledRejection", (e) => {
    console.error(e);
    shutdown("unhandledRejection");
  });
  process.on("uncaughtException", (e) => {
    console.error(e);
    shutdown("uncaughtException");
  });
}

main().catch((err) => {
  console.error("[bootstrap] failed:", err);
  process.exit(1);
});
