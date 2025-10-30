import { Schema, model, InferSchemaType, Types } from "mongoose";

const telemetrySchema = new Schema(
  {
    flight: { type: Schema.Types.ObjectId, ref: "Flight", required: true, index: true },
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
    ts:  { type: Date,   required: true, index: true }, // ölçüm zamanı
  },
  { timestamps: true }
);

// Sorgu performansı için
telemetrySchema.index({ flight: 1, ts: 1 });

export type TelemetryDoc = InferSchemaType<typeof telemetrySchema>;
export default model<TelemetryDoc>("Telemetry", telemetrySchema);
