import {
  HandLandmarker,
  FilesetResolver,
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0";

// ─────────────────────────────────────────────────────────────
// App state
// ─────────────────────────────────────────────────────────────
let capture;
let handLandmarker;
let hands;

let appState         = "CAMERA_VIEW";
let activeVideo      = null;
let selectedEditMode = null;  // 'music-play'|'effect-bomb'|'pixelate'|'color-grade'

// Hover tracking
let hoveredModeId     = null;
let hoveredEditModeId = null;
let hoveredVideoIndex = -1;

// Gesture state
let pinchClosed          = false;
let pinchCooldownUntil   = 0;   // time-based block — pinch can't fire until this passes
let gestureCooldownUntil = 0;
let pixelBuffer;


// ─────────────────────────────────────────────────────────────
// EFFECT BOMB state
// ─────────────────────────────────────────────────────────────
const EFFECTS = [
  { name: "NORMAL",        filter: "none" },
  { name: "BLUR",          filter: "blur(6px)" },
  { name: "INVERT",        filter: "invert(1)" },
  { name: "SEPIA",         filter: "sepia(1)" },
  { name: "NEON HUE",      filter: "hue-rotate(90deg) saturate(4)" },
  { name: "HIGH CONTRAST", filter: "contrast(3) saturate(2)" },
  { name: "ICE COLD",      filter: "hue-rotate(200deg) saturate(2)" },
];
let currentEffectIndex = 0;
let effectGestureLatch = false; // prevents rapid cycling on a held gesture

// ─────────────────────────────────────────────────────────────
// COLOR GRADE state
// ─────────────────────────────────────────────────────────────
let colorGradeActive = false;
let colorGradeLatch  = false;

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────
const GESTURE_COOLDOWN_MS  = 900;
const PINCH_ON_PX          = 55;
const PINCH_OFF_PX         = 85;
const PINKY_THUMB_TOUCH_PX = 60; // pixel threshold for pinky+thumb contact
const NEON                 = [0, 230, 255];
const FONT                 = "Besport";

// ─────────────────────────────────────────────────────────────
// Video Library — edit titles/subtitles/src to match your files.
// Put .mp4 files in a  videos/  folder next to index.html.
// ─────────────────────────────────────────────────────────────
const VIDEO_LIBRARY = [
  { title: "WINDSURFING",   subtitle: "VIDEO 1", src: "videos/video1.mp4" },
  { title: "WINDSURFING 2", subtitle: "VIDEO 2", src: "videos/video2.mp4" },
  { title: "SKY",           subtitle: "VIDEO 3", src: "videos/video3.mp4" },
];

window.fingerState = [];

// ─────────────────────────────────────────────────────────────
// p5 lifecycle
// ─────────────────────────────────────────────────────────────
function hideLoading() {
  const el = document.getElementById("loading-message");
  if (el) el.classList.add("is-hidden");
}

window.setup = function () {
  createCanvas(960, 540);
  textFont(FONT);
  pixelBuffer = createGraphics(160, 120);
  capture = createCapture(VIDEO);
  capture.hide();
};

window.draw = function () {
  background(0);
  if (!handLandmarker) return;
  hideLoading();

  switch (appState) {
    case "CAMERA_VIEW":
      push();
      translate(width, 0);
      scale(-1, 1);
      image(capture, 0, 0, width, height);
      pop();
      drawDebuggerInfo();
      break;
    case "MENU_VIEW":       drawModeMenu();      break;
    case "EDIT_MODE_VIEW":  drawEditModeMenu();  break;
    case "VIDEOS_PAGE":     drawVideosPage();    break;
    case "VIDEO_VIEW":      drawVideoPlayback(); break;
  }

  if (!capture || !capture.elt || capture.elt.readyState < 2) return;
  hands = handLandmarker.detect(capture.elt);

  if (hands && hands.landmarks.length > 0) {
    updateFingerState(hands.landmarks, hands.handednesses);
    handleClicks();
    drawTrackingOverlay();
  } else {
    window.fingerState = [];
    hoveredModeId      = null;
    hoveredEditModeId  = null;
    hoveredVideoIndex  = -1;
    pinchClosed        = false;
  }
};

// ─────────────────────────────────────────────────────────────
// Coordinate helpers
// ─────────────────────────────────────────────────────────────
function toScreen(lm) {
  return { x: width - lm.x * width, y: lm.y * height };
}

function fingerJoint(lm, tipIdx, baseIdx) {
  return {
    tip:        lm[tipIdx],
    base:       lm[baseIdx],
    tipScreen:  toScreen(lm[tipIdx]),
    baseScreen: toScreen(lm[baseIdx]),
  };
}

function isFingerExtended(lm, tipIdx, baseIdx) {
  const w       = lm[0];
  const tipDist  = Math.hypot(lm[tipIdx].x  - w.x, lm[tipIdx].y  - w.y);
  const baseDist = Math.hypot(lm[baseIdx].x - w.x, lm[baseIdx].y - w.y);
  return tipDist > baseDist;
}

// ─────────────────────────────────────────────────────────────
// Hand state / gesture detection
// ─────────────────────────────────────────────────────────────
function updateFingerState(landmarksArr, handednessesArr) {
  window.fingerState = [];

  for (let i = 0; i < landmarksArr.length; i++) {
    const lm       = landmarksArr[i];
    const rawType  = handednessesArr[i][0].categoryName;
    const handType = rawType === "Left" ? "Right" : "Left";
    const thumbSc  = toScreen(lm[4]);
    const indexSc  = toScreen(lm[8]);
    const pinchDistancePx = Math.hypot(thumbSc.x - indexSc.x, thumbSc.y - indexSc.y);

    const hand = {
      type:         handType,
      wrist:        lm[0],
      wristScreen:  toScreen(lm[0]),
      thumb:  fingerJoint(lm, 4,  2),
      index:  fingerJoint(lm, 8,  5),
      middle: fingerJoint(lm, 12, 9),
      ring:   fingerJoint(lm, 16, 13),
      pinky:  fingerJoint(lm, 20, 17),
      pinchDistancePx,
      isFist:     checkIfFist(lm),
      isPinching: false,
    };

    hand.isPinching = pinchDistancePx < PINCH_ON_PX && isFingerExtended(lm, 12, 9);
    window.fingerState.push(hand);

    if (millis() < gestureCooldownUntil) continue;

    // Fist navigation: CAMERA_VIEW → menu, VIDEO_VIEW → video selection
    if (handType === "Right" && hand.isFist) {
      if (appState === "CAMERA_VIEW") {
        setAppState("MENU_VIEW");
      } else if (appState === "VIDEO_VIEW") {
        closeVideo();
        setAppState("VIDEOS_PAGE");
      }
    }
  }
}

function setAppState(next) {
  appState             = next;
  gestureCooldownUntil = millis() + GESTURE_COOLDOWN_MS;
  pinchCooldownUntil   = millis() + 1000; // block pinch for 1s — time-based, bulletproof
  pinchClosed          = false;
  hoveredModeId        = null;
  hoveredEditModeId    = null;
  hoveredVideoIndex    = -1;
}


function getRightHand() {
  const labeled = window.fingerState.find(h => h.type === "Right");
  if (labeled) return labeled;
  if (!window.fingerState.length) return null;
  return window.fingerState.reduce((best, h) =>
    h.wristScreen.x > best.wristScreen.x ? h : best
  );
}

function getLeftHand() {
  return window.fingerState.find(h => h.type === "Left") || null;
}

// ─────────────────────────────────────────────────────────────
// Gesture helpers
// ─────────────────────────────────────────────────────────────

// Returns true when left hand's pinky tip and thumb tip are touching
function isPinkyThumbTouching(hand) {
  if (!hand) return false;
  const pk = hand.pinky.tipScreen;
  const th = hand.thumb.tipScreen;
  return Math.hypot(pk.x - th.x, pk.y - th.y) < PINKY_THUMB_TOUCH_PX;
}

// ─────────────────────────────────────────────────────────────
// Button layout helpers
// ─────────────────────────────────────────────────────────────
function getModeButtons() {
  const bw = 300, bh = 78, gap = 28;
  const topY  = height * 0.34;
  const leftX = width / 2 - bw - gap / 2;
  const rightX = width / 2 + gap / 2;
  return [
    { id: "video-edit",    lines: ["VIDEO EDIT"],          x: leftX,          y: topY,       w: bw, h: bh },
    { id: "control-world", lines: ["CONTROL", "THE WORLD"],x: rightX,         y: topY,       w: bw, h: bh },
    { id: "make-music",    lines: ["MAKE MUSIC"],          x: width/2 - bw/2, y: topY+bh+36, w: bw, h: bh },
  ];
}

function getEditModeButtons() {
  const bw = 300, bh = 82, gap = 28;
  const topY  = height * 0.34;
  const leftX = width / 2 - bw - gap / 2;
  const rightX = width / 2 + gap / 2;
  return [
    { id: "music-play",  lines: ["MUSIC", "PLAY"],  x: leftX,  y: topY,        w: bw, h: bh },
    { id: "effect-bomb", lines: ["EFFECT", "BOMB"], x: rightX, y: topY,        w: bw, h: bh },
    { id: "pixelate",    lines: ["PIXELATE"],        x: leftX,  y: topY+bh+gap, w: bw, h: bh },
    { id: "color-grade", lines: ["COLOR", "GRADE"],  x: rightX, y: topY+bh+gap, w: bw, h: bh },
  ];
}

function getVideoButtons() {
  const bw = 300, bh = 82, gap = 28;
  const topY    = height * 0.34;
  const leftX   = width / 2 - bw - gap / 2;
  const rightX  = width / 2 + gap / 2;
  const centerX = width / 2 - bw / 2;
  const pos = [
    { x: leftX,   y: topY },
    { x: rightX,  y: topY },
    { x: centerX, y: topY + bh + gap },
  ];
  return VIDEO_LIBRARY.map((_, i) => ({ ...pos[i], w: bw, h: bh }));
}

function pointInRect(p, b) {
  return p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;
}

// ─────────────────────────────────────────────────────────────
// Pinch edge-detection with time-based cooldown
//
// After any setAppState() call, pinchCooldownUntil is set 1 second in
// the future. rightPinchJustStarted() returns false for that entire
// second, no matter what the hand is doing. This is identical in
// approach to gestureCooldownUntil (fist lock) and is bulletproof
// because it cannot be broken by MediaPipe dropping a frame.
// ─────────────────────────────────────────────────────────────
function rightPinchJustStarted(rh) {
  if (!rh || rh.isFist) { pinchClosed = false; return false; }

  // Block during cooldown window — track pinchClosed but never fire
  if (millis() < pinchCooldownUntil) {
    pinchClosed = rh.isPinching;
    return false;
  }

  const pinching = pinchClosed ? rh.pinchDistancePx < PINCH_OFF_PX : rh.isPinching;
  const started  = pinching && !pinchClosed;
  pinchClosed    = pinching;
  return started;
}


// ─────────────────────────────────────────────────────────────
// Hover + click handling
// ─────────────────────────────────────────────────────────────
function handleClicks() {
  const rh = getRightHand();
  hoveredModeId     = null;
  hoveredEditModeId = null;
  hoveredVideoIndex = -1;

  if (!rh || rh.isFist) return;
  const tip = rh.index.tipScreen;

  if (appState === "MENU_VIEW") {
    for (const btn of getModeButtons()) {
      if (pointInRect(tip, btn)) hoveredModeId = btn.id;
    }
    if (rightPinchJustStarted(rh) && hoveredModeId === "video-edit") {
      setAppState("EDIT_MODE_VIEW");
    }
    return;
  }

  if (appState === "EDIT_MODE_VIEW") {
    for (const btn of getEditModeButtons()) {
      if (pointInRect(tip, btn)) hoveredEditModeId = btn.id;
    }
    if (rightPinchJustStarted(rh) && hoveredEditModeId) {
      selectedEditMode   = hoveredEditModeId;
      currentEffectIndex = 0;      // reset effect cycle for new session
      colorGradeActive   = false;  // reset color grade activation
      setAppState("VIDEOS_PAGE");
    }
    return;
  }

  if (appState === "VIDEOS_PAGE") {
    const boxes = getVideoButtons();
    for (let i = 0; i < boxes.length; i++) {
      if (pointInRect(tip, boxes[i])) hoveredVideoIndex = i;
    }
    if (rightPinchJustStarted(rh) && hoveredVideoIndex >= 0) {
      openVideo(VIDEO_LIBRARY[hoveredVideoIndex]);
    }
  }
}

// ─────────────────────────────────────────────────────────────
// Video
// ─────────────────────────────────────────────────────────────
function openVideo(entry) {
  closeVideo();
  activeVideo = createVideo(entry.src, () => {
    activeVideo.loop();
    activeVideo.elt.play().catch(() => {});
  });
  activeVideo.hide();
  activeVideo.volume(0.8);
  setAppState("VIDEO_VIEW");
}

function closeVideo() {
  if (!activeVideo) return;
  activeVideo.stop();
  activeVideo.remove();
  activeVideo = null;
}

// ─────────────────────────────────────────────────────────────
// PIXELATE helpers
// Right hand: two-hand wrist distance → pixel block size
//             one-hand: Y position → volume
// ─────────────────────────────────────────────────────────────
function getLiveEffects() {
  const tracked = window.fingerState;
  let pixelSize = 2, volume = 0.7;

  if (tracked.length === 2) {
    const a = tracked[0].wristScreen, b = tracked[1].wristScreen;
    pixelSize = lerp(48, 1, constrain(Math.hypot(a.x-b.x, a.y-b.y) / (width * 0.7), 0, 1));
  } else if (tracked.length === 1) {
    pixelSize = lerp(36, 1, constrain(tracked[0].pinchDistancePx / 0.18, 0, 1));
  }

  if (tracked.length > 0) {
    const yAvg = tracked.reduce((s, h) => s + h.wristScreen.y, 0) / tracked.length;
    volume = constrain(1 - yAvg / height, 0, 1);
  }
  return { pixelSize, volume };
}

function renderPixelated(pixelSize) {
  if (!activeVideo) return;
  const block = Math.max(1, Math.round(pixelSize));
  if (block <= 1) {
    image(activeVideo, 0, 0, width, height);
  } else {
    const pw = Math.max(1, Math.floor(width  / block));
    const ph = Math.max(1, Math.floor(height / block));
    if (pixelBuffer.width !== pw || pixelBuffer.height !== ph) {
      pixelBuffer.resizeCanvas(pw, ph);
    }
    pixelBuffer.image(activeVideo, 0, 0, pw, ph);
    drawingContext.imageSmoothingEnabled = false;
    image(pixelBuffer, 0, 0, width, height);
    drawingContext.imageSmoothingEnabled = true;
  }
}

// ─────────────────────────────────────────────────────────────
// EFFECT BOMB helpers
// Left hand pinky + thumb touch → cycle to next CSS filter effect.
// Uses a latch so one touch = one cycle step (not continuous spinning).
// ─────────────────────────────────────────────────────────────
function updateEffectBomb(leftHand) {
  const touching = isPinkyThumbTouching(leftHand);
  if (touching && !effectGestureLatch) {
    currentEffectIndex = (currentEffectIndex + 1) % EFFECTS.length;
    effectGestureLatch = true;
  } else if (!touching) {
    effectGestureLatch = false; // reset latch so next touch cycles again
  }
}

// ─────────────────────────────────────────────────────────────
// COLOR GRADE helpers
// Left hand pinky + thumb → toggles grade ON/OFF.
// While ON, right hand X position controls brightness + saturation:
//   hand on LEFT side  → bright (2×) + shallow/desaturated (0.3×)
//   hand on RIGHT side → dark  (0.3×) + vivid/saturated   (2.5×)
// ─────────────────────────────────────────────────────────────
function updateColorGrade(leftHand, rightHand) {
  const touching = isPinkyThumbTouching(leftHand);
  if (touching && !colorGradeLatch) {
    colorGradeActive = !colorGradeActive;
    colorGradeLatch  = true;
  } else if (!touching) {
    colorGradeLatch = false;
  }

  let brightness = 1, saturation = 1;
  if (colorGradeActive && rightHand) {
    const xNorm = constrain(rightHand.wristScreen.x / width, 0, 1);
    brightness = lerp(2.0, 0.3, xNorm);  // left = bright,   right = dark
    saturation = lerp(0.3, 2.5, xNorm);  // left = shallow,  right = vivid
  }
  return { brightness, saturation };
}

// ─────────────────────────────────────────────────────────────
// Video playback renderer — branches on selectedEditMode
// ─────────────────────────────────────────────────────────────
function drawVideoPlayback() {
  const lh = getLeftHand();
  const rh = getRightHand();

  // ── PIXELATE ─────────────────────────────────────────────
  if (selectedEditMode === "pixelate" || selectedEditMode === null) {
    const fx = getLiveEffects();
    if (activeVideo) activeVideo.volume(fx.volume);
    renderPixelated(fx.pixelSize);
    drawVideoHUD(`PIXELATE  ${Math.round(fx.pixelSize)}px   |   VOL  ${Math.round(fx.volume * 100)}%`);
    return;
  }

  // ── EFFECT BOMB ──────────────────────────────────────────
  if (selectedEditMode === "effect-bomb") {
    updateEffectBomb(lh);
    const ef = EFFECTS[currentEffectIndex];
    // Apply CSS filter to the video image via the canvas context
    drawingContext.filter = ef.filter;
    if (activeVideo) image(activeVideo, 0, 0, width, height);
    drawingContext.filter = "none"; // always reset so HUD text is unaffected
    drawVideoHUD(`EFFECT: ${ef.name}   |   LH PINKY+THUMB = NEXT`);
    return;
  }

  // ── COLOR GRADE ──────────────────────────────────────────
  if (selectedEditMode === "color-grade") {
    const cg = updateColorGrade(lh, rh);
    drawingContext.filter = `brightness(${cg.brightness.toFixed(2)}) saturate(${cg.saturation.toFixed(2)})`;
    if (activeVideo) image(activeVideo, 0, 0, width, height);
    drawingContext.filter = "none";
    const status = colorGradeActive
      ? `BRIGHT ${Math.round(cg.brightness * 100)}%  SAT ${Math.round(cg.saturation * 100)}%`
      : "OFF  —  LH PINKY+THUMB TO ACTIVATE";
    drawVideoHUD(`COLOR GRADE: ${status}   |   RH POSITION = GRADE`);
    return;
  }

  // ── MUSIC PLAY (MIDI — coming soon) ──────────────────────
  if (selectedEditMode === "music-play") {
    if (activeVideo) image(activeVideo, 0, 0, width, height);
    drawVideoHUD("MIDI  |  MIDI INTEGRATION COMING SOON");
  }
}

function drawVideoHUD(label) {
  noStroke();
  fill(255);
  textAlign(LEFT, TOP);
  textFont(FONT);
  textSize(14);
  text(label, 20, 16);
}

// ─────────────────────────────────────────────────────────────
// Drawing helpers
// ─────────────────────────────────────────────────────────────
function drawGlowBackground() {
  background(6, 10, 18);
  const ctx  = drawingContext;
  const cx   = width  / 2;
  const cy   = height * 1.15;
  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, height * 1.1);
  grad.addColorStop(0,    "rgba(0, 110, 210, 0.70)");
  grad.addColorStop(0.35, "rgba(0,  60, 150, 0.35)");
  grad.addColorStop(0.65, "rgba(0,  20,  70, 0.12)");
  grad.addColorStop(1,    "rgba(0,   0,   0, 0.00)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);
}

function drawNeonButton(x, y, w, h, hovered, lines, subtitle) {
  noFill();
  if (hovered) { stroke(255); strokeWeight(3); }
  else         { stroke(NEON[0], NEON[1], NEON[2]); strokeWeight(2); }
  rect(x, y, w, h, h / 2);

  noStroke();
  textFont(FONT);
  textAlign(CENTER, CENTER);
  const cx = x + w / 2, cy = y + h / 2;

  if (subtitle !== undefined) {
    fill(255); textSize(20); text(lines[0], cx, cy - 9);
    fill(140, 190, 215); textSize(12); text(subtitle, cx, cy + 11);
  } else if (lines.length === 1) {
    fill(255); textSize(19); text(lines[0], cx, cy);
  } else {
    fill(255); textSize(17);
    text(lines[0], cx, cy - 11);
    text(lines[1], cx, cy + 11);
  }
}

// ─────────────────────────────────────────────────────────────
// Screen renderers
// ─────────────────────────────────────────────────────────────
function drawModeMenu() {
  drawGlowBackground();
  textFont(FONT); textAlign(CENTER, CENTER); noStroke();
  fill(NEON[0], NEON[1], NEON[2]); textSize(42);
  text("SELECT A MODE", width / 2, height * 0.16);
  for (const btn of getModeButtons()) {
    drawNeonButton(btn.x, btn.y, btn.w, btn.h, btn.id === hoveredModeId, btn.lines);
  }
}

function drawEditModeMenu() {
  drawGlowBackground();
  textFont(FONT); textAlign(CENTER, CENTER); noStroke();
  fill(NEON[0], NEON[1], NEON[2]); textSize(36);
  text("SELECT AN EDIT MODE", width / 2, height * 0.15);
  for (const btn of getEditModeButtons()) {
    drawNeonButton(btn.x, btn.y, btn.w, btn.h, btn.id === hoveredEditModeId, btn.lines);
  }
}

function drawVideosPage() {
  drawGlowBackground();
  textFont(FONT); textAlign(CENTER, CENTER); noStroke();
  fill(NEON[0], NEON[1], NEON[2]); textSize(52);
  text("VIDEOS", width / 2, height * 0.15);
  const boxes = getVideoButtons();
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i], v = VIDEO_LIBRARY[i];
    drawNeonButton(b.x, b.y, b.w, b.h, i === hoveredVideoIndex, [v.title], v.subtitle);
  }
}

function drawDebuggerInfo() {
  noStroke(); fill(255); textFont(FONT); textSize(13); textAlign(LEFT, TOP);
  for (let i = 0; i < window.fingerState.length; i++) {
    const h = window.fingerState[i];
    text(`Hand: ${h.type}  |  Fist: ${h.isFist}`, 16, 12 + i * 18);
  }
}

// ─────────────────────────────────────────────────────────────
// Fist check — requires ≥ 3 of 4 fingers curled
// (1 finger curled = pinch gesture → not a fist)
// ─────────────────────────────────────────────────────────────
function checkIfFist(lm) {
  const w = lm[0];
  const pairs = [[8,5],[12,9],[16,13],[20,17]];
  let curled = 0;
  for (const [t, b] of pairs) {
    const td = Math.hypot(lm[t].x - w.x, lm[t].y - w.y);
    const bd = Math.hypot(lm[b].x - w.x, lm[b].y - w.y);
    if (td < bd) curled++;
  }
  return curled >= 3;
}

// ─────────────────────────────────────────────────────────────
// Tracking cursor / overlay
// ─────────────────────────────────────────────────────────────
function drawTrackingOverlay() {
  const menuStates = ["MENU_VIEW", "EDIT_MODE_VIEW", "VIDEOS_PAGE"];

  // ── Menu navigation cursor ────────────────────────────────
  if (menuStates.includes(appState)) {
    const rh = getRightHand();
    if (!rh) return;
    if (rh.isFist) {
      noFill(); stroke(0, 180, 60); strokeWeight(2.5);
      ellipse(rh.wristScreen.x, rh.wristScreen.y, 28); noStroke();
    } else if (rh.isPinching) {
      noStroke(); fill(255, 220, 0);
      ellipse(rh.index.tipScreen.x, rh.index.tipScreen.y, 10);
    } else {
      noStroke(); fill(0, 255, 90);
      ellipse(rh.index.tipScreen.x, rh.index.tipScreen.y, 18);
    }
    return;
  }

  // ── Camera & video: rainbow landmark skeleton ─────────────
  if (appState === "CAMERA_VIEW" || appState === "VIDEO_VIEW") {
    colorMode(HSB, 21, 100, 100);
    noStroke();
    for (const lm of hands.landmarks) {
      for (let j = 0; j < lm.length; j++) {
        fill(j, 100, 100);
        ellipse(width - lm[j].x * width, lm[j].y * height,
                appState === "VIDEO_VIEW" ? 8 : 12);
      }
    }
    colorMode(RGB, 255);

    // ── Pinky+thumb visual hint for effect-bomb / color-grade
    if (appState === "VIDEO_VIEW" &&
        (selectedEditMode === "effect-bomb" || selectedEditMode === "color-grade")) {
      const lh = getLeftHand();
      if (lh) {
        const pk      = lh.pinky.tipScreen;
        const th      = lh.thumb.tipScreen;
        const active  = isPinkyThumbTouching(lh);
        // Connecting line
        stroke(active ? color(255, 220, 0) : color(200, 200, 200, 130));
        strokeWeight(active ? 3 : 1.5);
        line(pk.x, pk.y, th.x, th.y);
        // Endpoint dots
        noStroke();
        fill(active ? color(255, 220, 0) : color(200, 200, 200, 180));
        ellipse(pk.x, pk.y, active ? 14 : 9);
        ellipse(th.x, th.y, active ? 14 : 9);
        noFill(); noStroke();
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────
// Keyboard — spacebar goes back one level
// ─────────────────────────────────────────────────────────────
window.keyPressed = function () {
  if (key !== " ") return;
  const back = {
    CAMERA_VIEW:    () => setAppState("MENU_VIEW"),
    MENU_VIEW:      () => setAppState("CAMERA_VIEW"),
    EDIT_MODE_VIEW: () => setAppState("MENU_VIEW"),
    VIDEOS_PAGE:    () => setAppState("EDIT_MODE_VIEW"),
    VIDEO_VIEW:     () => { closeVideo(); setAppState("VIDEOS_PAGE"); },
  };
  back[appState]?.();
};

// ─────────────────────────────────────────────────────────────
// MediaPipe init
// ─────────────────────────────────────────────────────────────
const createHandLandmarker = async () => {
  try {
    const vision = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm"
    );
    handLandmarker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath:
          "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
        delegate: "GPU",
      },
      runningMode: "IMAGE",
      numHands: 2,
    });
    hideLoading();
  } catch (error) {
    const msg = document.getElementById("loading-message");
    if (msg) {
      msg.innerText = "ERROR: " + error.message;
      msg.style.color = "#ff4444";
      msg.style.textShadow = "none";
    }
  }
};

createHandLandmarker();
