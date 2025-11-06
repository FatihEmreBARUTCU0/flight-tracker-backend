const API = process.env.API || "http://127.0.0.1:3000";
const CODES = (process.env.CODES || process.env.CODE || "DEMO").split(",").map(s=>s.trim()).filter(Boolean);
const MINUTES_AGO = 10;
const POINTS = 120; // 5 sn arayla

async function fetchFlightByCode(code){
  const flights = await fetch(`${API}/flights`).then(r=>r.json());
  const f = flights.find(x => x.flightCode === code);
  if (!f) throw new Error(`Flight ${code} not found`);
  return f;
}

async function main(){
  const now0 = Date.now() - MINUTES_AGO*60*1000;
  const out = [];
  for (const code of CODES){
    const f = await fetchFlightByCode(code);
    const A = { lat:f.departure_lat, lng:f.departure_long };
    const B = { lat:f.destination_lat, lng:f.destination_long };
    const lerp = (a,b,t)=>a+(b-a)*t;
    for (let i=0;i<POINTS;i++){
      const t = i/(POINTS-1);
      out.push({
        flightId: f._id,
        lat: lerp(A.lat,B.lat,t),
        lng: lerp(A.lng,B.lng,t),
        ts: new Date(now0 + i*5000).toISOString()
      });
    }
  }
  const r = await fetch(`${API}/telemetry`, {
    method:"POST", headers:{ "Content-Type":"application/json" },
    body: JSON.stringify(out)
  }).then(r=>r.json());
  console.log(r);
}
main().catch(e=>{ console.error(e); process.exit(1); });