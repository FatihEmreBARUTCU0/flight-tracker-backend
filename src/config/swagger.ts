// src/config/swagger.ts
import swaggerJsdoc from "swagger-jsdoc";

export const swaggerSpec = swaggerJsdoc({
  definition: {
    openapi: "3.1.0",
    info: { title: "Flight Tracker API", version: "1.0.0" },
    servers: [{ url: "http://localhost:3000" }],
    tags: [
      { name: "Flights" },
      { name: "Telemetry" }
    ],
    components: {
      schemas: {
        Flight: {
          type: "object",
          required: [
            "flightCode",
            "departure_lat", "departure_long",
            "destination_lat", "destination_long",
            "departureTime"
          ],
          properties: {
            _id: { type: "string" },
            flightCode: { type: "string", example: "TK123" },
            departure_lat: { type: "number", example: 41.2753 },
            departure_long:{ type: "number", example: 28.7519 },
            destination_lat:{ type: "number", example: 40.9778 },
            destination_long:{ type: "number", example: 28.821 },
            departureTime: {
              type: "string",
              format: "date-time",
              example: "2025-10-26T09:30:00.000Z"
            },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
          }
        },

        // >>> Eklediğin şemalar
        Telemetry: {
          type: "object",
          properties: {
            _id: { type: "string" },
            flight: { type: "string" },
            lat: { type: "number", example: 41.0082 },
            lng: { type: "number", example: 28.9784 },
            ts:  { type: "string", format: "date-time" },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
          }
        },
        TelemetryInput: {
          type: "object",
          required: ["lat","lng"],
          properties: {
            flightId: { type: "string" },
            flightCode: { type: "string" },
            lat: { type: "number" },
            lng: { type: "number" },
            ts:  {
              type: "string",
              format: "date-time",
              description: "opsiyonel; default=now()"
            }
          }
        }
        // <<<
      }
    }
  },
  // routes klasörünü ve gerekirse app.ts'i tarar
  apis: ["./src/routes/**/*.ts", "./src/app.ts"],
});
