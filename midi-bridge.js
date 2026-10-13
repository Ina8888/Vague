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

// ─── WebSocket server & clients set (INITIALIZED FIRST to avoid TDZ errors) ────
const clients = new Set();
let wss;

try {
  wss = new WebSocket.Server({ port: WS_PORT });
  console.log(`[BRIDGE] WebSocket listening on ws://localhost:${WS_PORT}`);
} catch (err) {
  console.error(`[BRIDGE] Failed to start WebSocket on port ${WS_PORT}:`, err.message);
}

function broadcast(obj) {
  if (!clients || clients.size === 0) return;
  const data = JSON.stringify(obj);
  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN) {
      try { ws.send(data); } catch (_) {}
    }
  }
}

// ─── APC controller ───────────────────────────────────────────────────────────
const apc = new APCMiniController(1);

apc.on("error", (err) => console.error("[APC] Error:", err));

apc.on("connect", (id, name) => {
  console.log(`[APC] Connected: ${name}`);
  broadcast({ type: "status", connected: true });
  playConnectAnimation();
});

apc.on("disconnect", (id, name) => {
  console.log(`[APC] Disconnected: ${name}`);
  broadcast({ type: "status", connected: false });
});

apc.on("padButtonChanged", (id, location, coords, pressed) => {
  broadcast({ type: "pad", location, coords, pressed });
});

apc.on("sliderChanged", (id, location, value) => {
  broadcast({ type: "slider", location, value });
});

apc.on("horizontalButtonChanged", (id, location, pressed) => {
  broadcast({ type: "horizontal", location, pressed });
});

apc.on("verticalButtonChanged", (id, location, pressed) => {
  broadcast({ type: "vertical", location, pressed });
});

// Start auto connect AFTER listeners and clients set are ready
apc.startAutoConnect();

// ─── WebSocket connection handling ────────────────────────────────────────────
if (wss) {
  wss.on("connection", (ws) => {
    clients.add(ws);
    const count = apc.getConnectedAmount();
    console.log(`[WS] Browser connected (${clients.size} client(s)). APC connected: ${count > 0}`);

    // Immediately inform browser of APC hardware status
    ws.send(JSON.stringify({ type: "status", connected: count > 0 }));

    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw);
        if (msg.type === "lights" && Array.isArray(msg.pads)) {
          if (typeof apc.setBulkRgbPadColors === "function") {
            apc.setBulkRgbPadColors(0, msg.pads);
          } else {
            for (const pad of msg.pads) {
              if (typeof pad.location === "number" && typeof pad.color === "string") {
                apc.setRgbLights(0, pad.location, "brightness_100", pad.mode || "static", pad.color);
              }
            }
          }
        } else if (msg.type === "reset") {
          if (typeof apc.resetLights === "function") {
            apc.resetLights(0);
          }
        }
      } catch (_) { /* ignore malformed messages */ }
    });

    ws.on("close", () => {
      clients.delete(ws);
      console.log(`[WS] Browser disconnected (${clients.size} client(s) remaining)`);
    });

    ws.on("error", (err) => {
      console.error("[WS] Client socket error:", err.message);
    });
  });

  wss.on("error", (err) => {
    console.error("[WS] Server error:", err.message);
  });
}

// ─── Connect animation — cyan row sweep across the 8×8 grid ──────────────────
function playConnectAnimation() {
  const CYAN = "#00e6ff";
  const DIM  = "#001a20";
  const COLS = 8;
  const ROWS = 8;
  let step   = 0;

  const id = setInterval(() => {
    try {
      const locs = [];
      if (step < ROWS) {
        for (let c = 0; c < COLS; c++) locs.push(step * COLS + c);
        apc.setRgbLights(0, locs, "brightness_100", "static", CYAN);
      } else if (step < ROWS * 2) {
        const row = step - ROWS;
        for (let c = 0; c < COLS; c++) locs.push(row * COLS + c);
        apc.setRgbLights(0, locs, "brightness_10", "static", DIM);
      } else {
        clearInterval(id);
        console.log("[APC] Ready — bridge is live!");
      }
      step++;
    } catch (_) {
      clearInterval(id);
    }
  }, 50);
}

console.log("[BRIDGE] Waiting for APC Mini Mk2...");
