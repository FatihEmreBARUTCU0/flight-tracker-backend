import "dotenv/config";
import http from "http";
import { Server } from "socket.io";
import app from "./app";
import { connectDB } from "./config/db";

const PORT = process.env.PORT || 3000;
const server = http.createServer(app);

export const io = new Server(server, { cors: { origin: "*" }, path: "/ws" });

io.on("connection", (socket) => {
  console.log("🔌 client connected:", socket.id);
  socket.emit("welcome", { msg: "hello" });
  socket.on("ping", () => socket.emit("pong"));
  socket.on("disconnect", () => console.log("❌ disconnected:", socket.id));
});

(async () => {
  await connectDB(process.env.MONGODB_URI!);
  server.listen(PORT, () => console.log(`🚀 HTTP+WS on :${PORT}`));
})();