// sim-live.js (Node 18+)
const API = process.env.API || "http://127.0.0.1:3000";
// CODE veya CODES: "DEMO1,DEMO2"
const CODES = (process.env.CODES || process.env.CODE || "DEMO1")
  .split(",").map(s => s.trim()).filter(Boolean);

const PERIOD_MS = 1000; // 1 Hz
const STEPS = 60;       // 1 dakikalık akış

async function fetchFlightByCode(code) {
  const flights = await fetch(`${API}/flights`).then(r => {
    if (!r.ok) throw new Error(`GET /flights failed: ${r.status}`);
    return r.json();
  });
  const f = flights.find(x => x.flightCode === code);
  if (!f) throw new Error(`Flight ${code} not found`);
  return f;
}

async function main() {
  const sims = await Promise.all(CODES.map(async (code) => {
    const f = await fetchFlightByCode(code);
    const A = { lat: f.departure_lat, lng: f.departure_long };
    const B = { lat: f.destination_lat, lng: f.destination_long };
    const lerp = (a, b, t) => a + (b - a) * t;
    // flightId’ı tutuyoruz ama POST’ta kullanmayacağız
    return { id: f._id, code: f.flightCode, A, B, lerp, i: 0 };
  }));

  const tmr = setInterval(async () => {
    const nowIso = new Date().toISOString();

    await Promise.all(sims.map(async s => {
      const t = Math.min(1, s.i / STEPS);
      const body = {
        // Yeni şemaya uygun alanlar
        flightCode: s.code,
        lat: s.lerp(s.A.lat, s.B.lat, t),
        lng: s.lerp(s.A.lng, s.B.lng, t),
        ts: nowIso
      };

      const resp = await fetch(`${API}/telemetry`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });

      if (!resp.ok) {
        const text = await resp.text().catch(() => "");
        console.error(`POST /telemetry ${resp.status} ${resp.statusText} — ${text}`);
      }

      s.i++;
    }));

    if (sims.every(s => s.i > STEPS)) {
      clearInterval(tmr);
      console.log("done");
    }
  }, PERIOD_MS);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
