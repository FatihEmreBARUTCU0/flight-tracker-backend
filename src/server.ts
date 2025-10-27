import "dotenv/config";
import http from "http";
import app from "./app";
import { connectDB, disconnectDB } from "./config/db";
import expressWs from "express-ws";
import { mountWs } from "./ws";

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is missing");

  const port = Number(process.env.PORT ?? 3000);

  await connectDB(uri);

  // Model burada ve FONKSİYON içinde import ediliyor (top-level await yok)
  const Flight = (await import("./config/models/flight")).default;
  await Flight.init();
  console.log("[db] Flight indexes in sync");

  const server = http.createServer(app);
  expressWs(app as any, server);
  mountWs(app as any);

  server.listen(port, () => {
    console.log(`[server] listening on http://localhost:${port}`);
  });

  const shutdown = async (reason?: string) => {
    if (reason) console.warn(`[server] shutdown (${reason})`);
    const t = setTimeout(() => { console.warn("[server] forced shutdown after 10s"); process.exit(1); }, 10_000);
    server.close(async () => { clearTimeout(t); try { await disconnectDB(); } catch {} process.exit(0); });
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("unhandledRejection", (e) => { console.error(e); shutdown("unhandledRejection"); });
  process.on("uncaughtException",  (e) => { console.error(e); shutdown("uncaughtException"); });
}

main().catch((err) => { console.error("[bootstrap] failed:", err); process.exit(1); });
