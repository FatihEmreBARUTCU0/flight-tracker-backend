
import type { Application } from "express";
import type { WebSocket } from "ws";
import { registerClient } from "./realtime";


export function mountWs(app: Application) {
 
  (app as any).ws("/ws", (ws: WebSocket) => {
    registerClient(ws);                
    ws.send(JSON.stringify({ type: "hello", ok: true }));
  });
}
