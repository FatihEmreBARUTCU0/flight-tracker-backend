// sim-mini.js  —  Node 18+
//
// Tek dosyada 2 mod:
//   MODE=live     → periyodik POST ile canlı akış
//   MODE=backfill → geçmişe toplu telemetri yaz
//
// ENV değişkenleri:
//   API           (default: http://127.0.0.1:3000)
//   CODE  / CODES (CSV: "DEMO1,DEMO2"; default: DEMO1)
//   MODE          (live | backfill; default: live)
//
// Live mod’a özel:
//   PERIOD_MS     (default: 1000)   — gönderim periyodu
//   STEPS         (default: 60)     — A→B arası kaç adımda ilerlesin
//   LOOP          (0|1; default: 1) — 1 ise A→B bitince tekrar başa sar
//
// Backfill mod’a özel:
//   MINUTES_AGO   (default: 10)     — geçmiş başlangıcı
//   POINTS        (default: 120)    — kaç nokta yazılacak
//   STEP_MS       (default: 5000)   — iki nokta arası zaman farkı
//
// Kullanım örnekleri:
//   # Live
//   API=http://127.0.0.1:3000 CODES=TK123,AB456 MODE=live node sim-mini.js
//
//   # Backfill (son 30 dakikaya 5sn aralıkla 360 nokta)
//   API=http://127.0.0.1:3000 CODE=TK123 MODE=backfill MINUTES_AGO=30 POINTS=360 STEP_MS=5000 node sim-mini.js
//
// Windows PowerShell:
//   $env:API="http://127.0.0.1:3000"; $env:CODES="TK123"; $env:MODE="live"; node .\sim-mini.js
//

const API = process.env.API || "http://127.0.0.1:3000";
const CODES = (process.env.CODES || process.env.CODE || "DEMO1")
  .split(",").map(s => s.trim()).filter(Boolean);
const MODE = String(process.env.MODE || "live").toLowerCase();

// Live mod parametreleri
const PERIOD_MS = Number(process.env.PERIOD_MS ?? 1000);
const STEPS = Number(process.env.STEPS ?? 60);
const LOOP = String(process.env.LOOP ?? "1") === "1";

// Backfill mod parametreleri
const MINUTES_AGO = Number(process.env.MINUTES_AGO ?? 10);
const POINTS = Number(process.env.POINTS ?? 120);
const STEP_MS = Number(process.env.STEP_MS ?? 5000);

if (!globalThis.fetch) {
  throw new Error("Node 18+ gerekir (global fetch yok).");
}

async function fetchJSON(url, opts) {
  const r = await fetch(url, opts);
  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error(`${opts?.method || "GET"} ${url} -> ${r.status} ${r.statusText} ${txt}`);
  }
  try { return await r.json(); } catch { return null; }
}

async function fetchFlightByCode(code) {
  const flights = await fetchJSON(`${API}/flights`);
  const f = flights.find(x => x.flightCode === code);
  if (!f) throw new Error(`Flight ${code} not found`);
  return f;
}

function lerp(a, b, t) { return a + (b - a) * t; }

async function runLive() {
  const sims = await Promise.all(CODES.map(async code => {
    const f = await fetchFlightByCode(code);
    const A = { lat: f.departure_lat, lng: f.departure_long };
    const B = { lat: f.destination_lat, lng: f.destination_long };
    return { code, A, B, i: 0 };
  }));

  console.log(`[sim-mini] LIVE start: ${CODES.join(", ")} | PERIOD=${PERIOD_MS}ms STEPS=${STEPS} LOOP=${LOOP}`);
  const tmr = setInterval(async () => {
    await Promise.all(sims.map(async s => {
      const t = Math.min(1, s.i / Math.max(1, STEPS));
      const nowIso = new Date().toISOString();
      const body = {
        flightCode: s.code,
        lat: lerp(s.A.lat, s.B.lat, t),
        lng: lerp(s.A.lng, s.B.lng, t),
        ts: nowIso
      };
      try {
        await fetchJSON(`${API}/telemetry`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body)
        });
      } catch (e) {
        console.error("[telemetry live] error:", e.message);
      }
      s.i++;
      if (s.i > STEPS) {
        if (LOOP) s.i = 0;
      }
    }));
    if (!LOOP && sims.every(s => s.i > STEPS)) {
      clearInterval(tmr);
      console.log("[sim-mini] LIVE finished");
    }
  }, PERIOD_MS);
}

async function runBackfill() {
  console.log(`[sim-mini] BACKFILL start: ${CODES.join(", ")} | MINUTES_AGO=${MINUTES_AGO} POINTS=${POINTS} STEP_MS=${STEP_MS}`);
  const startMs = Date.now() - MINUTES_AGO * 60 * 1000;
  const out = [];

  for (const code of CODES) {
    const f = await fetchFlightByCode(code);
    const A = { lat: f.departure_lat, lng: f.departure_long };
    const B = { lat: f.destination_lat, lng: f.destination_long };
    for (let i = 0; i < POINTS; i++) {
      const t = i / Math.max(1, (POINTS - 1));
      out.push({
        flightCode: code,       // flightId de kullanılabilirdi
        lat: lerp(A.lat, B.lat, t),
        lng: lerp(A.lng, B.lng, t),
        ts: new Date(startMs + i * STEP_MS).toISOString()
      });
    }
  }

  try {
    const resp = await fetchJSON(`${API}/telemetry`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(out)
    });
    console.log("[sim-mini] BACKFILL response:", resp);
  } catch (e) {
    console.error("[telemetry backfill] error:", e.message);
  }
}

(async () => {
  if (!CODES.length) {
    console.error("No CODE/CODES provided.");
    process.exit(1);
  }
  if (MODE === "backfill") await runBackfill();
  else await runLive();
})().catch(e => {
  console.error(e);
  process.exit(1);
});
