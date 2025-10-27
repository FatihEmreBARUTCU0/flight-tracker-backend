import { Router } from "express";
import Flight from "../config/models/flight";

const router = Router();

/**
 * @swagger
 * /flights:
 *   get:
 *     summary: Tüm uçuşları listele
 *     tags:
 *       - Flights
 *     responses:
 *       200:
 *         description: Uçuş listesi
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: "#/components/schemas/Flight"
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
 * @swagger
 * /flights:
 *   post:
 *     summary: Yeni uçuş oluştur
 *     tags:
 *       - Flights
 *     requestBody:
 *       required: true
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
 *               flightCode:
 *                 type: string
 *                 example: "TK123"
 *               departure_lat:
 *                 type: number
 *                 example: 41.2753
 *               departure_long:
 *                 type: number
 *                 example: 28.7519
 *               destination_lat:
 *                 type: number
 *                 example: 40.9778
 *               destination_long:
 *                 type: number
 *                 example: 28.821
 *               departureTime:
 *                 type: string
 *                 format: date-time
 *                 example: "2025-10-26T09:30:00.000Z"
 *     responses:
 *       201:
 *         description: Oluşturuldu
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/Flight"
 *       400:
 *         description: Eksik alan
 *       409:
 *         description: flightCode zaten var
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

    const doc = await Flight.create({
      flightCode,
      departure_lat,
      departure_long,
      destination_lat,
      destination_long,
      departureTime: new Date(departureTime),
    });

    res.status(201).json(doc);
  } catch (err: any) {
    if (err?.code === 11000) {
      return res
        .status(409)
        .json({ error: "flightCode already exists" });
    }
    next(err);
  }
});

export default router;
