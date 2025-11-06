// node sim-mini.js
const API='http://127.0.0.1:3000', CODE='TK123', PERIOD=1000, STEPS=60;
async function flights(){return fetch(`${API}/flights`).then(r=>r.json())}
function lerp(a,b,t){return a+(b-a)*t}
;(async()=>{
  const f=(await flights()).find(x=>x.flightCode===CODE)
  const A={lat:f.departure_lat,lng:f.departure_long}
  const B={lat:f.destination_lat,lng:f.destination_long}
  let i=0; setInterval(async()=>{
    const t=Math.min(1,i/STEPS)
    await fetch(`${API}/telemetry`,{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({flightCode:CODE,lat:lerp(A.lat,B.lat,t),lng:lerp(A.lng,B.lng,t),ts:new Date().toISOString()})
    })
    i++
  },PERIOD)
})()
