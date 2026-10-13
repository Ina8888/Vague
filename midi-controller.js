/**
 * midi-controller.js  (browser)
 *
 * WebSocket client that talks to midi-bridge.js (Node.js).
 * Automatically reconnects if the bridge goes down.
 *
 * Exposes to the rest of the app:
 *   window.midiState            — live MIDI state object (read by colorful-track.js)
 *   window.sendMidiLights(pads) — call with [{location, color, mode}] to update pad LEDs
 *
 * Custom DOM events fired on window:
 *   "midiPad"        → { location, coords, pressed }
 *   "midiSlider"     → { location, value }
 *   "midiHorizontal" → { location, pressed }
 *   "midiVertical"   → { location, pressed }
 */

(function () {
  "use strict";

  const WS_URL          = "ws://localhost:8081";
  const RECONNECT_DELAY = 3000;  // ms

  // ── Shared state (read by colorful-track.js) ─────────────────────────────
  window.midiState = {
    connected:  false,
    pads:       new Array(64).fill(false),
    sliders:    [0, 64, 64, 0, 64, 0, 0, 0, 100], // [0]pix, [1]bright, [2]sat, [3]hue, [4]contrast, [5]blur, [6]invert, [7]glitch, [8]vol
    horizontal: new Array(8).fill(false),
    vertical:   new Array(8).fill(false),
  };

  // ── Send light commands to bridge ────────────────────────────────────────
  let _ws = null;
  window.sendMidiLights = function (pads) {
    if (_ws && _ws.readyState === WebSocket.OPEN) {
      _ws.send(JSON.stringify({ type: "lights", pads }));
    }
  };

  window.resetMidiLights = function () {
    if (_ws && _ws.readyState === WebSocket.OPEN) {
      _ws.send(JSON.stringify({ type: "reset" }));
    }
  };

  // ── WebSocket management ─────────────────────────────────────────────────
  function connect() {
    _ws = new WebSocket(WS_URL);

    _ws.addEventListener("open", () => {
      console.log("[MIDI] Bridge connected →", WS_URL);
    });

    _ws.addEventListener("message", ({ data }) => {
      let msg;
      try { msg = JSON.parse(data); } catch (_) { return; }

      switch (msg.type) {
        case "status":
          window.midiState.connected = msg.connected;
          console.log("[MIDI] APC Mini Mk2:", msg.connected ? "● CONNECTED" : "○ NOT CONNECTED");
          break;

        case "pad":
          window.midiState.pads[msg.location] = msg.pressed;
          window.dispatchEvent(new CustomEvent("midiPad", { detail: msg }));
          break;

        case "slider":
          window.midiState.sliders[msg.location] = msg.value;
          window.dispatchEvent(new CustomEvent("midiSlider", { detail: msg }));
          break;

        case "horizontal":
          window.midiState.horizontal[msg.location] = msg.pressed;
          window.dispatchEvent(new CustomEvent("midiHorizontal", { detail: msg }));
          break;

        case "vertical":
          window.midiState.vertical[msg.location] = msg.pressed;
          window.dispatchEvent(new CustomEvent("midiVertical", { detail: msg }));
          break;
      }
    });

    _ws.addEventListener("close", () => {
      window.midiState.connected = false;
      console.log(`[MIDI] Bridge disconnected — retrying in ${RECONNECT_DELAY / 1000}s`);
      setTimeout(connect, RECONNECT_DELAY);
    });

    _ws.addEventListener("error", () => { /* close handler will retry */ });
  }

  connect();
})();
