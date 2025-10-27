import { Schema, model, InferSchemaType } from "mongoose";

const flightSchema = new Schema(
  {
    flightCode: { type: String, required: true, unique: true }, // unique = index
    departure_lat: { type: Number, required: true },
    departure_long: { type: Number, required: true },
    destination_lat: { type: Number, required: true },
    destination_long: { type: Number, required: true },
    departureTime: { type: Date, required: true },
  },
  { timestamps: true }
);

type FlightDoc = InferSchemaType<typeof flightSchema>;
export default model<FlightDoc>("Flight", flightSchema);