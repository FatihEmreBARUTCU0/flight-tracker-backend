import { Router } from "express";
import Flight from "../config/models/flight";
import { broadcast, startSimForFlight } from "../realtime";

function inRange(n: number, min: number, max: number) {
  return typeof n === "number" && n >= min && n <= max;
}

const AUTO_SIM = process.env.AUTO_SIM === "1";
const router = Router();

/**
 * @openapi
 * /flights:
 *   get:
 *     summary: List all flights
 *     tags: [Flights]
 *     responses:
 *       200:
 *         description: Array of flights
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Flight'
 */
router.get("/", async (_req, res, next) => {
  try {
    const list = await Flight.find().sort({ departureTime: 1 }).lean();
    res.json(list);
  } catch (e) {
    next(e);
  }
});

/**
 * @openapi
 * /flights:
 *   post:
 *     summary: Create a new flight
 *     tags: [Flights]
 *     requestBody:
 *       required: true;
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - flightCode
 *               - departure_lat
 *               - departure_long
 *               - destination_lat
 *               - destination_long
 *               - departureTime
 *             properties:
 *               flightCode: { type: string }
 *               departure_lat: { type: number }
 *               departure_long:{ type: number }
 *               destination_lat:{ type: number }
 *               destination_long:{ type: number }
 *               departureTime: { type: string, format: date-time }
 *     responses:
 *       201:
 *         description: Created flight
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Flight'
 *       400:
 *         description: Missing required fields
 *       409:
 *         description: flightCode already exists
 */
router.post("/", async (req, res, next) => {
  try {
    const {
      flightCode,
      departure_lat,
      departure_long,
      destination_lat,
      destination_long,
      departureTime,
    } = req.body ?? {};

    if (
      flightCode == null ||
      departure_lat == null ||
      departure_long == null ||
      destination_lat == null ||
      destination_long == null ||
      departureTime == null
    ) {
      return res.status(400).json({ error: "Missing required fields" });
    }

   
    if (
      !inRange(departure_lat, -90, 90) ||
      !inRange(destination_lat, -90, 90) ||
      !inRange(departure_long, -180, 180) ||
      !inRange(destination_long, -180, 180)
    ) {
      return res.status(400).json({ error: "Invalid coordinates" });
    }

    const dt = new Date(departureTime);
    if (Number.isNaN(dt.getTime())) {
      return res.status(400).json({ error: "Invalid departureTime" });
    }

    const doc = await Flight.create({
      flightCode,
      departure_lat,
      departure_long,
      destination_lat,
      destination_long,
      departureTime: dt,
    });

    broadcast({ type: "flight.created", flight: doc.toObject() });

    
    if (AUTO_SIM) {
      startSimForFlight(doc);
    }

    res.status(201).json(doc);
  } catch (err: any) {
    if (err?.code === 11000) {
      return res.status(409).json({ error: "flightCode already exists" });
    }
    next(err);
  }
});

export default router;
