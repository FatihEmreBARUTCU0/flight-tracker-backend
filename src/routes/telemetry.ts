import { Router } from "express";
import Flight from "../config/models/flight";
import Telemetry from "../config/models/telemetry";
import { broadcast } from "../realtime";

const router = Router();

/**
 * @openapi
 * /telemetry:
 *   post:
 *     summary: Uçuş konum(lar)ını ekle (tek veya çoklu)
 *     tags: [Telemetry]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             oneOf:
 *               - $ref: '#/components/schemas/TelemetryInput'
 *               - type: array
 *                 items: { $ref: '#/components/schemas/TelemetryInput' }
 *     responses:
 *       201: { description: Created }
 */
router.post("/", async (req, res, next) => {
  try {
    const payload = Array.isArray(req.body) ? req.body : [req.body];

    // Input kontrol
    for (const p of payload) {
      if ((p.flightId == null && p.flightCode == null) || p.lat == null || p.lng == null) {
        return res.status(400).json({ error: "flightId/flightCode ve lat,lng zorunlu" });
      }
    }

    // Flight resolve + doc’a dönüştür
    const docs = [];
    for (const p of payload) {
      const f =
        p.flightId
          ? await Flight.findById(p.flightId).lean()
          : await Flight.findOne({ flightCode: p.flightCode }).lean();

      if (!f) return res.status(404).json({ error: "Flight not found" });

      const ts = p.ts ? new Date(p.ts) : new Date();
      const doc = { flight: f._id, lat: p.lat, lng: p.lng, ts };
      docs.push(doc);

      // İstemcilere canlı yayın — istersen kapatılabilir
      broadcast({ type: "telemetry", flightId: String(f._id), lat: p.lat, lng: p.lng, ts: ts.getTime() });
    }

    const inserted = await Telemetry.insertMany(docs, { ordered: false });
    res.status(201).json({ inserted: inserted.length });
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /telemetry:
 *   get:
 *     summary: Zaman aralığına göre telemetri listesi
 *     tags: [Telemetry]
 *     parameters:
 *       - in: query
 *         name: flightId
 *         schema: { type: string }
 *       - in: query
 *         name: flightCode
 *         schema: { type: string }
 *       - in: query
 *         name: from
 *         schema: { type: string, format: date-time }
 *       - in: query
 *         name: to
 *         schema: { type: string, format: date-time }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 1000 }
 *       - in: query
 *         name: sort
 *         schema: { type: string, enum: [asc, desc], default: asc }
 *     responses:
 *       200: { description: OK }
 */
router.get("/", async (req, res, next) => {
  try {
    const { flightId, flightCode, from, to, limit = 1000, sort = "asc" } = req.query as any;

    const flight = flightId
      ? await Flight.findById(flightId, { _id: 1 }).lean()
      : await Flight.findOne({ flightCode }, { _id: 1 }).lean();

    if (!flight) return res.status(404).json({ error: "Flight not found" });

    const q: any = { flight: flight._id };
    if (from || to) q.ts = {};
    if (from) q.ts.$gte = new Date(from);
    if (to) q.ts.$lte = new Date(to);

    const list = await Telemetry.find(q)
      .sort({ ts: sort === "desc" ? -1 : 1 })
      .limit(Math.min(Number(limit), 5000))
      .lean();

    res.json(list);
  } catch (err) { next(err); }
});

/**
 * @openapi
 * /telemetry/latest:
 *   get:
 *     summary: Verilen zamana kadar en son telemetri
 *     tags: [Telemetry]
 *     parameters:
 *       - in: query
 *         name: flightId
 *         schema: { type: string }
 *       - in: query
 *         name: flightCode
 *         schema: { type: string }
 *       - in: query
 *         name: at
 *         schema: { type: string, format: date-time }
 *     responses:
 *       200: { description: OK }
 */
router.get("/latest", async (req, res, next) => {
  try {
    const { flightId, flightCode, at } = req.query as any;

    const flight = flightId
      ? await Flight.findById(flightId, { _id: 1 }).lean()
      : await Flight.findOne({ flightCode }, { _id: 1 }).lean();

    if (!flight) return res.status(404).json({ error: "Flight not found" });

    const atDate = at ? new Date(at) : new Date();

    const last = await Telemetry.findOne({
      flight: flight._id,
      ts: { $lte: atDate },
    })
      .sort({ ts: -1 })
      .lean();

    res.json(last ?? null);
  } catch (err) { next(err); }
});

export default router;
