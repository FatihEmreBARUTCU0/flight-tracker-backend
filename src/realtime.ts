import Telemetry from "./config/models/telemetry";
import { Types } from "mongoose";
import { WebSocket } from "ws";


type FlightLike = {
  _id: any;
  flightCode: string;
  departure_lat: number;
  departure_long: number;
  destination_lat: number;
  destination_long: number;
  departureTime: Date | string;
};

type BufferItem = { flight: any; lat: number; lng: number; ts: Date };


const clients = new Set<WebSocket>();

export function registerClient(ws: WebSocket) {
  clients.add(ws);
  
  (ws as any).on("close", () => clients.delete(ws));
}

export function broadcast(msg: any) {
  const data = JSON.stringify(msg);
  for (const socket of clients) {
    if (socket.readyState === WebSocket.OPEN) {  
      try { socket.send(data); } catch {}
    }
  }
}

// --- Simulation state ---
const timers = new Map<string, ReturnType<typeof setInterval>>();
const phases = new Map<string, number>();

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function interp(
  A: { lat: number; lng: number },
  B: { lat: number; lng: number },
  t: number
) {
  return { lat: lerp(A.lat, B.lat, t), lng: lerp(A.lng, B.lng, t) };
}


const buffers = new Map<string, BufferItem[]>();


const WRITE_EVERY_N = 5;

const FLUSH_MS = 1000;

const BATCH_SIZE = 200;

let flushingAll = false;

async function flushAllBuffers() {
  if (flushingAll) return;
  flushingAll = true;
  try {
    for (const [id, buf] of buffers) {
      if (!buf.length) continue;
      const batch = buf.splice(0, BATCH_SIZE);
      if (batch.length) {
        await Telemetry.insertMany(batch, { ordered: false });
      }
    }
  } catch (e) {
    console.error("telemetry flush error:", e);
  } finally {
    flushingAll = false;
  }
}


const FLUSH_TIMER = setInterval(() => {
  void flushAllBuffers();
}, FLUSH_MS);

function pushTelemetryBuffered(flightId: string, item: BufferItem) {
  let buf = buffers.get(flightId);
  if (!buf) {
    buf = [];
    buffers.set(flightId, buf);
  }
  buf.push(item);
}

async function flushFlightBuffer(flightId: string) {
  const buf = buffers.get(flightId);
  if (!buf?.length) return;
  const batch = buf.splice(0, buf.length);
  try {
    await Telemetry.insertMany(batch, { ordered: false });
  } catch (e) {
    console.error(`flush error for flight ${flightId}:`, e);
  }
}


export function startSimForFlight(
  f: FlightLike,
  periodMs = 200,
  step = 0.01
) {
  const id = String(f._id);
  if (timers.has(id)) return; 

  const A = { lat: f.departure_lat, lng: f.departure_long };
  const B = { lat: f.destination_lat, lng: f.destination_long };

  phases.set(id, 0);


  const flightObjId = Types.ObjectId.isValid(id) ? new Types.ObjectId(id) : id;


  buffers.set(id, buffers.get(id) ?? []);

  let tick = 0;
  const tmr = setInterval(() => {
    const t0 = phases.get(id) ?? 0;
    const t = t0 + step > 1 ? 0 : t0 + step;
    phases.set(id, t);

    const p = interp(A, B, t);


    const tsDate = new Date();
    const tsMs = tsDate.getTime();

  
    broadcast({
      type: "telemetry",
      flightId: id,
      lat: p.lat,
      lng: p.lng,
      ts: tsMs,
    });

    
    if (tick++ % WRITE_EVERY_N === 0) {
      pushTelemetryBuffered(id, {
        flight: flightObjId,
        lat: p.lat,
        lng: p.lng,
        ts: tsDate,
      });
    }
  }, periodMs);

  timers.set(id, tmr);
}

export function stopSimForFlight(id: string) {
  const t = timers.get(id);
  if (t !== undefined) clearInterval(t);
  timers.delete(id);
  phases.delete(id);

  void flushFlightBuffer(id);
  buffers.delete(id);
}


export function stopAllSims() {
  for (const id of Array.from(timers.keys())) stopSimForFlight(id);
}

export async function shutdownRealtime() {
  clearInterval(FLUSH_TIMER);
  stopAllSims();
  await flushAllBuffers(); 
}
