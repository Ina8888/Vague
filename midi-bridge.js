/**
 * midi-bridge.js
 *
 * Node.js WebSocket bridge between the APC Mini Mk2
 * (via the local apc-mini-mk2 npm library) and the browser app.
 *
 * Run:  node midi-bridge.js
 * Keep this terminal open while using the browser app.
 *
 * Browser connects to:  ws://localhost:8081
 * Messages → browser:   {type:"status"|"pad"|"slider"|"horizontal"|"vertical", ...}
 * Messages ← browser:   {type:"lights", pads:[{location, color, mode}]}
 */

const WebSocket = require("ws");
const path      = require("path");

// ─── APC Mini Mk2 library (your local repo) ───────────────────────────────────
const APC_LIB = path.resolve(
  "D:/programming/computer space/apc mini/apc-mini-mk2/dist/index.js"
);
const { APCMiniController } = require(APC_LIB);

const WS_PORT = 8081;

// ─── APC controller ───────────────────────────────────────────────────────────
const apc = new APCMiniController(1);

apc.on("error",      (err)           => console.error("[APC] Error:", err));
apc.on("connect",    (id, name)      => { console.log(`[APC] Connected: ${name}`); broadcast({ type: "status", connected: true  }); playConnectAnimation(); });
apc.on("disconnect", (id, name)      => { console.log(`[APC] Disconnected: ${name}`); broadcast({ type: "status", connected: false }); });

apc.on("padButtonChanged",        (id, location, coords, pressed) => broadcast({ type: "pad",        location, coords, pressed }));
apc.on("sliderChanged",           (id, location, value)           => broadcast({ type: "slider",     location, value }));
apc.on("horizontalButtonChanged", (id, location, pressed)         => broadcast({ type: "horizontal", location, pressed }));
apc.on("verticalButtonChanged",   (id, location, pressed)         => broadcast({ type: "vertical",   location, pressed }));

apc.startAutoConnect();

// ─── WebSocket server ─────────────────────────────────────────────────────────
const wss     = new WebSocket.Server({ port: WS_PORT });
const clients = new Set();

wss.on("connection", (ws) => {
  clients.add(ws);
  console.log(`[WS] Browser connected  (${clients.size} client(s))`);

  // Tell browser the current APC connection state immediately
  ws.send(JSON.stringify({ type: "status", connected: apc.getConnectedAmount() > 0 }));

  ws.on("message", (raw) => {
    try {
      const msg = JSON.parse(raw);
      if (msg.type === "lights" && Array.isArray(msg.pads)) {
        // Browser sends [{location, color, mode}] — update pad LEDs
        for (const pad of msg.pads) {
          if (typeof pad.location === "number" && typeof pad.color === "string") {
            apc.setRgbLights(0, pad.location, "brightness_100", pad.mode || "static", pad.color);
          }
        }
      }
    } catch (_) { /* ignore malformed messages */ }
  });

  ws.on("close", () => {
    clients.delete(ws);
    console.log(`[WS] Browser disconnected (${clients.size} client(s) remaining)`);
  });

  ws.on("error", () => { /* handled by close */ });
});

function broadcast(obj) {
  const data = JSON.stringify(obj);
  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN) ws.send(data);
  }
}

// ─── Connect animation — cyan row sweep across the 8×8 grid ──────────────────
function playConnectAnimation() {
  const CYAN = "#00e6ff";
  const DIM  = "#001a20";
  const COLS = 8;
  const ROWS = 8;
  let step   = 0;

  const id = setInterval(() => {
    const locs = [];
    if (step < ROWS) {
      // Sweep: light up current row in cyan
      for (let c = 0; c < COLS; c++) locs.push(step * COLS + c);
      apc.setRgbLights(0, locs, "brightness_100", "static", CYAN);
    } else if (step < ROWS * 2) {
      // Trail: dim out the previous row
      const row = step - ROWS;
      for (let c = 0; c < COLS; c++) locs.push(row * COLS + c);
      apc.setRgbLights(0, locs, "brightness_10", "static", DIM);
    } else {
      clearInterval(id);
      console.log("[APC] Ready — bridge is live!");
    }
    step++;
  }, 60);
}

console.log(`[BRIDGE] WebSocket listening on ws://localhost:${WS_PORT}`);
console.log("[BRIDGE] Waiting for APC Mini Mk2...");
