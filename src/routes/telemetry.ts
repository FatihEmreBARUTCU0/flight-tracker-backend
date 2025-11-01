// backend/src/routes/telemetry.ts
import { Router } from "express";
import Flight from "../config/models/flight";
import Telemetry from "../config/models/telemetry";
import { broadcast } from "../realtime";
import { Types } from "mongoose"; // <-- eklendi

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
 *       201:
 *         description: Created (kısmi başarı olabilir)
 *       400:
 *         description: Geçersiz girdi
 *       404:
 *         description: Geçerli kayıt yok
 */
// 4) Batch flight lookup + kısmi başarı
router.post("/", async (req, res, next) => {
  try {
    const payload = Array.isArray(req.body) ? req.body : [req.body];

    // basic validation
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

    // batch resolve flights (tek seferde)
    const byId = payload.filter((p) => p.flightId).map((p) => String(p.flightId));
    const byCode = payload.filter((p) => p.flightCode).map((p) => String(p.flightCode));

    const [idDocs, codeDocs] = await Promise.all([
      byId.length ? Flight.find({ _id: { $in: byId } }, { _id: 1 }).lean() : [],
      byCode.length ? Flight.find({ flightCode: { $in: byCode } }, { _id: 1, flightCode: 1 }).lean() : [],
    ]);

    const idSet = new Map(idDocs.map((d: any) => [String(d._id), d._id]));
    const codeSet = new Map(codeDocs.map((d: any) => [String(d.flightCode), d._id]));

    const docs: Array<{ flight: any; lat: number; lng: number; ts: Date }> = [];
    const failed: Array<{ ref: string; reason: string }> = [];

    for (const p of payload) {
      const resolved = p.flightId
        ? idSet.get(String(p.flightId))
        : codeSet.get(String(p.flightCode));

      if (!resolved) {
        failed.push({ ref: String(p.flightId ?? p.flightCode), reason: "Flight not found" });
        continue;
      }

      docs.push({
        flight: resolved,
        lat: p.lat,
        lng: p.lng,
        ts: p.ts ? new Date(p.ts) : new Date(),
      });
    }

    if (!docs.length) {
      return res.status(404).json({ error: "No valid items", failed });
    }

    // Kısmi eklemelerde insertedDocs'i güvenle yakala
    let insertedDocs: any[] = [];
    try {
      const r = await Telemetry.insertMany(docs, { ordered: false });
      insertedDocs = Array.isArray(r) ? r : [];
    } catch (e: any) {
      if (Array.isArray(e?.insertedDocs)) {
        insertedDocs = e.insertedDocs;
      }
      // diğer hataları yutuyoruz; kısmi başarı yine de raporlanacak
    }

    // Yalnızca gerçekten kalıcı olanları yayınla
    for (const d of insertedDocs) {
      broadcast({
        type: "telemetry",
        flightId: String(d.flight),
        lat: d.lat,
        lng: d.lng,
        ts: new Date(d.ts).getTime(),
      });
    }

    return res.status(201).json({ inserted: insertedDocs.length, failed });
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

    // ISO doğrulama
    let fromDate: Date | undefined;
    let toDate: Date | undefined;

    if (from) {
      const d = new Date(String(from));
      if (isNaN(d.getTime())) return res.status(400).json({ error: "Invalid from param" });
      fromDate = d;
    }
    if (to) {
      const d = new Date(String(to));
      if (isNaN(d.getTime())) return res.status(400).json({ error: "Invalid to param" });
      toDate = d;
    }

    const q: any = { flight: flight._id };
    if (fromDate || toDate) q.ts = {};
    if (fromDate) q.ts.$gte = fromDate;
    if (toDate) q.ts.$lte = toDate;

    const lim = Math.min(Number.parseInt(String(limit), 10) || 1000, 5000);

    const list = await Telemetry.find(q)
      .sort({ ts: sort === "desc" ? -1 : 1 })
      .limit(lim)
      .lean();

    res.json(list);
  } catch (err) {
    next(err);
  }
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
// 5) ISO tarih doğrulaması (latest)
router.get("/latest", async (req, res, next) => {
  try {
    const { flightId, flightCode, at } = req.query as any;

    const flight = flightId
      ? await Flight.findById(flightId, { _id: 1 }).lean()
      : await Flight.findOne({ flightCode }, { _id: 1 }).lean();

    if (!flight) return res.status(404).json({ error: "Flight not found" });

    const atDate = at ? new Date(String(at)) : new Date();
    if (isNaN(atDate.getTime())) return res.status(400).json({ error: "Invalid at param" });

    const last = await Telemetry.findOne({ flight: flight._id, ts: { $lte: atDate } })
      .sort({ ts: -1 })
      .lean();

    res.json(last ?? null);
  } catch (err) {
    next(err);
  }
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
    const atStr = req.query.at ? String(req.query.at) : undefined;
    const at = atStr ? new Date(atStr) : new Date();
    if (atStr && isNaN(at.getTime())) {
      return res.status(400).json({ error: "Invalid at param" });
    }

    const ids =
      typeof req.query.flightIds === "string" && req.query.flightIds.length
        ? String(req.query.flightIds).split(",").map((s) => s.trim()).filter(Boolean)
        : null;

    const match: any = { ts: { $lte: at } };
    if (ids && ids.length) {
      // Sadece gerçekten var olan uçuşları dikkate al
      const flights = await Flight.find({ _id: { $in: ids } }, { _id: 1 }).lean();
      const validIds = flights.map((f) => f._id);
      if (validIds.length === 0) {
        return res.json({ byFlight: {}, global: { min: null, max: null } });
      }
      match.flight = { $in: validIds };
    }

    const agg = await Telemetry.aggregate([
      { $match: match },
      { $group: { _id: "$flight", min: { $min: "$ts" }, max: { $max: "$ts" } } },
    ]);

    const byFlight: Record<string, { min: string | null; max: string | null }> = {};
    let gmin: Date | null = null,
      gmax: Date | null = null;

    for (const r of agg as any[]) {
      byFlight[String(r._id)] = { min: r.min ?? null, max: r.max ?? null };
      if (r.min && (!gmin || r.min < gmin)) gmin = r.min;
      if (r.max && (!gmax || r.max > gmax)) gmax = r.max;
    }

    res.json({ byFlight, global: { min: gmin, max: gmax } });
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /telemetry/nearest:
 *   get:
 *     summary: Çoklu uçuş için tek istekte prev/next döndürür
 *     tags: [Telemetry]
 *     parameters:
 *       - in: query
 *         name: flightIds
 *         required: true
 *         description: Virgülle ayrılmış ObjectId listesi
 *         schema: { type: string }
 *       - in: query
 *         name: at
 *         required: true
 *         description: Referans zaman (ISO)
 *         schema: { type: string, format: date-time }
 *     responses:
 *       200: { description: OK }
 *       400: { description: Hatalı parametre }
 */
router.get("/nearest", async (req, res, next) => {
  try {
    const idsParam = String(req.query.flightIds || "");
    const atStr = String(req.query.at || "");
    if (!idsParam) return res.status(400).json({ error: "flightIds is required" });
    const at = new Date(atStr);
    if (isNaN(at.getTime())) return res.status(400).json({ error: "Invalid at param" });

    const ids = idsParam
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => (Types.ObjectId.isValid(s) ? new Types.ObjectId(s) : null))
      .filter((x): x is Types.ObjectId => !!x);

    if (!ids.length) return res.status(400).json({ error: "No valid flightIds" });

    // prev: ts <= at (en yakın geçmiş)
    const prevAgg = await Telemetry.aggregate([
      { $match: { flight: { $in: ids }, ts: { $lte: at } } },
      { $sort: { ts: -1 } },
      { $group: { _id: "$flight", doc: { $first: "$$ROOT" } } },
    ]);

    // next: ts >= at (en yakın gelecek)
    const nextAgg = await Telemetry.aggregate([
      { $match: { flight: { $in: ids }, ts: { $gte: at } } },
      { $sort: { ts: 1 } },
      { $group: { _id: "$flight", doc: { $first: "$$ROOT" } } },
    ]);

    const out: Record<string, { prev?: any; next?: any }> = {};
    for (const id of ids) out[String(id)] = {};
    for (const r of prevAgg) out[String(r._id)].prev = { lat: r.doc.lat, lng: r.doc.lng, ts: r.doc.ts };
    for (const r of nextAgg) out[String(r._id)].next = { lat: r.doc.lat, lng: r.doc.lng, ts: r.doc.ts };

    res.json(out);
  } catch (err) {
    next(err);
  }
});

export default router;
