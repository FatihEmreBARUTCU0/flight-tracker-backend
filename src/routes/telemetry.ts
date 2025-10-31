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
// backend/src/routes/telemetry.ts
router.post("/", async (req, res, next) => {
  try {
    const payload = Array.isArray(req.body) ? req.body : [req.body];

    for (const p of payload) {
      if ((p.flightId == null && p.flightCode == null) || p.lat == null || p.lng == null) {
        return res.status(400).json({ error: "flightId/flightCode ve lat,lng zorunlu" });
      }
      if (p.lat < -90 || p.lat > 90 || p.lng < -180 || p.lng > 180) {
        return res.status(400).json({ error: "Invalid coordinates" });
      }
      if (p.ts && isNaN(new Date(p.ts).getTime())) {
        return res.status(400).json({ error: "Invalid ts" });
      }
    }

    const docs: Array<{ flight: any; lat: number; lng: number; ts: Date }> = [];
    for (const p of payload) {
      const f = p.flightId
        ? await Flight.findById(p.flightId).lean()
        : await Flight.findOne({ flightCode: p.flightCode }).lean();
      if (!f) return res.status(404).json({ error: "Flight not found" });

      const ts = p.ts ? new Date(p.ts) : new Date();
      docs.push({ flight: f._id, lat: p.lat, lng: p.lng, ts });
    }

    const inserted = await Telemetry.insertMany(docs, { ordered: false });

    // Publish only what actually persisted
    for (const d of inserted) {
      broadcast({
        type: "telemetry",
        flightId: String(d.flight),
        lat: d.lat,
        lng: d.lng,
        ts: new Date(d.ts).getTime(),
      });
    }

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

    const lim = Math.min(Number.parseInt(String(limit), 10) || 1000, 5000);

    const list = await Telemetry.find(q)
      .sort({ ts: sort === "desc" ? -1 : 1 })
      .limit(lim)
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

/**
 * @openapi
 * /telemetry/window:
 *   get:
 *     summary: Belirtilen uçuşlar için (veya tümü) ilk ve son telemetri zamanlarını döner
 *     tags: [Telemetry]
 *     parameters:
 *       - in: query
 *         name: flightIds
 *         description: Virgülle ayrılmış ObjectId listesi (opsiyonel; boşsa tüm uçuşlar)
 *         schema: { type: string }
 *       - in: query
 *         name: at
 *         description: Bu zamana kadar olan kayıtları dikkate al
 *         schema: { type: string, format: date-time }
 *     responses:
 *       200: { description: OK }
 */
router.get("/window", async (req, res, next) => {
  try {
    const at = req.query.at ? new Date(String(req.query.at)) : new Date();
    const ids = typeof req.query.flightIds === "string" && req.query.flightIds.length
      ? String(req.query.flightIds).split(",").map(s => s.trim()).filter(Boolean)
      : null;

    const match: any = { ts: { $lte: at } };
    if (ids && ids.length) {
      // Sadece var olan uçuşları dikkate al
      const flights = await Flight.find({ _id: { $in: ids } }, { _id: 1 }).lean();
      match.flight = { $in: flights.map(f => f._id) };
    }

    const agg = await Telemetry.aggregate([
      { $match: match },
      { $group: { _id: "$flight", min: { $min: "$ts" }, max: { $max: "$ts" } } },
    ]);

    const byFlight: Record<string, { min: string | null; max: string | null }> = {};
    let gmin: Date | null = null, gmax: Date | null = null;
    for (const r of agg) {
      byFlight[String(r._id)] = { min: r.min ?? null, max: r.max ?? null };
      if (r.min && (!gmin || r.min < gmin)) gmin = r.min;
      if (r.max && (!gmax || r.max > gmax)) gmax = r.max;
    }
    res.json({ byFlight, global: { min: gmin, max: gmax } });
  } catch (err) { next(err); }
});

export default router;
