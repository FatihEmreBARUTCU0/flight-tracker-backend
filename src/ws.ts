// src/ws.ts
import type { Application } from "express-ws";

/** WebSocket endpoint'lerini burada tanımla */
export function mountWs(app: Application) {
  // ws endpoint: ws://<host>/ws
  app.ws("/ws", (ws, req) => {
    // ilk karşılama
    ws.send(JSON.stringify({ type: "welcome", msg: "connected" }));

    // client'tan mesaj gelirse
    ws.on("message", (data) => {
      // geleni basitçe geri yolla (echo)
      ws.send(JSON.stringify({ type: "echo", data: String(data) }));
    });

    ws.on("close", () => {
      
    });
  });
}
