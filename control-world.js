/**
 * control-world.js  v4
 *
 * Sub-modes:
 *   0 — IMAGE CONDUCTOR  (unchanged — images + video follow hands)
 *   1 — PORTAL           (camera filters + hand-framed portal window)
 *   2 — SIGNAL           (placeholder)
 *   3 — MANDALA          (procedural mandala generator)
 *
 * Uses window.getRightHand / window.getLeftHand / window.isPinkyThumbTouching
 * exported from colorful-track.js (ES module → window).
 */

(function () {
  "use strict";

  // ─────────────────────────────────────────────────────────────
  // Filter banks
  // ─────────────────────────────────────────────────────────────

  /** Full-screen camera filters — left fist cycles through these */
  const FULL_FILTERS = [
    { name: "NORMAL",        css: null },
    { name: "B&W",           css: "grayscale(1) contrast(1.5)" },
    { name: "HIGH CONTRAST", css: "contrast(5) brightness(0.7)" },
    { name: "REDNESS",       css: "sepia(1) saturate(10) hue-rotate(330deg) contrast(1.4)" },
    { name: "NEON",          css: "hue-rotate(100deg) saturate(8) contrast(1.9) brightness(1.1)" },
    { name: "VAPORWAVE",     css: "hue-rotate(220deg) saturate(5) brightness(1.3) contrast(1.3)" },
    { name: "INVERT",        css: "invert(1)" },
    { name: "COMIC",         css: "contrast(6) saturate(3.5) brightness(0.85)" },
    { name: "ICE COLD",      css: "hue-rotate(190deg) saturate(4) brightness(1.3) contrast(1.5)" },
    { name: "GOLD",          css: "sepia(1) saturate(5) brightness(1.15) contrast(1.2)" },
    { name: "PSYCHEDELIC",   css: "hue-rotate(180deg) saturate(12) contrast(2.2)" },
    { name: "PIXELS",        css: null, pixels: true },
  ];

  /** Inner portal-window filters — cycle automatically while portal is open */
  const PORTAL_FILTERS = [
    { name: "COMIC",       css: "contrast(7) saturate(4) brightness(0.8)" },
    { name: "THERMAL",     css: "grayscale(1) invert(1) sepia(1) saturate(8) hue-rotate(120deg) contrast(2)" },
    { name: "PSYCHEDELIC", css: "hue-rotate(180deg) saturate(14) contrast(2.5) brightness(1.2)" },
    { name: "NEON ACID",   css: "hue-rotate(80deg) saturate(12) contrast(2.2) brightness(1.3)" },
    { name: "VAPORWAVE",   css: "hue-rotate(230deg) saturate(8) brightness(1.4) contrast(1.8)" },
    { name: "X-RAY",       css: "grayscale(1) invert(1) contrast(3) brightness(1.4)" },
    { name: "INFERNO",     css: "sepia(1) saturate(12) hue-rotate(20deg) contrast(3) brightness(1.1)" },
    { name: "MATRIX",      css: "grayscale(1) sepia(1) saturate(6) hue-rotate(80deg) contrast(3)" },
  ];

  // ─────────────────────────────────────────────────────────────
  // Mandala Palettes (8 vivid themes mapped to APC 8x8 pad rows)
  // ─────────────────────────────────────────────────────────────
  const MANDALA_PALETTES = [
    {
      name: "SACRED GOLD",
      padColor: "#ffaa00",
      colors: [[255, 205, 40], [255, 140, 0], [45, 125, 255], [255, 245, 210], [15, 45, 110]],
      glow: [255, 195, 30],
    },
    {
      name: "CYBER VIOLET",
      padColor: "#aa00ff",
      colors: [[180, 50, 255], [0, 240, 255], [255, 40, 180], [110, 0, 255], [240, 210, 255]],
      glow: [180, 50, 255],
    },
    {
      name: "FRACTALLA FLAME",
      padColor: "#ff0066",
      colors: [[255, 0, 110], [0, 255, 200], [255, 110, 0], [160, 0, 255], [0, 220, 255]],
      glow: [255, 0, 128],
    },
    {
      name: "IRIDESCENT PRISM",
      padColor: "#00ffcc",
      colors: [[0, 255, 220], [120, 255, 60], [255, 0, 200], [0, 140, 255], [255, 230, 80]],
      glow: [0, 255, 200],
    },
    {
      name: "NEON ACID",
      padColor: "#88ff00",
      colors: [[180, 255, 0], [255, 230, 0], [255, 0, 128], [0, 255, 255], [255, 90, 0]],
      glow: [180, 255, 0],
    },
    {
      name: "INFRARED MAGMA",
      padColor: "#ff2200",
      colors: [[255, 30, 0], [255, 120, 0], [255, 220, 20], [180, 0, 50], [255, 255, 190]],
      glow: [255, 60, 0],
    },
    {
      name: "OPAL CANDY",
      padColor: "#ff88dd",
      colors: [[255, 150, 210], [120, 220, 255], [255, 230, 120], [180, 140, 255], [140, 255, 210]],
      glow: [255, 160, 220],
    },
    {
      name: "MATRIX JADE",
      padColor: "#00ff55",
      colors: [[0, 255, 100], [0, 200, 80], [120, 255, 180], [0, 110, 40], [0, 255, 230]],
      glow: [0, 255, 120],
    },
  ];

  const MANDALA_STYLES = [
    { id: "sacred",    name: "SACRED FRACTAL" },
    { id: "wireframe", name: "WIREFRAME MESH" },
    { id: "fractalla", name: "FRACTALLA FLAME" },
    { id: "stardust",  name: "KALEIDO STARDUST" },
  ];

  // ─────────────────────────────────────────────────────────────
  // State
  // ─────────────────────────────────────────────────────────────
  const CWState = {
    activeMode:        0,
    hoveredMenuBtn:    -1,
    menuCooldownUntil: 0,

    // ── Mode 0: Image Conductor ─────────────────────────────
    images:             [],
    videoEl:            null,
    videoEverReady:     false,
    currentImageIndex:  0,
    assetsLoaded:       false,

    elX: 480, elY: 270,
    targetX: 480, targetY: 270,
    elSize: 200,
    elRotation: 0,

    pixelateLevel: 0,
    pixPG: null,

    imageCooldownUntil: 0,

    // ── Mode 1: Portal ──────────────────────────────────────
    fullFilterIdx:       0,       // current full-screen filter
    portalFilterIdx:     0,       // current portal-window filter
    portalFilterTime:    0,       // auto-cycle timer
    fullFistCooldown:    0,       // left fist debounce
    portalGlowPhase:     0,       // portal outline glow animation
    pixelCanvas:         null,    // offscreen canvas for PIXELS filter
    pixelCtx:            null,

    // ── Mode 2: Draw ─────────────────────────────────────────
    drawStrokes:          [],      // completed strokes
    drawCurrentStroke:    [],      // stroke in progress
    drawCircles:          [],      // completed circle pixel portals
    drawParticles:        [],      // sparks from fingertip
    drawLastPoint:        null,
    drawClearCooldown:    0,
    drawClearNoticeUntil: 0,

    // ── Mode 3: Mandala (APC Mini Mk2 MIDI driven) ───────────
    mandalaStyle:        0,       // 0..3 (4 distinct procedural styles)
    mandalaPalette:      0,       // 0..7 (8 vibrant color palettes)
    mandalaAngle:        0,
    mandalaTime:         0,
    mandalaPulse:        0,       // transient ripple when pad pressed
    mandalaFlashPad:     -1,
    mandalaGrainToggled: false,
    mandalaPixelToggled: false,
    mandalaInvertToggled: false,
    grainCanvas:         null,
    grainCtx:            null,
    grainImgData:        null,
    mandalaPixPG:        null,
  };

  // ─────────────────────────────────────────────────────────────
  // MIDI Event Listeners for Mandala
  // ─────────────────────────────────────────────────────────────
  window.addEventListener("midiPad", (e) => {
    if (CWState.activeMode !== 3) return;
    const { location, pressed } = e.detail;
    if (pressed) {
      // Row (0..7) sets color palette
      const row = Math.floor(location / 8);
      CWState.mandalaPalette = row % MANDALA_PALETTES.length;
      CWState.mandalaPulse = 1.0;
      CWState.mandalaFlashPad = location;
      setTimeout(() => {
        if (CWState.mandalaFlashPad === location) CWState.mandalaFlashPad = -1;
      }, 160);
      _sendMandalaPadLeds();
    }
  });

  window.addEventListener("midiVertical", (e) => {
    if (CWState.activeMode !== 3) return;
    const { location, pressed } = e.detail;
    if (pressed) {
      // Scene buttons 0-7 cycle/pick style
      CWState.mandalaStyle = location % MANDALA_STYLES.length;
    }
  });

  window.addEventListener("midiHorizontal", (e) => {
    if (CWState.activeMode !== 3) return;
    const { location, pressed } = e.detail;
    if (pressed) {
      if (location === 0) CWState.mandalaStyle = (CWState.mandalaStyle + 1) % MANDALA_STYLES.length;
      if (location === 5) CWState.mandalaGrainToggled = !CWState.mandalaGrainToggled;
      if (location === 6) CWState.mandalaPixelToggled = !CWState.mandalaPixelToggled;
      if (location === 7) CWState.mandalaInvertToggled = !CWState.mandalaInvertToggled;
    }
  });

  const SUB_MODES = [
    { id: "image",   icon: "\u25CE", label: "IMAGE" },
    { id: "portal",  icon: "\u25C8", label: "PORTAL" },
    { id: "draw",    icon: "\u270E", label: "DRAW" },
    { id: "mandala", icon: "\u2726", label: "MANDALA" },
  ];

  const TOTAL_ELEMENTS = 8;
  const PORTAL_CYCLE_MS  = 3000; // auto-cycle portal filter every 3 s

  // ─────────────────────────────────────────────────────────────
  // Init
  // ─────────────────────────────────────────────────────────────
  function init() {
    // Grace period — prevent sub-mode menu from firing the instant we enter this view
    CWState.menuCooldownUntil = millis() + 1500;

    // Always start on IMAGE mode — never inherit previous sub-mode
    CWState.activeMode = 0;

    CWState.elX           = width  / 2;
    CWState.elY           = height / 2;
    CWState.targetX       = width  / 2;
    CWState.targetY       = height / 2;
    CWState.elSize        = 200;
    CWState.elRotation    = 0;
    CWState.pixelateLevel = 0;

    if (!CWState.pixPG) CWState.pixPG = createGraphics(1, 1);

    // Pixel-filter offscreen canvas
    if (!CWState.pixelCanvas) {
      CWState.pixelCanvas        = document.createElement("canvas");
      CWState.pixelCanvas.width  = 96;
      CWState.pixelCanvas.height = 54;
      CWState.pixelCtx           = CWState.pixelCanvas.getContext("2d");
    }

    if (!CWState.assetsLoaded) _loadAssets();
    else if (CWState.videoEl) {
      try { CWState.videoEl.loop(); } catch (_) {}
    }
  }

  function _loadAssets() {
    CWState.assetsLoaded = true;
    try {
      CWState.videoEl = createVideo("images/image1.mp4");
      CWState.videoEl.hide();
      CWState.videoEl.volume(0);
      CWState.videoEl.loop();
      CWState.videoEl.elt.addEventListener("canplay",    function () { CWState.videoEverReady = true; });
      CWState.videoEl.elt.addEventListener("loadeddata", function () { CWState.videoEverReady = true; });
      setTimeout(function () {
        if (CWState.videoEl && CWState.videoEl.elt.readyState >= 2) CWState.videoEverReady = true;
      }, 1200);
    } catch (e) { console.warn("[CW] Video:", e); }

    CWState.images = new Array(7).fill(null);
    for (let i = 2; i <= 8; i++) {
      const idx = i - 2;
      loadImage("images/image" + i + ".png",
        function (img) { CWState.images[idx] = img; },
        function ()    { console.warn("[CW] image" + (idx+2) + ".png missing"); }
      );
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Main draw
  // ─────────────────────────────────────────────────────────────
  function draw(capture) {
    try {
      if (CWState.activeMode === 3) {
        // Blackened cosmic void for Mandala mode (no camera background)
        background(4, 5, 8);
        const pal = MANDALA_PALETTES[CWState.mandalaPalette % MANDALA_PALETTES.length];
        const g = pal.glow;
        noStroke();
        fill(g[0], g[1], g[2], 12);
        ellipse(width / 2, height / 2, 620, 620);
      } else if (CWState.activeMode === 2) {
        // Clean live camera feed for DRAW mode (mirrored horizontally)
        if (!capture || !capture.elt || capture.elt.readyState < 2) {
          background(8, 12, 22);
        } else {
          push();
          translate(width, 0);
          scale(-1, 1);
          image(capture, 0, 0, width, height);
          pop();
        }
      } else {
        _drawBlurredCamera(capture);
        noStroke(); fill(0, 0, 0, 90); rect(0, 0, width, height);
      }

      const rh = window.getRightHand ? window.getRightHand() : null;
      const lh = window.getLeftHand  ? window.getLeftHand()  : null;

      switch (CWState.activeMode) {
        case 0: _drawImageMode(rh, lh);          break;
        case 1: _drawPortalMode(rh, lh, capture); break;
        case 2: _drawDrawMode(rh, lh, capture);   break;
        case 3: _drawMandalaMode();               break;
      }

      // Always draw left sub-mode menu on top so it is visible in every mode
      _drawLeftMenu();

      noStroke(); fill(110, 150, 185);
      textFont("Besport"); textSize(8);
      textAlign(CENTER, CENTER);
      if (CWState.activeMode === 1 || CWState.activeMode === 2 || CWState.activeMode === 3) {
        text("SPACEBAR  \u2192  MAIN MENU", width / 2, height - 14);
      } else {
        text("RIGHT FIST  or  SPACEBAR  \u2192  MAIN MENU", width / 2, height - 14);
      }

    } catch (err) {
      console.error("[CW ERR]:", err);
      drawingContext.filter = "none";
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Blurred camera background (all modes)
  // ─────────────────────────────────────────────────────────────
  function _drawBlurredCamera(capture) {
    if (!capture || !capture.elt || capture.elt.readyState < 2) {
      background(8, 12, 22); return;
    }
    try {
      drawingContext.filter = "blur(10px) brightness(0.32)";
      push(); translate(width, 0); scale(-1, 1);
      image(capture, 0, 0, width, height);
      pop();
    } catch (_) {}
    drawingContext.filter = "none";
  }

  // ─────────────────────────────────────────────────────────────
  // Left menu layout (shared by draw + mouse hit-test)
  // ─────────────────────────────────────────────────────────────
  const MENU_LAYOUT = { menuX: 14, btnW: 105, btnH: 38, gap: 8 };

  function _leftMenuButtonRect(i) {
    const { menuX, btnW, btnH, gap } = MENU_LAYOUT;
    const totalH = SUB_MODES.length * (btnH + gap) - gap;
    const startY = height / 2 - totalH / 2;
    return { x: menuX, y: startY + i * (btnH + gap), w: btnW, h: btnH };
  }

  // ─────────────────────────────────────────────────────────────
  // Left sub-mode menu
  // ─────────────────────────────────────────────────────────────
  function _drawLeftMenu() {
    const { btnW, btnH } = MENU_LAYOUT;

    CWState.hoveredMenuBtn = -1;
    textFont("Besport");

    for (let i = 0; i < SUB_MODES.length; i++) {
      const m  = SUB_MODES[i];
      const { x: bx, y: by } = _leftMenuButtonRect(i);
      const isActive = CWState.activeMode === i;
      const isMouseHov = mouseX >= bx && mouseX <= bx + btnW &&
                         mouseY >= by && mouseY <= by + btnH;
      if (isMouseHov) CWState.hoveredMenuBtn = i;

      // Solid, high-contrast background so buttons are visible across all filters
      if (isActive) {
        stroke(0, 230, 255); strokeWeight(2); fill(0, 45, 65, 235);
      } else if (isMouseHov) {
        stroke(255, 255, 255, 220); strokeWeight(1.5); fill(25, 42, 60, 235);
      } else {
        stroke(70, 120, 160, 140); strokeWeight(1); fill(8, 16, 28, 225);
      }
      rect(bx, by, btnW, btnH, 7);

      noStroke();
      fill(isActive ? color(0, 230, 255) : isMouseHov ? 255 : color(180, 205, 225));
      textAlign(LEFT, CENTER); textSize(10);
      text(m.icon + "  " + m.label, bx + 10, by + btnH / 2);
    }
  }

  // ─────────────────────────────────────────────────────────────
  // MODE 0 — IMAGE CONDUCTOR (unchanged)
  // ─────────────────────────────────────────────────────────────
  function _drawImageMode(rh, lh) {
    if (rh && !rh.isFist) {
      CWState.targetX = rh.index.tipScreen.x;
      CWState.targetY = rh.index.tipScreen.y;
    }
    CWState.elX += (CWState.targetX - CWState.elX) * 0.12;
    CWState.elY += (CWState.targetY - CWState.elY) * 0.12;

    if (lh && !lh.isFist) {
      const pd = Math.hypot(
        lh.index.tipScreen.x - lh.thumb.tipScreen.x,
        lh.index.tipScreen.y - lh.thumb.tipScreen.y
      );
      CWState.elSize = Math.min(500, Math.max(60, _map(pd, 15, 130, 70, 460)));
    }

    if (lh && lh.isFist) CWState.pixelateLevel = Math.min(CWState.pixelateLevel + 0.7, 32);
    else                  CWState.pixelateLevel = Math.max(CWState.pixelateLevel - 1.4, 0);

    CWState.elRotation += 0.004;

    const blockSize = Math.round(CWState.pixelateLevel);
    const s = CWState.elSize, ex = CWState.elX, ey = CWState.elY;
    const idx = CWState.currentImageIndex;

    blendMode(SCREEN);
    push(); translate(ex, ey); rotate(CWState.elRotation); imageMode(CENTER);
    if (idx === 0) {
      if (CWState.videoEl && CWState.videoEverReady) {
        if (blockSize > 1) _drawPixelated_p5(CWState.videoEl, s, blockSize);
        else               image(CWState.videoEl, 0, 0, s, s);
      }
    } else {
      const img = CWState.images[idx - 1];
      if (img) {
        if (blockSize > 1) _drawPixelated_p5(img, s, blockSize);
        else               image(img, 0, 0, s, s);
      }
    }
    pop();
    blendMode(BLEND);

    _drawImageHUD(blockSize);
  }

  function _drawPixelated_p5(src, s, blockSize) {
    const tiny = Math.max(4, Math.floor(s / blockSize));
    const pg   = CWState.pixPG;
    if (!pg) return;
    if (pg.width !== tiny || pg.height !== tiny) pg.resizeCanvas(tiny, tiny);
    pg.clear(); pg.imageMode(CENTER);
    pg.image(src, tiny / 2, tiny / 2, tiny, tiny);
    noSmooth(); image(pg, 0, 0, s, s); smooth();
  }

  function _drawImageHUD(blockSize) {
    textFont("Besport"); noStroke();
    fill(0,230,255); textSize(15); textAlign(LEFT,TOP);
    text("IMAGE CONDUCTOR", 162, 16);
    fill(150,195,230); textSize(8.5);
    text("[ "+(CWState.currentImageIndex+1)+" / "+TOTAL_ELEMENTS+" ]   SIZE: "+
         Math.round(CWState.elSize)+"px"+(blockSize>1?"   PIX: "+blockSize+"px":""), 162, 35);

    const hx = width-226, hy = height-118;
    stroke(0,230,255,45); strokeWeight(1); fill(6,14,26,195); rect(hx,hy,206,100,7);
    noStroke(); fill(0,230,255); textSize(8.5); textAlign(LEFT,TOP);
    text("RIGHT HAND",                            hx+12, hy+11);
    fill(190); text("\u21AA  Move  \u2192  element follows",  hx+12, hy+23);
    fill(0,230,255); text("LEFT HAND",             hx+12, hy+40);
    fill(190);
    text("\u21AA  Pinch dist  \u2192  scale",         hx+12, hy+52);
    text("\u21AA  Pinky+Thumb  \u2192  next image",    hx+12, hy+64);
    text("\u21AA  Fist  \u2192  pixelate  ["+(blockSize>0?blockSize+"px":"OFF")+"]", hx+12, hy+76);
  }

  // ─────────────────────────────────────────────────────────────
  // MODE 1 — PORTAL
  // ─────────────────────────────────────────────────────────────
  function _drawPortalMode(rh, lh, capture) {
    const now = millis();
    CWState.portalGlowPhase += 0.07;

    // ── LEFT FIST → cycle full-screen filter ─────────────────
    if (lh && lh.isFist && now > CWState.fullFistCooldown) {
      CWState.fullFilterIdx  = (CWState.fullFilterIdx + 1) % FULL_FILTERS.length;
      CWState.fullFistCooldown = now + 850;
    }

    const fullF = FULL_FILTERS[CWState.fullFilterIdx];

    // ── Draw full-screen camera with active filter ────────────
    if (!capture || !capture.elt || capture.elt.readyState < 2) {
      background(8, 12, 22);
    } else {
      if (fullF.pixels) {
        _drawPixelatedCamera(capture);
      } else {
        drawingContext.filter = fullF.css || "none";
        drawingContext.save();
        drawingContext.translate(width, 0);
        drawingContext.scale(-1, 1);
        drawingContext.drawImage(capture.elt, 0, 0, width, height);
        drawingContext.restore();
        drawingContext.filter = "none";
      }
    }

    // ── Detect portal: both hands visible and neither is a fist ──
    const portalOpen = rh && !rh.isFist && lh && !lh.isFist;

    if (portalOpen && capture && capture.elt && capture.elt.readyState >= 2) {
      // Auto-cycle portal filter every PORTAL_CYCLE_MS
      if (now - CWState.portalFilterTime > PORTAL_CYCLE_MS) {
        CWState.portalFilterIdx  = (CWState.portalFilterIdx + 1) % PORTAL_FILTERS.length;
        CWState.portalFilterTime = now;
      }

      // 4 corners: left-index → right-index → right-thumb → left-thumb (clockwise)
      const li = lh.index.tipScreen;
      const lt = lh.thumb.tipScreen;
      const ri = rh.index.tipScreen;
      const rt = rh.thumb.tipScreen;
      const corners = [li, ri, rt, lt];

      // ── Clip to quad and draw portal filter inside ────────
      const portalF = PORTAL_FILTERS[CWState.portalFilterIdx];

      drawingContext.save();
      drawingContext.beginPath();
      drawingContext.moveTo(corners[0].x, corners[0].y);
      for (let i = 1; i < corners.length; i++) {
        drawingContext.lineTo(corners[i].x, corners[i].y);
      }
      drawingContext.closePath();
      drawingContext.clip();

      drawingContext.filter = portalF.css;
      drawingContext.save();
      drawingContext.translate(width, 0);
      drawingContext.scale(-1, 1);
      drawingContext.drawImage(capture.elt, 0, 0, width, height);
      drawingContext.restore();
      drawingContext.filter = "none";

      drawingContext.restore(); // end clip

      // ── Thin single outline — no glow passes ─────────────
      noFill();
      stroke(0, 220, 255, 190);
      strokeWeight(1.2);
      beginShape();
      for (const c of corners) vertex(c.x, c.y);
      endShape(CLOSE);

      // Tiny corner dots (4 px)
      noStroke();
      fill(0, 220, 255, 220);
      for (const c of corners) {
        ellipse(c.x, c.y, 4, 4);
      }

      // Filter name in center
      const midX = (li.x + ri.x + rt.x + lt.x) / 4;
      const midY = (li.y + ri.y + rt.y + lt.y) / 4;
      textFont("Besport"); noStroke();
      fill(0, 220, 255, 200);
      textSize(8.5); textAlign(CENTER, CENTER);
      text(portalF.name, midX, midY);
    }

    // ── HUD ──────────────────────────────────────────────────
    _drawPortalHUD(fullF.name, portalOpen);
  }

  /** Draw camera pixelated (for PIXELS full filter) */
  function _drawPixelatedCamera(capture) {
    const pc   = CWState.pixelCanvas;
    const pCtx = CWState.pixelCtx;
    if (!pc || !pCtx) return;
    pCtx.clearRect(0, 0, 96, 54);
    pCtx.save();
    pCtx.translate(96, 0); pCtx.scale(-1, 1);
    pCtx.drawImage(capture.elt, 0, 0, 96, 54);
    pCtx.restore();
    drawingContext.imageSmoothingEnabled = false;
    drawingContext.drawImage(pc, 0, 0, width, height);
    drawingContext.imageSmoothingEnabled = true;
  }

  function _drawPortalHUD(filterName, portalOpen) {
    textFont("Besport"); noStroke();

    // Title
    fill(0, 230, 255); textSize(13); textAlign(LEFT, TOP);
    text("PORTAL", 162, 16);

    // Active filter badge
    stroke(0, 230, 255, 70); strokeWeight(1);
    fill(0, 20, 35, 200);
    rect(162, 33, 120, 16, 3);
    noStroke(); fill(0, 230, 255); textSize(7.5); textAlign(LEFT, TOP);
    text("FILTER: " + filterName, 167, 37);

    // Gesture hints panel — compact, wide enough to fit text
    const hx = width - 218, hy = height - 112;
    stroke(0, 230, 255, 40); strokeWeight(1);
    fill(6, 14, 26, 195);
    rect(hx, hy, 196, 95, 6);

    noStroke(); textSize(7); textAlign(LEFT, TOP);
    fill(0, 230, 255);
    text("LEFT HAND",                   hx+9, hy+9);
    fill(165);
    text("\u21AA Fist \u2192 cycle filter",      hx+9, hy+19);

    fill(0, 230, 255);
    text("BOTH HANDS (open)",           hx+9, hy+34);
    fill(165);
    text("\u21AA portal follows fingers",   hx+9, hy+44);
    text("\u21AA filter changes every 3s",  hx+9, hy+54);

    if (portalOpen) {
      fill(0, 255, 140, 210); textSize(7);
      text("\u2726 PORTAL ACTIVE", hx+9, hy+70);
    } else {
      fill(100, 135, 165); textSize(7);
      text("open both hands to activate", hx+9, hy+70);
    }

  }

  // ─────────────────────────────────────────────────────────────
  // MODE 3 — MANDALA ENGINE (Akai APC Mini Mk2 MIDI Controlled)
  // ─────────────────────────────────────────────────────────────
  function _drawMandalaMode() {
    const midi = window.midiState;
    const s = midi?.sliders || [48, 64, 64, 40, 64, 0, 0, 0, 100];

    // ── Sliders Mapping ──────────────────────────────────────
    // S0: Segments / Symmetry (4 to 32)
    const segs = Math.round(_map(s[0] !== undefined ? s[0] : 48, 0, 127, 4, 32));

    // S1: Spin Speed & Direction (center = 64, <64 reverse, >64 forward)
    const spinRaw = s[1] !== undefined ? s[1] : 64;
    const spinRate = _map(spinRaw, 0, 127, -2.4, 2.4);

    // S2: Zoom / Scale (0.45x to 2.2x)
    const zoom = _map(s[2] !== undefined ? s[2] : 64, 0, 127, 0.45, 2.2);

    // S3: Wave / Morph Harmonics (1 to 8)
    const waveHarmonic = Math.round(_map(s[3] !== undefined ? s[3] : 40, 0, 127, 1, 8));

    // S4: Geometric Depth / Layers (3 to 9)
    const depthLayers = Math.round(_map(s[4] !== undefined ? s[4] : 64, 0, 127, 3, 9));

    // S5: Grain / TouchDesigner Noise Texture (0 to 100%)
    let grain = (s[5] || 0) / 127;
    if (CWState.mandalaGrainToggled) grain = Math.max(grain, 0.55);

    // S6: Pixelation Block Size (0 to 36px)
    let pixelSize = Math.round(_map(s[6] || 0, 0, 127, 0, 36));
    if (CWState.mandalaPixelToggled) pixelSize = Math.max(pixelSize, 18);

    // S7: Color Invert / Psychedelic Mode
    const inverted = CWState.mandalaInvertToggled || (s[7] > 64);

    // S8: Master Glow & Energy Intensity (0.25 to 1.3)
    const glowEnergy = _map(s[8] !== undefined ? s[8] : 100, 0, 127, 0.25, 1.3);

    // ── Continuous Motion & Rotation ─────────────────────────
    CWState.mandalaTime += 0.016;
    CWState.mandalaAngle += (spinRate === 0 ? 0.005 : spinRate * 0.015);

    if (CWState.mandalaPulse > 0.01) {
      CWState.mandalaPulse *= 0.92;
    } else {
      CWState.mandalaPulse = 0;
    }

    const cx = width / 2;
    const cy = height / 2;
    const pal = MANDALA_PALETTES[CWState.mandalaPalette % MANDALA_PALETTES.length];
    const t = CWState.mandalaTime;
    const pulse = CWState.mandalaPulse;

    // Apply Invert Filter if active
    if (inverted) {
      drawingContext.filter = "invert(1) hue-rotate(180deg) contrast(1.15)";
    }

    // ── Render Active Mandala Architecture ───────────────────
    push();
    translate(cx, cy);
    rotate(CWState.mandalaAngle);

    switch (CWState.mandalaStyle % MANDALA_STYLES.length) {
      case 0:
        _renderSacredFractal(segs, zoom, waveHarmonic, depthLayers, pal, t, pulse, glowEnergy);
        break;
      case 1:
        _renderWireframeMesh(segs, zoom, waveHarmonic, depthLayers, pal, t, pulse, glowEnergy);
        break;
      case 2:
        _renderFractallaFlame(segs, zoom, waveHarmonic, depthLayers, pal, t, pulse, glowEnergy);
        break;
      case 3:
        _renderKaleidoStardust(segs, zoom, waveHarmonic, depthLayers, pal, t, pulse, glowEnergy);
        break;
    }
    pop();

    // Grain texture overlay
    if (grain > 0.04) {
      _drawGrain(grain);
    }

    // Pixelation effect
    if (pixelSize > 1) {
      _applyMandalaPixelation(pixelSize);
    }

    drawingContext.filter = "none";

    // ── HUD Properties Menu (down right edge) ───────────────
    _drawMandalaHUD({
      styleName: MANDALA_STYLES[CWState.mandalaStyle % MANDALA_STYLES.length].name,
      paletteName: pal.name,
      paletteGlow: pal.glow,
      segments: segs,
      zoom: zoom,
      spinRate: spinRate,
      waveHarmonic: waveHarmonic,
      depthLayers: depthLayers,
      grain: grain,
      pixelSize: pixelSize,
      inverted: inverted,
      glowEnergy: glowEnergy,
    });

    // ── Update APC Mini Mk2 Pad LEDs ────────────────────────
    _sendMandalaPadLeds();
  }

  // ─────────────────────────────────────────────────────────────
  // Style 0: SACRED FRACTAL (Cosmic Rosette with Lace & Pearls)
  // ─────────────────────────────────────────────────────────────
  function _renderSacredFractal(segs, zoom, waveHarmonic, depthLayers, pal, t, pulse, glowEnergy) {
    const cols = pal.colors;
    for (let layer = 0; layer < depthLayers; layer++) {
      const c = cols[layer % cols.length];
      const r = (38 + layer * 28) * zoom * (1.0 + pulse * 0.12);
      const alpha = _map(layer, 0, depthLayers - 1, 230, 70) * glowEnergy;
      const stepT = t * (layer % 2 === 0 ? 1 : -1) * 0.8;

      for (let s = 0; s < segs; s++) {
        push();
        rotate((TWO_PI / segs) * s);
        for (let flip = 0; flip < 2; flip++) {
          push();
          if (flip === 1) scale(1, -1);
          noFill();
          stroke(c[0], c[1], c[2], alpha);
          strokeWeight(Math.max(0.4, 2.0 - layer * 0.2));

          beginShape();
          for (let a = 0; a <= TWO_PI / 2; a += 0.07) {
            const mod = 0.5 + 0.5 * Math.sin(a * waveHarmonic + stepT);
            const rad = r * (0.6 + 0.4 * mod);
            curveVertex(Math.cos(a) * rad, Math.sin(a) * rad);
          }
          endShape();

          // Golden/sapphire pearls
          const da = (TWO_PI / segs) * 0.35;
          fill(c[0], c[1], c[2], alpha * 0.7);
          noStroke();
          ellipse(Math.cos(da) * r * 0.9, Math.sin(da) * r * 0.9, 3.5, 3.5);
          pop();
        }
        pop();
      }

      noFill();
      stroke(c[0], c[1], c[2], alpha * 0.3);
      strokeWeight(0.7);
      ellipse(0, 0, r * 1.8, r * 1.8);
    }

    // Glowing Central Sacred Jewel
    const jc = cols[0];
    for (let r = 36 * zoom; r > 0; r -= 4) {
      fill(jc[0], jc[1], jc[2], _map(r, 0, 36 * zoom, 255, 0) * glowEnergy);
      noStroke();
      ellipse(0, 0, r * 2, r * 2);
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Style 1: WIREFRAME MESH (3D Ribbed Bio-Anemone like Image 2)
  // ─────────────────────────────────────────────────────────────
  function _renderWireframeMesh(segs, zoom, waveHarmonic, depthLayers, pal, t, pulse, glowEnergy) {
    const cols = pal.colors;
    const ribCount = depthLayers * 4;
    const maxR = (130 + depthLayers * 15) * zoom * (1.0 + pulse * 0.15);

    for (let s = 0; s < segs; s++) {
      push();
      rotate((TWO_PI / segs) * s);

      const c = cols[s % cols.length];
      const alpha = 180 * glowEnergy;

      noFill();
      stroke(c[0], c[1], c[2], alpha);
      strokeWeight(0.9);

      // Outer rib spine
      beginShape();
      for (let i = 0; i <= ribCount; i++) {
        const frac = i / ribCount;
        const rad = frac * maxR;
        const widthWave = Math.sin(frac * Math.PI * (waveHarmonic + 1) + t * 2) * (14 * zoom);
        vertex(rad, widthWave);
      }
      endShape();

      // Inner rib spine
      beginShape();
      for (let i = 0; i <= ribCount; i++) {
        const frac = i / ribCount;
        const rad = frac * maxR;
        const widthWave = -Math.sin(frac * Math.PI * (waveHarmonic + 1) + t * 2) * (14 * zoom);
        vertex(rad, widthWave);
      }
      endShape();

      // Connecting cross-struts (latitudes)
      stroke(c[0], c[1], c[2], alpha * 0.45);
      strokeWeight(0.5);
      for (let i = 2; i <= ribCount; i += 2) {
        const frac = i / ribCount;
        const rad = frac * maxR;
        const widthWave = Math.sin(frac * Math.PI * (waveHarmonic + 1) + t * 2) * (14 * zoom);
        line(rad, widthWave, rad, -widthWave);
      }
      pop();
    }

    // Concentric wireframe orbital rings
    for (let j = 1; j <= 6; j++) {
      const c = cols[j % cols.length];
      const ringR = (j / 6) * maxR;
      noFill();
      stroke(c[0], c[1], c[2], 90 * glowEnergy);
      strokeWeight(0.7);
      ellipse(0, 0, ringR * 2, ringR * 2);
    }

    // Glowing Core Sphere
    const coreC = cols[0];
    for (let r = 40 * zoom; r > 0; r -= 3) {
      fill(coreC[0], coreC[1], coreC[2], _map(r, 0, 40 * zoom, 240, 0) * glowEnergy);
      noStroke();
      ellipse(0, 0, r * 2, r * 2);
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Style 2: FRACTALLA FLAME (Layered Flame Petals like Image 3)
  // ─────────────────────────────────────────────────────────────
  function _renderFractallaFlame(segs, zoom, waveHarmonic, depthLayers, pal, t, pulse, glowEnergy) {
    const cols = pal.colors;

    for (let layer = depthLayers - 1; layer >= 0; layer--) {
      const c = cols[layer % cols.length];
      const nextC = cols[(layer + 1) % cols.length];
      const r = (45 + layer * 26) * zoom * (1.0 + pulse * 0.15);
      const alpha = _map(layer, 0, depthLayers - 1, 220, 50) * glowEnergy;
      const dir = (layer % 2 === 0 ? 1 : -1);

      push();
      rotate(t * 0.3 * dir);

      for (let s = 0; s < segs; s++) {
        push();
        rotate((TWO_PI / segs) * s);

        fill(c[0], c[1], c[2], alpha * 0.4);
        stroke(nextC[0], nextC[1], nextC[2], alpha);
        strokeWeight(1.2);

        beginShape();
        vertex(0, 0);
        for (let a = -0.3; a <= 0.3; a += 0.05) {
          const flameOsc = Math.sin(a * waveHarmonic * 3 + t * 2.5);
          const rad = r * (0.8 + 0.25 * flameOsc);
          const px = Math.cos(a) * rad;
          const py = Math.sin(a) * rad;
          curveVertex(px, py);
        }
        vertex(0, 0);
        endShape(CLOSE);

        fill(255, 255, 255, alpha * 0.8);
        noStroke();
        ellipse(r * 1.03, 0, 4.5, 4.5);
        pop();
      }
      pop();
    }

    // Pulsing central flame rosette
    const fc = cols[1];
    for (let r = 30 * zoom; r > 0; r -= 4) {
      fill(fc[0], fc[1], fc[2], _map(r, 0, 30 * zoom, 255, 0) * glowEnergy);
      noStroke();
      ellipse(0, 0, r * 2, r * 2);
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Style 3: KALEIDO STARDUST (Crystalline Prism + Point Cloud)
  // ─────────────────────────────────────────────────────────────
  function _renderKaleidoStardust(segs, zoom, waveHarmonic, depthLayers, pal, t, pulse, glowEnergy) {
    const cols = pal.colors;
    const maxR = (120 + depthLayers * 16) * zoom * (1.0 + pulse * 0.15);

    // Sharp diamond crystal facets
    for (let s = 0; s < segs; s++) {
      push();
      rotate((TWO_PI / segs) * s);
      const c = cols[s % cols.length];
      const alpha = 175 * glowEnergy;

      for (let layer = 0; layer < depthLayers; layer++) {
        const r1 = (30 + layer * 22) * zoom;
        const r2 = r1 + 18 * zoom;
        const w = (10 + layer * 3) * zoom;

        noFill();
        stroke(c[0], c[1], c[2], alpha * 0.8);
        strokeWeight(1.0);
        quad(r1, 0, (r1 + r2) / 2, w, r2, 0, (r1 + r2) / 2, -w);

        fill(c[0], c[1], c[2], alpha * 0.15);
        quad(r1, 0, (r1 + r2) / 2, w * 0.5, r2, 0, (r1 + r2) / 2, -w * 0.5);
      }
      pop();
    }

    // Orbiting Stardust Cloud
    noStroke();
    const pCount = 96;
    for (let i = 0; i < pCount; i++) {
      const pColor = cols[i % cols.length];
      const ang = (TWO_PI / pCount) * i * (segs * 0.5) + t * (0.5 + (i % 3) * 0.2);
      const baseDist = (40 + (i * 19) % (maxR - 40));
      const dist = baseDist + Math.sin(t * 3 + i) * 12;
      const sz = 2.0 + Math.sin(t * 5 + i * 2) * 1.5;

      fill(pColor[0], pColor[1], pColor[2], 200 * glowEnergy);
      ellipse(Math.cos(ang) * dist, Math.sin(ang) * dist, sz, sz);
    }

    // Central prism jewel
    const jc = cols[0];
    for (let r = 32 * zoom; r > 0; r -= 4) {
      fill(jc[0], jc[1], jc[2], _map(r, 0, 32 * zoom, 255, 0) * glowEnergy);
      ellipse(0, 0, r * 2, r * 2);
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Grain / Noise Overlay (TouchDesigner Style)
  // ─────────────────────────────────────────────────────────────
  function _drawGrain(grainAmount) {
    if (grainAmount < 0.04) return;
    if (!CWState.grainCanvas) {
      CWState.grainCanvas = document.createElement("canvas");
      CWState.grainCanvas.width = 160;
      CWState.grainCanvas.height = 90;
      CWState.grainCtx = CWState.grainCanvas.getContext("2d");
      CWState.grainImgData = CWState.grainCtx.createImageData(160, 90);
    }
    const data = CWState.grainImgData.data;
    const buf = new Uint32Array(data.buffer);
    for (let i = 0; i < buf.length; i++) {
      const v = (Math.random() * 255) | 0;
      buf[i] = (220 << 24) | (v << 16) | (v << 8) | v;
    }
    CWState.grainCtx.putImageData(CWState.grainImgData, 0, 0);

    const ctx = drawingContext;
    ctx.save();
    ctx.globalCompositeOperation = "overlay";
    ctx.globalAlpha = Math.min(0.65, grainAmount * 0.7);
    ctx.drawImage(CWState.grainCanvas, 0, 0, width, height);
    ctx.restore();
  }

  // ─────────────────────────────────────────────────────────────
  // Pixelation Effect for Mandala
  // ─────────────────────────────────────────────────────────────
  function _applyMandalaPixelation(pixelSize) {
    if (pixelSize <= 1) return;
    const pw = Math.max(8, Math.floor(width / pixelSize));
    const ph = Math.max(6, Math.floor(height / pixelSize));
    if (!CWState.mandalaPixPG) {
      CWState.mandalaPixPG = createGraphics(pw, ph);
    }
    if (CWState.mandalaPixPG.width !== pw || CWState.mandalaPixPG.height !== ph) {
      CWState.mandalaPixPG.resizeCanvas(pw, ph);
    }
    CWState.mandalaPixPG.drawingContext.drawImage(drawingContext.canvas, 0, 0, pw, ph);
    drawingContext.imageSmoothingEnabled = false;
    drawingContext.drawImage(CWState.mandalaPixPG.canvas, 0, 0, width, height);
    drawingContext.imageSmoothingEnabled = true;
  }

  // ─────────────────────────────────────────────────────────────
  // Mandala HUD Properties Menu (Down Right Edge)
  // ─────────────────────────────────────────────────────────────
  function _drawMandalaHUD(p) {
    textFont("Besport");
    const hx = width - 225, hy = height - 135;

    stroke(0, 230, 255, 50); strokeWeight(1);
    fill(6, 14, 24, 215);
    rect(hx, hy, 205, 115, 7);

    noStroke();
    fill(0, 230, 255); textSize(8.5); textAlign(LEFT, TOP);
    text("MANDALA [APC MIDI MK2]", hx + 10, hy + 9);

    // Style & Palette (Clickable)
    fill(255); textSize(7.5);
    text("STYLE: " + p.styleName, hx + 10, hy + 22);
    fill(p.paletteGlow[0], p.paletteGlow[1], p.paletteGlow[2]);
    text("PALETTE: " + p.paletteName, hx + 10, hy + 33);

    // Live parameters
    fill(180, 210, 235); textSize(7);
    text(`SEGS: ${p.segments}  ZOOM: ${Math.round(p.zoom * 100)}%  SPIN: ${p.spinRate.toFixed(1)}x`, hx + 10, hy + 46);
    text(`WAVE: ${p.waveHarmonic}   DEPTH: ${p.depthLayers}`, hx + 10, hy + 57);

    // Effects status
    const grainTxt = p.grain > 0.04 ? `${Math.round(p.grain * 100)}%` : "OFF";
    const pixTxt   = p.pixelSize > 1 ? `${p.pixelSize}px` : "OFF";
    const invTxt   = p.inverted ? "ON" : "OFF";

    fill(p.grain > 0.04 ? color(0, 255, 200) : 150);
    text(`GRAIN: ${grainTxt}`, hx + 10, hy + 70);
    fill(p.pixelSize > 1 ? color(0, 255, 200) : 150);
    text(`PIX: ${pixTxt}`, hx + 75, hy + 70);
    fill(p.inverted ? color(255, 100, 180) : 150);
    text(`INV: ${invTxt}`, hx + 130, hy + 70);

    // Sliders legend
    fill(120, 160, 195); textSize(6.5);
    text("S0:Seg S1:Spin S2:Zoom S3:Wave S4:Lyr", hx + 10, hy + 86);
    text("S5:Grn S6:Pix S7:Inv S8:Glow | Pads:Color", hx + 10, hy + 97);
  }

  // ─────────────────────────────────────────────────────────────
  // Send APC Mini Mk2 Pad LEDs
  // ─────────────────────────────────────────────────────────────
  let lastMidiUpdate = 0;
  function _sendMandalaPadLeds() {
    if (!window.sendMidiLights || !window.midiState?.connected) return;
    const now = millis();
    if (now - lastMidiUpdate < 80) return;
    lastMidiUpdate = now;

    const pads = [];
    const activePal = CWState.mandalaPalette % MANDALA_PALETTES.length;

    for (let r = 0; r < 8; r++) {
      const pal = MANDALA_PALETTES[r % MANDALA_PALETTES.length];
      const isSelectedRow = r === activePal;
      for (let c = 0; c < 8; c++) {
        const loc = r * 8 + c;
        if (loc === CWState.mandalaFlashPad) {
          pads.push({ location: loc, color: "#ffffff", mode: "brightness_100" });
        } else if (isSelectedRow) {
          pads.push({ location: loc, color: pal.padColor, mode: "brightness_100" });
        } else {
          pads.push({ location: loc, color: pal.padColor, mode: "brightness_25" });
        }
      }
    }
    window.sendMidiLights(pads);
  }

  // ─────────────────────────────────────────────────────────────
  // MODE 2 — DRAW MODE (Index Finger Drawing + Circle Pixel Portal)
  // ─────────────────────────────────────────────────────────────
  function _drawDrawMode(rh, lh, capture) {
    const now = millis();

    // 1. Check if left hand is a fist → Clear canvas!
    if (lh && lh.isFist && now > CWState.drawClearCooldown) {
      CWState.drawStrokes = [];
      CWState.drawCurrentStroke = [];
      CWState.drawCircles = [];
      CWState.drawParticles = [];
      CWState.drawClearCooldown = now + 1200;
      CWState.drawClearNoticeUntil = now + 1200;
    }

    // 2. Identify drawing pointer (Right hand index, left hand index, or mouse)
    let pointer = null;
    if (rh && !rh.isFist && rh.index && rh.index.tipScreen) {
      pointer = rh.index.tipScreen;
    } else if (lh && !lh.isFist && lh.index && lh.index.tipScreen) {
      pointer = lh.index.tipScreen;
    } else if (mouseIsPressed && mouseX > 130 && !(mouseX > width - 230 && mouseY > height - 140)) {
      pointer = { x: mouseX, y: mouseY };
    }

    // 3. Accumulate drawing points
    if (pointer) {
      const last = CWState.drawLastPoint;
      const d = last ? Math.hypot(pointer.x - last.x, pointer.y - last.y) : 999;
      // Record if moved at least 3 px
      if (d > 3) {
        const hue = (now * 0.12) % 360;
        CWState.drawCurrentStroke.push({
          x: pointer.x,
          y: pointer.y,
          time: now,
          hue: hue,
        });
        CWState.drawLastPoint = { x: pointer.x, y: pointer.y };

        // Emit sparkling particles from fingertip
        if (CWState.drawParticles.length < 90 && Math.random() < 0.6) {
          CWState.drawParticles.push({
            x: pointer.x + (Math.random() - 0.5) * 8,
            y: pointer.y + (Math.random() - 0.5) * 8,
            vx: (Math.random() - 0.5) * 1.8,
            vy: (Math.random() - 0.5) * 1.8 - 0.5,
            life: 1.0,
            hue: hue,
          });
        }

        // Check if stroke just closed a circle
        _checkCircleCompletion(CWState.drawCurrentStroke);
      }
    } else {
      // Finger lifted / out of frame → commit stroke
      if (CWState.drawCurrentStroke.length > 1) {
        CWState.drawStrokes.push(CWState.drawCurrentStroke.slice());
      }
      CWState.drawCurrentStroke = [];
      CWState.drawLastPoint = null;
    }

    // 4. Render active Circle Pixel Portals
    _renderCirclePortals(capture);

    // 5. Render drawing strokes & particles
    _renderDrawStrokes();

    // 6. Draw pointer reticle at fingertip
    if (pointer) {
      noFill();
      stroke(0, 240, 255, 230);
      strokeWeight(2);
      ellipse(pointer.x, pointer.y, 16, 16);
      fill(255);
      noStroke();
      ellipse(pointer.x, pointer.y, 4, 4);
    }

    // 7. Render HUD
    _drawDrawHUD();

    // 8. Notice banner if cleared
    if (now < CWState.drawClearNoticeUntil) {
      push();
      rectMode(CENTER);
      fill(6, 14, 26, 210);
      stroke(0, 230, 255, 120);
      strokeWeight(1);
      rect(width / 2, 45, 180, 32, 6);
      noStroke();
      fill(0, 255, 180);
      textFont("Besport");
      textSize(9);
      textAlign(CENTER, CENTER);
      text("CANVAS CLEARED", width / 2, 45);
      pop();
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Detect full circle loop in stroke
  // ─────────────────────────────────────────────────────────────
  function _checkCircleCompletion(stroke) {
    if (!stroke || stroke.length < 18) return;
    const curr = stroke[stroke.length - 1];

    // Check against earlier points in the stroke
    for (let i = 0; i < stroke.length - 14; i++) {
      const p = stroke[i];
      const d = Math.hypot(curr.x - p.x, curr.y - p.y);
      if (d < 42) {
        const loopPoints = stroke.slice(i);
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        let sumX = 0, sumY = 0;
        let perim = 0;

        for (let k = 0; k < loopPoints.length; k++) {
          const pt = loopPoints[k];
          minX = Math.min(minX, pt.x);
          maxX = Math.max(maxX, pt.x);
          minY = Math.min(minY, pt.y);
          maxY = Math.max(maxY, pt.y);
          sumX += pt.x;
          sumY += pt.y;
          if (k > 0) {
            perim += Math.hypot(pt.x - loopPoints[k - 1].x, pt.y - loopPoints[k - 1].y);
          }
        }

        if (perim < 100) continue;
        const w = maxX - minX;
        const h = maxY - minY;
        if (w < 40 || h < 40) continue;
        const aspect = w / h;
        if (aspect < 0.35 || aspect > 2.8) continue;

        const cx = sumX / loopPoints.length;
        const cy = sumY / loopPoints.length;
        const r = Math.max(28, (w + h) / 4);

        // Calculate angular sweep around centroid
        let angleDiffSum = 0;
        let prevAng = Math.atan2(loopPoints[0].y - cy, loopPoints[0].x - cx);
        for (let k = 1; k < loopPoints.length; k++) {
          const ang = Math.atan2(loopPoints[k].y - cy, loopPoints[k].x - cx);
          let diff = ang - prevAng;
          while (diff < -Math.PI) diff += TWO_PI;
          while (diff > Math.PI) diff -= TWO_PI;
          angleDiffSum += diff;
          prevAng = ang;
        }

        if (Math.abs(angleDiffSum) >= 1.5 * Math.PI) {
          // Closed circle detected! Create magic pixel portal lens!
          CWState.drawCircles.push({
            cx: cx,
            cy: cy,
            r: r,
            created: millis(),
            pulse: 1.0,
            hue: curr.hue || 180,
          });

          // Keep up to 6 circles
          if (CWState.drawCircles.length > 6) {
            CWState.drawCircles.shift();
          }

          // Reset stroke so loop isn't re-detected continuously
          stroke.length = 0;
          CWState.drawLastPoint = null;
          return;
        }
      }
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Render Circle Portals with Pixelate Camera Filter Inside
  // ─────────────────────────────────────────────────────────────
  function _renderCirclePortals(capture) {
    if (!capture || !capture.elt || capture.elt.readyState < 2) return;
    if (!CWState.drawCircles.length) return;

    // Ensure low-res buffer has camera frame for pixelation
    const pc = CWState.pixelCanvas;
    const pCtx = CWState.pixelCtx;
    if (pc && pCtx) {
      pCtx.clearRect(0, 0, 96, 54);
      pCtx.save();
      pCtx.translate(96, 0); pCtx.scale(-1, 1);
      pCtx.drawImage(capture.elt, 0, 0, 96, 54);
      pCtx.restore();
    }

    const now = millis();

    for (let c of CWState.drawCircles) {
      drawingContext.save();

      // Clip inside circle
      drawingContext.beginPath();
      drawingContext.arc(c.cx, c.cy, c.r, 0, TWO_PI);
      drawingContext.closePath();
      drawingContext.clip();

      // Render pixelated camera inside circle with vibrant boost
      drawingContext.filter = "contrast(1.5) saturate(2.2) brightness(1.05)";
      drawingContext.imageSmoothingEnabled = false;
      drawingContext.drawImage(pc, 0, 0, width, height);
      drawingContext.imageSmoothingEnabled = true;
      drawingContext.filter = "none";

      // Subtle cyber-grid inside
      stroke(0, 240, 255, 35);
      strokeWeight(1);
      const step = 15;
      const x0 = c.cx - c.r, x1 = c.cx + c.r;
      const y0 = c.cy - c.r, y1 = c.cy + c.r;
      for (let gx = x0; gx <= x1; gx += step) line(gx, y0, gx, y1);
      for (let gy = y0; gy <= y1; gy += step) line(x0, gy, x1, gy);

      drawingContext.restore(); // end clip

      // Animated glowing perimeter border
      const glow = Math.sin(now * 0.008 + c.cx * 0.01) * 0.3 + 0.7;
      noFill();
      stroke(0, 240, 255, 220 * glow);
      strokeWeight(3);
      ellipse(c.cx, c.cy, c.r * 2, c.r * 2);

      stroke(255, 0, 160, 140 * glow);
      strokeWeight(1.2);
      ellipse(c.cx, c.cy, c.r * 2 + 7, c.r * 2 + 7);

      // Label
      textFont("Besport");
      noStroke();
      fill(0, 240, 255, 230);
      textSize(8);
      textAlign(CENTER, BOTTOM);
      text("PIXEL LENS", c.cx, c.cy - c.r - 4);

      // Expanding shockwave on creation
      if (c.pulse > 0.01) {
        c.pulse *= 0.92;
        const waveR = c.r * (1.0 + (1.0 - c.pulse) * 0.8);
        noFill();
        stroke(0, 255, 200, 240 * c.pulse);
        strokeWeight(2.5);
        ellipse(c.cx, c.cy, waveR * 2, waveR * 2);
      }
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Render Drawing Strokes and Sparks
  // ─────────────────────────────────────────────────────────────
  function _renderDrawStrokes() {
    const allStrokes = [...CWState.drawStrokes];
    if (CWState.drawCurrentStroke.length > 1) {
      allStrokes.push(CWState.drawCurrentStroke);
    }

    colorMode(HSB, 360, 100, 100, 100);

    for (let strk of allStrokes) {
      if (strk.length < 2) continue;

      // Glow pass
      noFill();
      for (let i = 1; i < strk.length; i++) {
        const p1 = strk[i - 1];
        const p2 = strk[i];
        stroke(p2.hue, 85, 100, 30);
        strokeWeight(11);
        line(p1.x, p1.y, p2.x, p2.y);
      }

      // Saturated inner ribbon
      for (let i = 1; i < strk.length; i++) {
        const p1 = strk[i - 1];
        const p2 = strk[i];
        stroke(p2.hue, 85, 100, 95);
        strokeWeight(4.5);
        line(p1.x, p1.y, p2.x, p2.y);

        // Core white highlight
        stroke(0, 0, 100, 85);
        strokeWeight(1.5);
        line(p1.x, p1.y, p2.x, p2.y);
      }
    }

    // Render sparkling particles
    noStroke();
    for (let i = CWState.drawParticles.length - 1; i >= 0; i--) {
      const p = CWState.drawParticles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.life -= 0.035;
      if (p.life <= 0) {
        CWState.drawParticles.splice(i, 1);
        continue;
      }
      fill(p.hue, 85, 100, p.life * 100);
      ellipse(p.x, p.y, p.life * 6, p.life * 6);
    }

    colorMode(RGB, 255);
  }

  // ─────────────────────────────────────────────────────────────
  // DRAW Mode HUD Panel (Down Right Edge)
  // ─────────────────────────────────────────────────────────────
  function _drawDrawHUD() {
    textFont("Besport");
    const hx = width - 225, hy = height - 135;

    stroke(0, 230, 255, 50); strokeWeight(1);
    fill(6, 14, 24, 215);
    rect(hx, hy, 205, 115, 7);

    noStroke();
    fill(0, 230, 255); textSize(8.5); textAlign(LEFT, TOP);
    text("DRAW [INDEX FINGER]", hx + 10, hy + 9);

    fill(255); textSize(7.5);
    text("\u21AA Draw with index finger in air", hx + 10, hy + 24);
    text("\u21AA Draw full circle \u2192 PIXEL LENS", hx + 10, hy + 37);

    fill(0, 255, 180); textSize(7);
    text(`PIXEL LENSES: ${CWState.drawCircles.length}  |  STROKES: ${CWState.drawStrokes.length}`, hx + 10, hy + 52);

    fill(180, 210, 235); textSize(7);
    text("\u21AA Left fist \u2192 Clear canvas", hx + 10, hy + 67);

    // Clickable Clear button in HUD
    stroke(0, 230, 255, 70); strokeWeight(1);
    fill(0, 45, 70, 220);
    rect(hx + 10, hy + 83, 78, 20, 4);
    noStroke(); fill(0, 230, 255); textSize(7.5); textAlign(CENTER, CENTER);
    text("CLEAR ALL", hx + 10 + 78 / 2, hy + 83 + 10);
  }

  // ─────────────────────────────────────────────────────────────
  // Click / gesture handler (called every frame by colorful-track.js)
  // ─────────────────────────────────────────────────────────────
  function handleClicks(rh, lh, isPinch) {
    const now = millis();

    // Mode 0: image cycling via left pinky + thumb
    if (CWState.activeMode === 0 && lh && now > CWState.imageCooldownUntil) {
      const touching = window.isPinkyThumbTouching ? window.isPinkyThumbTouching(lh) : false;
      if (touching) {
        CWState.currentImageIndex = (CWState.currentImageIndex + 1) % TOTAL_ELEMENTS;
        CWState.imageCooldownUntil = now + 1100;
      }
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Mouse click handler (called from colorful-track.js mousePressed)
  // ─────────────────────────────────────────────────────────────
  function handleMouseClick(mx, my) {
    // Check left sub-mode menu buttons
    const { btnW, btnH } = MENU_LAYOUT;
    for (let i = 0; i < SUB_MODES.length; i++) {
      const { x: bx, y: by } = _leftMenuButtonRect(i);
      if (mx >= bx && mx <= bx + btnW && my >= by && my <= by + btnH) {
        CWState.activeMode = i;
        if (i !== 3 && window.resetMidiLights) {
          window.resetMidiLights();
        }
        return true;
      }
    }

    // In Draw mode, allow clicking the CLEAR ALL button in the HUD
    if (CWState.activeMode === 2) {
      const hx = width - 225, hy = height - 135;
      if (mx >= hx + 10 && mx <= hx + 90 && my >= hy + 83 && my <= hy + 105) {
        CWState.drawStrokes = [];
        CWState.drawCurrentStroke = [];
        CWState.drawCircles = [];
        CWState.drawParticles = [];
        CWState.drawClearNoticeUntil = millis() + 1000;
        return true;
      }
    }

    // In Mandala mode, allow clicking the properties HUD panel
    if (CWState.activeMode === 3) {
      const hx = width - 225, hy = height - 135;
      if (mx >= hx && mx <= hx + 205 && my >= hy && my <= hy + 115) {
        if (my >= hy + 18 && my <= hy + 30) {
          CWState.mandalaStyle = (CWState.mandalaStyle + 1) % MANDALA_STYLES.length;
          return true;
        }
        if (my >= hy + 31 && my <= hy + 43) {
          CWState.mandalaPalette = (CWState.mandalaPalette + 1) % MANDALA_PALETTES.length;
          _sendMandalaPadLeds();
          return true;
        }
        if (my >= hy + 65 && my <= hy + 80) {
          if (mx < hx + 70) {
            CWState.mandalaGrainToggled = !CWState.mandalaGrainToggled;
          } else if (mx < hx + 125) {
            CWState.mandalaPixelToggled = !CWState.mandalaPixelToggled;
          } else {
            CWState.mandalaInvertToggled = !CWState.mandalaInvertToggled;
          }
          return true;
        }
      }
    }
    return false;
  }

  // ─────────────────────────────────────────────────────────────
  // Utility
  // ─────────────────────────────────────────────────────────────
  function _map(v, lo, hi, oLo, oHi) {
    return oLo + (oHi - oLo) * ((v - lo) / (hi - lo));
  }

  // ─────────────────────────────────────────────────────────────
  // Public API
  // ─────────────────────────────────────────────────────────────
  window.ControlWorld = { init, draw, handleClicks, handleMouseClick, state: CWState };

})();
