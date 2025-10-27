import mongoose from "mongoose";


export async function connectDB(uri: string) {
  if (!uri) throw new Error("connectDB: uri is required");
  await mongoose.connect(uri);

  mongoose.connection.on("error", (err) => {
    console.error("[db] connection error:", err);
  });
  console.log("[db] connected");
}


export async function disconnectDB() {
  await mongoose.disconnect();
  console.log("[db] disconnected");
}
