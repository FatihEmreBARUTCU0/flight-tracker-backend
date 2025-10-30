// src/ws.ts
import type { Application } from "express";
import type { WebSocket } from "ws";
import { registerClient } from "./realtime";

/** Express uygulamasına /ws websocket endpoint’ini ekler */
export function mountWs(app: Application) {
  // TS için any: express-ws app.ws ekler
  (app as any).ws("/ws", (ws: WebSocket) => {
    registerClient(ws);                 // bağlantıyı kaydet
    ws.send(JSON.stringify({ type: "hello", ok: true })); // opsiyonel selam
  });
}
