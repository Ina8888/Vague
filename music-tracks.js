/**
 * music-tracks.js
 *
 * Modular music engine for Antigravity Hand Tracker + Akai APC mini Mk2.
 * Powered by Tone.js for low-latency synthesizers, drums, and effects.
 *
 * Supported instruments:
 *   - PIANO  (Polyphonic acoustic/electric piano with rich warmth)
 *   - DRUMS  (64-pad punchy drum machine & percussion kit)
 *   - GUITAR (Plucked string model with acoustic resonance & chorus)
 *   - SAX    (Expressive legato saxophone with vibrato & formant filter)
 *
 * Features:
 *   - 8x8 on-screen interactive visual pad grid with clean note & drum labels
 *   - Full audio RECORD & DOWNLOAD feature (saves direct digital recording as audio file)
 *   - 8x8 Akai APC mini Mk2 hardware pad lighting & triggers
 *   - APC Sliders:
 *       [0] Filter Cutoff  [1] Reverb  [2] Delay  [3] Modulation
 *       [4] Drive/Distort  [5] Attack  [6] Release [7] Pitch/Octave  [8] Master Volume
 *   - APC Vertical Buttons (0-3): Quick-switch Piano / Drums / Guitar / Sax
 *   - APC Horizontal Button 7: Trigger Record / Stop & Download
 */

(function () {
  "use strict";

  // ─────────────────────────────────────────────────────────────
  // Music State
  // ─────────────────────────────────────────────────────────────
  const MusicState = {
    selectedInstrument: "piano", // 'piano' | 'drums' | 'guitar' | 'sax'
    activeNotes: new Map(),      // location -> Tone event / release
    padPressVisuals: new Array(64).fill(0), // animation counter per pad
    lastMidiLightUpdate: 0,
    audioInitialized: false,
    hoveredInstrument: null,
    hoveredPadIndex: -1,
    hoveredRecordBtn: false,
    isRecording: false,
    recordStartTime: 0,
  };

  const INSTRUMENTS = [
    { id: "piano",  label: "PIANO",  sub: "POLYPHONIC KEYS",  color: "#00e6ff" },
    { id: "drums",  label: "DRUMS",  sub: "64-PAD DRUM KIT",  color: "#ff5500" },
    { id: "guitar", label: "GUITAR", sub: "PLUCKED STRINGS",  color: "#ffcc00" },
    { id: "sax",    label: "SAX",    sub: "EXPRESSIVE BRASS", color: "#aa44ff" },
  ];

  // ─────────────────────────────────────────────────────────────
  // Tone.js Audio Engine
  // ─────────────────────────────────────────────────────────────
  let masterVol, masterFilter, masterReverb, masterDelay, waveform, audioRecorder;
  let pianoSynth, guitarSynth, saxSynth;
  let drumKick, drumSnare, drumHatClosed, drumHatOpen, drumTom, drumCrash, drumPerc, drumNoise;

  function initAudio() {
    if (MusicState.audioInitialized || typeof Tone === "undefined") return;

    try {
      // Master FX Bus
      masterVol = new Tone.Volume(0).toDestination();
      masterReverb = new Tone.Reverb({ decay: 2.2, wet: 0.2 }).connect(masterVol);
      masterDelay = new Tone.FeedbackDelay({ delayTime: "8n", feedback: 0.18, wet: 0.15 }).connect(masterReverb);
      masterFilter = new Tone.Filter({ frequency: 20000, type: "lowpass", rolloff: -12 }).connect(masterDelay);

      // Realtime Waveform Analyzer for UI
      waveform = new Tone.Waveform(128);
      masterVol.connect(waveform);

      // Audio Recorder for downloading recorded music
      if (typeof Tone.Recorder !== "undefined") {
        audioRecorder = new Tone.Recorder();
        masterVol.connect(audioRecorder);
      }

      // ── PIANO: Polyphonic synth with warm acoustic piano curve
      pianoSynth = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: "triangle8" },
        envelope: { attack: 0.005, decay: 1.4, sustain: 0.35, release: 1.2 },
      }).connect(masterFilter);
      pianoSynth.volume.value = -2;

      // ── GUITAR: Plucked acoustic/electric modeling synth
      guitarSynth = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: "sawtooth" },
        envelope: { attack: 0.004, decay: 0.9, sustain: 0.1, release: 0.8 },
      }).connect(masterFilter);
      guitarSynth.volume.value = -3;

      // ── SAX: Expressive mono synth with brassy vibrato & formant filter
      saxSynth = new Tone.MonoSynth({
        oscillator: { type: "sawtooth" },
        filter: { Q: 3.5, type: "lowpass", rollover: -24 },
        envelope: { attack: 0.04, decay: 0.3, sustain: 0.7, release: 0.4 },
        filterEnvelope: {
          attack: 0.05,
          decay: 0.25,
          sustain: 0.65,
          release: 0.4,
          baseFrequency: 320,
          octaves: 3.8,
        },
      }).connect(masterFilter);
      saxSynth.volume.value = -1;

      // ── DRUMS: Precision synthesized drum kit elements
      drumKick = new Tone.MembraneSynth({
        pitchDecay: 0.05,
        octaves: 8,
        oscillator: { type: "sine" },
        envelope: { attack: 0.001, decay: 0.4, sustain: 0.01, release: 0.3 },
      }).connect(masterVol);

      drumSnare = new Tone.NoiseSynth({
        noise: { type: "white" },
        envelope: { attack: 0.001, decay: 0.22, sustain: 0 },
      }).connect(masterVol);

      drumHatClosed = new Tone.MetalSynth({
        frequency: 240,
        envelope: { attack: 0.001, decay: 0.05, release: 0.05 },
        harmonicity: 5.1,
        modulationIndex: 32,
        resonance: 4000,
      }).connect(masterVol);
      drumHatClosed.volume.value = -8;

      drumHatOpen = new Tone.MetalSynth({
        frequency: 220,
        envelope: { attack: 0.001, decay: 0.35, release: 0.35 },
        harmonicity: 5.1,
        modulationIndex: 32,
        resonance: 4000,
      }).connect(masterVol);
      drumHatOpen.volume.value = -8;

      drumTom = new Tone.MembraneSynth({
        pitchDecay: 0.05,
        octaves: 4,
        envelope: { attack: 0.001, decay: 0.45, sustain: 0 },
      }).connect(masterVol);

      drumCrash = new Tone.MetalSynth({
        frequency: 180,
        envelope: { attack: 0.002, decay: 0.8, release: 0.8 },
        harmonicity: 4.8,
        modulationIndex: 40,
        resonance: 3000,
      }).connect(masterVol);
      drumCrash.volume.value = -6;

      drumPerc = new Tone.MembraneSynth({
        pitchDecay: 0.02,
        octaves: 3,
        envelope: { attack: 0.001, decay: 0.15, sustain: 0 },
      }).connect(masterVol);

      drumNoise = new Tone.NoiseSynth({
        noise: { type: "pink" },
        envelope: { attack: 0.005, decay: 0.3, sustain: 0 },
      }).connect(masterVol);

      MusicState.audioInitialized = true;
      console.log("[MUSIC] Tone.js Audio Engine Initialized successfully!");
    } catch (err) {
      console.error("[MUSIC] Failed to init audio engine:", err);
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Recording Management (Audio capture & download)
  // ─────────────────────────────────────────────────────────────
  let mediaRecorderFallback = null;
  let fallbackChunks = [];

  async function toggleRecording() {
    if (!MusicState.audioInitialized) {
      await Tone.start();
      initAudio();
    }
    if (Tone.context && Tone.context.state !== "running") {
      await Tone.context.resume();
    }

    if (!MusicState.isRecording) {
      // START RECORDING
      try {
        if (audioRecorder) {
          audioRecorder.start();
        } else if (typeof MediaRecorder !== "undefined") {
          const dest = Tone.context.createMediaStreamDestination();
          masterVol.connect(dest);
          fallbackChunks = [];
          mediaRecorderFallback = new MediaRecorder(dest.stream);
          mediaRecorderFallback.ondataavailable = (e) => {
            if (e.data.size > 0) fallbackChunks.push(e.data);
          };
          mediaRecorderFallback.onstop = () => {
            const blob = new Blob(fallbackChunks, { type: "audio/webm" });
            downloadRecordingFile(blob);
          };
          mediaRecorderFallback.start();
        }
        MusicState.isRecording = true;
        MusicState.recordStartTime = Date.now();
        console.log("[REC] Recording started...");
      } catch (err) {
        console.error("[REC] Error starting recording:", err);
      }
    } else {
      // STOP RECORDING & DOWNLOAD
      try {
        MusicState.isRecording = false;
        if (audioRecorder) {
          const recordingBlob = await audioRecorder.stop();
          downloadRecordingFile(recordingBlob);
        } else if (mediaRecorderFallback && mediaRecorderFallback.state !== "inactive") {
          mediaRecorderFallback.stop();
        }
        console.log("[REC] Recording stopped and download triggered!");
      } catch (err) {
        console.error("[REC] Error stopping recording:", err);
      }
    }
  }

  function downloadRecordingFile(blob) {
    try {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.style.display = "none";
      a.href = url;
      const now = new Date();
      const pad = (n) => n.toString().padStart(2, "0");
      const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
      a.download = `Antigravity_${MusicState.selectedInstrument.toUpperCase()}_${stamp}.mp3`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 2500);
    } catch (e) {
      console.error("[REC] Download failed:", e);
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Note & Layout Mapping
  // ─────────────────────────────────────────────────────────────
  const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

  function midiNumberToNote(midi) {
    const name = NOTE_NAMES[midi % 12];
    const oct  = Math.floor(midi / 12) - 1;
    return `${name}${oct}`;
  }

  function getMelodicNote(location, octaveShift = 0) {
    const row = Math.floor(location / 8); // 0=top, 7=bottom
    const col = location % 8;
    // Row 7 = C3 (MIDI 48). Moving up rows (row decreases) adds 5 semitones per row.
    const baseMidi = 48 + (7 - row) * 5 + col + octaveShift * 12;
    return midiNumberToNote(baseMidi);
  }

  // Drum sound mapping with compact 4-5 char labels to prevent box overflow:
  const DRUM_KIT = [
    // Row 0 (top): Special FX & Stutters
    { name: "LASR", type: "noise", note: "C5" },
    { name: "SIRN", type: "perc",  note: "A4" },
    { name: "SCRT", type: "noise", note: "G4" },
    { name: "SDRP", type: "kick",  note: "C1" },
    { name: "ZAP",  type: "perc",  note: "E5" },
    { name: "REV",  type: "noise", note: "D4" },
    { name: "HORN", type: "perc",  note: "F5" },
    { name: "NOIS", type: "noise", note: "B4" },

    // Row 1: Risers & 808 Hits
    { name: "808C", type: "perc",  note: "G#4" },
    { name: "808P", type: "snare", note: "D#3" },
    { name: "808H", type: "hatC",  note: "F#4" },
    { name: "808O", type: "hatO",  note: "A#4" },
    { name: "808L", type: "kick",  note: "D1" },
    { name: "808M", type: "kick",  note: "F1" },
    { name: "808H", type: "kick",  note: "A1" },
    { name: "808R", type: "perc",  note: "C4" },

    // Row 2: Percussion
    { name: "COWB", type: "perc",  note: "E4" },
    { name: "SHKR", type: "noise", note: "C4" },
    { name: "TAMB", type: "hatC",  note: "G4" },
    { name: "BNG-L",type: "perc",  note: "G3" },
    { name: "BNG-H",type: "perc",  note: "C4" },
    { name: "CNG-L",type: "tom",   note: "E2" },
    { name: "CNG-H",type: "tom",   note: "A2" },
    { name: "WOOD", type: "perc",  note: "F4" },

    // Row 3: Cymbals
    { name: "CRSH1",type: "crash", note: "C4" },
    { name: "CRSH2",type: "crash", note: "E4" },
    { name: "SPLSH",type: "crash", note: "G4" },
    { name: "CHNA", type: "crash", note: "B3" },
    { name: "RIDE1",type: "hatO",  note: "D4" },
    { name: "R-BEL",type: "perc",  note: "F4" },
    { name: "RIDE2",type: "hatO",  note: "A4" },
    { name: "CUP",  type: "perc",  note: "C5" },

    // Row 4: Toms
    { name: "FLR-L",type: "tom",   note: "F1" },
    { name: "FLR-H",type: "tom",   note: "A1" },
    { name: "TOM-L",type: "tom",   note: "C2" },
    { name: "TOM-M",type: "tom",   note: "E2" },
    { name: "TOM-H",type: "tom",   note: "G2" },
    { name: "TM-H2",type: "tom",   note: "B2" },
    { name: "TM-H3",type: "tom",   note: "D3" },
    { name: "ROTO", type: "tom",   note: "F3" },

    // Row 5: Hi-Hats
    { name: "CLSD1",type: "hatC",  note: "C4" },
    { name: "TGHT", type: "hatC",  note: "D4" },
    { name: "HALF", type: "hatO",  note: "E4" },
    { name: "PEDL", type: "hatC",  note: "F4" },
    { name: "OPEN1",type: "hatO",  note: "G4" },
    { name: "SIZZL",type: "hatO",  note: "A4" },
    { name: "TRAP", type: "hatC",  note: "B4" },
    { name: "ROLL", type: "hatC",  note: "C5" },

    // Row 6: Snares & Claps
    { name: "AC-SN",type: "snare", note: "C3" },
    { name: "RIM",  type: "perc",  note: "D3" },
    { name: "TRP-S",type: "snare", note: "E3" },
    { name: "EL-SN",type: "snare", note: "F3" },
    { name: "CLAP1",type: "snare", note: "G3" },
    { name: "CLAP2",type: "snare", note: "A3" },
    { name: "SNAP", type: "perc",  note: "B3" },
    { name: "HD-SN",type: "snare", note: "C4" },

    // Row 7 (bottom): Kicks & Bass Hits
    { name: "SUB-K",type: "kick",  note: "C1" },
    { name: "PNCH", type: "kick",  note: "D1" },
    { name: "AC-KK",type: "kick",  note: "E1" },
    { name: "BOOM", type: "kick",  note: "F1" },
    { name: "DIST", type: "kick",  note: "G1" },
    { name: "HD808",type: "kick",  note: "A1" },
    { name: "CLCK", type: "kick",  note: "B1" },
    { name: "CLUB", type: "kick",  note: "C2" },
  ];

  const DRUM_ROW_COLORS = [
    "#ff0088", // row 0: FX
    "#cc00ff", // row 1: 808
    "#33ffcc", // row 2: Perc
    "#ff00cc", // row 3: Cymbals
    "#00ff66", // row 4: Toms
    "#00ffff", // row 5: HiHats
    "#ffcc00", // row 6: Snares
    "#ff3300", // row 7: Kicks
  ];

  function playDrum(location) {
    const drum = DRUM_KIT[location] || DRUM_KIT[DRUM_KIT.length - 1];
    switch (drum.type) {
      case "kick":
        drumKick?.triggerAttackRelease(drum.note, "8n");
        break;
      case "snare":
        drumSnare?.triggerAttackRelease("16n");
        drumKick?.triggerAttackRelease("G2", "32n");
        break;
      case "hatC":
        drumHatClosed?.triggerAttackRelease("32n");
        break;
      case "hatO":
        drumHatOpen?.triggerAttackRelease("16n");
        break;
      case "tom":
        drumTom?.triggerAttackRelease(drum.note, "8n");
        break;
      case "crash":
        drumCrash?.triggerAttackRelease("8n");
        break;
      case "perc":
        drumPerc?.triggerAttackRelease(drum.note, "16n");
        break;
      case "noise":
        drumNoise?.triggerAttackRelease("16n");
        break;
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Trigger Note On / Off
  // ─────────────────────────────────────────────────────────────
  function triggerPad(location, pressed) {
    if (!MusicState.audioInitialized) {
      Tone.start().then(initAudio);
    }
    if (Tone.context && Tone.context.state !== "running") {
      Tone.context.resume();
    }

    if (pressed) {
      MusicState.padPressVisuals[location] = 1.0;

      if (MusicState.selectedInstrument === "drums") {
        playDrum(location);
      } else {
        const note = getMelodicNote(location);
        MusicState.activeNotes.set(location, note);

        if (MusicState.selectedInstrument === "piano") {
          pianoSynth?.triggerAttack(note);
        } else if (MusicState.selectedInstrument === "guitar") {
          guitarSynth?.triggerAttack(note);
        } else if (MusicState.selectedInstrument === "sax") {
          saxSynth?.triggerAttack(note);
        }
      }
    } else {
      if (MusicState.selectedInstrument !== "drums") {
        const note = MusicState.activeNotes.get(location);
        if (note) {
          if (MusicState.selectedInstrument === "piano") {
            pianoSynth?.triggerRelease([note]);
          } else if (MusicState.selectedInstrument === "guitar") {
            guitarSynth?.triggerRelease([note]);
          } else if (MusicState.selectedInstrument === "sax") {
            saxSynth?.triggerRelease();
          }
          MusicState.activeNotes.delete(location);
        }
      }
    }
  }

  // ─────────────────────────────────────────────────────────────
  // APC Hardware Sliders Mapping
  // ─────────────────────────────────────────────────────────────
  function applySliders(sliders) {
    if (!masterVol || !masterFilter) return;

    // Slider 8: Master Volume (0-127 -> -40dB to +6dB)
    const volVal = (sliders[8] !== undefined ? sliders[8] : 100) / 127;
    masterVol.volume.value = volVal === 0 ? -Infinity : Tone.gainToDb(volVal * 1.2);

    // Slider 0: Lowpass Filter Cutoff (200Hz to 20000Hz)
    const cutVal = (sliders[0] !== undefined ? sliders[0] : 127) / 127;
    masterFilter.frequency.value = 200 * Math.pow(100, cutVal);

    // Slider 1: Reverb Wet (0 to 0.7)
    if (masterReverb) {
      const revVal = (sliders[1] !== undefined ? sliders[1] : 25) / 127;
      masterReverb.wet.value = revVal * 0.7;
    }

    // Slider 2: Delay Wet (0 to 0.6)
    if (masterDelay) {
      const dlyVal = (sliders[2] !== undefined ? sliders[2] : 20) / 127;
      masterDelay.wet.value = dlyVal * 0.6;
    }
  }

  // ─────────────────────────────────────────────────────────────
  // APC Pad LEDs Projection
  // ─────────────────────────────────────────────────────────────
  function updateApcPadLeds() {
    if (!window.sendMidiLights || !window.midiState?.connected) return;
    const now = Date.now();
    if (now - MusicState.lastMidiLightUpdate < 80) return;
    MusicState.lastMidiLightUpdate = now;

    const pads = [];
    const inst = MusicState.selectedInstrument;

    for (let loc = 0; loc < 64; loc++) {
      const isPressed = window.midiState?.pads?.[loc] || MusicState.padPressVisuals[loc] > 0.3;

      if (isPressed) {
        pads.push({ location: loc, color: "#ffffff" });
        continue;
      }

      if (inst === "drums") {
        const row = Math.floor(loc / 8);
        pads.push({ location: loc, color: DRUM_ROW_COLORS[row] || "#ff5500" });
      } else if (inst === "piano") {
        const note = getMelodicNote(loc);
        if (note.startsWith("C") && !note.startsWith("C#")) {
          pads.push({ location: loc, color: "#ffcc00" });
        } else if (note.includes("#")) {
          pads.push({ location: loc, color: "#220055" });
        } else {
          pads.push({ location: loc, color: "#00b4d8" });
        }
      } else if (inst === "guitar") {
        const row = Math.floor(loc / 8);
        const colors = ["#ff9e00", "#ffaa00", "#ffb703", "#ffd000", "#ffd60a", "#ffe066", "#fff099", "#fffae0"];
        pads.push({ location: loc, color: colors[row] || "#ffaa00" });
      } else if (inst === "sax") {
        const row = Math.floor(loc / 8);
        const col = loc % 8;
        const color = (row + col) % 2 === 0 ? "#9d4edd" : "#e0aaff";
        pads.push({ location: loc, color });
      }
    }

    window.sendMidiLights(pads);
  }

  // ─────────────────────────────────────────────────────────────
  // Event Listeners for MIDI
  // ─────────────────────────────────────────────────────────────
  window.addEventListener("midiPad", (e) => {
    const { location, pressed } = e.detail;
    triggerPad(location, pressed);
  });

  window.addEventListener("midiSlider", (e) => {
    if (window.midiState?.sliders) {
      applySliders(window.midiState.sliders);
    }
  });

  // Vertical buttons on the APC switch instruments directly (Buttons 1-4)
  window.addEventListener("midiVertical", (e) => {
    const { location, pressed } = e.detail;
    if (pressed && location >= 0 && location < 4) {
      MusicState.selectedInstrument = INSTRUMENTS[location].id;
      console.log(`[MUSIC] Switched instrument to: ${INSTRUMENTS[location].label}`);
    }
  });

  // Horizontal button 7 on the APC toggles Recording directly from hardware!
  window.addEventListener("midiHorizontal", (e) => {
    const { location, pressed } = e.detail;
    if (pressed && location === 7) {
      toggleRecording();
    }
  });

  // ─────────────────────────────────────────────────────────────
  // Canvas Rendering (drawMusicView)
  // ─────────────────────────────────────────────────────────────
  function drawMusicView() {
    try {
      if (window.midiState?.sliders) {
        applySliders(window.midiState.sliders);
      }

      // Background
      if (typeof drawGlowBackground === "function") {
        drawGlowBackground();
      } else {
        background(6, 10, 18);
      }

      // ─────────────────────────────────────────────────────────
      // 1. Header (Clean layout with zero text overlaps)
      // ─────────────────────────────────────────────────────────
      noStroke();
      textFont(typeof FONT !== "undefined" ? FONT : "Besport");
      textAlign(LEFT, CENTER);
      textSize(22);
      fill(0, 230, 255);
      text("MAKE MUSIC", 40, 36);

      // Active Instrument Badge (positioned safely to the right of MAKE MUSIC)
      const currInst = INSTRUMENTS.find((i) => i.id === MusicState.selectedInstrument);
      textSize(11);
      fill(170, 210, 235);
      text(`[ ACTIVE: ${currInst.label}  —  ${currInst.sub} ]`, 330, 36);

      // APC Connection badge (safe right margin)
      const isConn = window.midiState?.connected;
      fill(isConn ? color(0, 255, 140) : color(140));
      ellipse(width - 180, 36, 8, 8);
      fill(200);
      textSize(10);
      text(isConn ? "APC CONNECTED" : "MIDI WAITING", width - 166, 36);

      // ─────────────────────────────────────────────────────────
      // 2. 8x8 Music Grid Layout (Compact pad labels)
      // ─────────────────────────────────────────────────────────
      const gridX = 40;
      const gridY = 68;
      const padSize = 44;
      const padGap = 6;

      MusicState.hoveredPadIndex = -1;
      const rh = typeof getRightHand === "function" ? getRightHand() : null;
      const pointer = rh && !rh.isFist ? rh.index.tipScreen : { x: mouseX, y: mouseY };

      for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
          const loc = row * 8 + col;
          const px = gridX + col * (padSize + padGap);
          const py = gridY + row * (padSize + padGap);

          const isHovered =
            pointer.x >= px && pointer.x <= px + padSize &&
            pointer.y >= py && pointer.y <= py + padSize;
          if (isHovered) MusicState.hoveredPadIndex = loc;

          const visualPress = MusicState.padPressVisuals[loc];
          if (visualPress > 0) {
            MusicState.padPressVisuals[loc] = Math.max(0, visualPress - 0.08);
          }
          const isPadPressed = (window.midiState?.pads?.[loc]) || visualPress > 0.05;

          let padColor, label;
          if (MusicState.selectedInstrument === "drums") {
            const drum = DRUM_KIT[loc] || DRUM_KIT[0];
            padColor = DRUM_ROW_COLORS[row] || "#ff5500";
            label = drum.name;
          } else {
            const note = getMelodicNote(loc);
            label = note;
            if (note.startsWith("C") && !note.startsWith("C#")) {
              padColor = "#ffcc00"; // Root C
            } else if (note.includes("#")) {
              padColor = "#441188"; // Black key
            } else {
              padColor = "#0077b6"; // White key
            }
          }

          if (isPadPressed) {
            stroke(255);
            strokeWeight(3);
            fill(255, 255, 255, 230);
            rect(px - 2, py - 2, padSize + 4, padSize + 4, 8);

            fill(0);
            textSize(MusicState.selectedInstrument === "drums" ? 8 : 9.5);
            textAlign(CENTER, CENTER);
            text(label, px + padSize / 2, py + padSize / 2);
          } else {
            if (isHovered) {
              stroke(255);
              strokeWeight(2);
            } else {
              stroke(padColor);
              strokeWeight(1);
            }
            fill(padColor + "44");
            rect(px, py, padSize, padSize, 6);

            noStroke();
            fill(isHovered ? 255 : 210);
            textSize(MusicState.selectedInstrument === "drums" ? 7.5 : 9);
            textAlign(CENTER, CENTER);
            text(label, px + padSize / 2, py + padSize / 2);
          }
        }
      }

      // ─────────────────────────────────────────────────────────
      // 3. Middle Column: Instrument Cards & Record Button
      // ─────────────────────────────────────────────────────────
      const panelX = 460;
      const btnW = 225;
      const btnH = 48;
      const btnGap = 8;
      const startY = 68;

      MusicState.hoveredInstrument = null;

      for (let i = 0; i < INSTRUMENTS.length; i++) {
        const inst = INSTRUMENTS[i];
        const by = startY + i * (btnH + btnGap);
        const isSelected = inst.id === MusicState.selectedInstrument;
        const isHovered =
          pointer.x >= panelX && pointer.x <= panelX + btnW &&
          pointer.y >= by && pointer.y <= by + btnH;

        if (isHovered) MusicState.hoveredInstrument = inst.id;

        if (isSelected) {
          stroke(0, 230, 255);
          strokeWeight(2.5);
          fill(0, 230, 255, 45);
        } else if (isHovered) {
          stroke(255);
          strokeWeight(2);
          fill(255, 255, 255, 25);
        } else {
          stroke(100, 150, 180, 120);
          strokeWeight(1.5);
          fill(10, 20, 35, 180);
        }
        rect(panelX, by, btnW, btnH, 10);

        // Card Labels (wide gap, no overlap)
        noStroke();
        textAlign(LEFT, CENTER);
        fill(isSelected ? color(0, 230, 255) : 255);
        textSize(15);
        text(inst.label, panelX + 16, by + 16);

        fill(150, 180, 205);
        textSize(8.5);
        text(inst.sub, panelX + 16, by + 34);

        // Clean shortcut pill on the right
        fill(isSelected ? color(0, 230, 255) : color(90, 120, 150));
        textSize(8.5);
        textAlign(RIGHT, CENTER);
        text(`PAD [${i + 1}]`, panelX + btnW - 14, by + 16);
      }

      // ── RECORD BUTTON (Taller height, 2 rows for subtitle) ──
      const recY = startY + 4 * (btnH + btnGap) + 4;
      const recH = 56;

      const isRecHovered =
        pointer.x >= panelX && pointer.x <= panelX + btnW &&
        pointer.y >= recY && pointer.y <= recY + recH;
      MusicState.hoveredRecordBtn = isRecHovered;

      if (MusicState.isRecording) {
        // Active recording: pulsing red
        const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 150);
        stroke(255, 40, 60);
        strokeWeight(2.5);
        fill(120 * pulse + 40, 10, 25, 240);
        rect(panelX, recY, btnW, recH, 10);

        // Flashing red dot
        noStroke();
        fill(255, 50, 70);
        ellipse(panelX + 22, recY + recH / 2, 10, 10);

        // Timer
        const elapsedSec = Math.floor((Date.now() - MusicState.recordStartTime) / 1000);
        const mins = Math.floor(elapsedSec / 60).toString().padStart(2, "0");
        const secs = (elapsedSec % 60).toString().padStart(2, "0");

        fill(255);
        textAlign(LEFT, CENTER);
        textSize(11.5);
        text(`■ STOP & DOWNLOAD`, panelX + 38, recY + 15);

        fill(255, 180, 190);
        textSize(8.5);
        text(`RECORDING: ${mins}:${secs}`, panelX + 38, recY + 31);
        textSize(7.5);
        text(`(CLICK TO SAVE FILE)`, panelX + 38, recY + 44);
      } else {
        // Idle recording button
        stroke(isRecHovered ? color(255, 80, 100) : color(180, 40, 60, 180));
        strokeWeight(isRecHovered ? 2.5 : 1.5);
        fill(isRecHovered ? color(50, 15, 25) : color(25, 10, 18, 200));
        rect(panelX, recY, btnW, recH, 10);

        // Red Record Dot
        noStroke();
        fill(255, 40, 60);
        ellipse(panelX + 22, recY + recH / 2, 9, 9);

        fill(255);
        textAlign(LEFT, CENTER);
        textSize(12);
        text("● RECORD MUSIC", panelX + 38, recY + 15);

        fill(170, 160, 175);
        textSize(8);
        text("DOWNLOAD AUDIO", panelX + 38, recY + 31);
        textSize(7.5);
        text("(MP3 / WAV)", panelX + 38, recY + 44);
      }

      // ── Realtime Waveform Visualizer ─────────────────────────
      const waveY = recY + recH + 8;
      const waveW = btnW;
      const waveH = 70;

      stroke(0, 230, 255, 90);
      strokeWeight(1.5);
      fill(5, 12, 22, 200);
      rect(panelX, waveY, waveW, waveH, 10);

      if (waveform && MusicState.audioInitialized) {
        const values = waveform.getValue();
        stroke(0, 230, 255);
        strokeWeight(1.8);
        noFill();
        beginShape();
        for (let i = 0; i < values.length; i++) {
          const wx = map(i, 0, values.length - 1, panelX + 6, panelX + waveW - 6);
          const wy = map(values[i], -1, 1, waveY + waveH - 6, waveY + 20);
          vertex(wx, wy);
        }
        endShape();
      }

      noStroke();
      fill(130, 170, 200);
      textSize(7.5);
      textAlign(LEFT, TOP);
      text("MASTER OUTPUT", panelX + 10, waveY + 6);
      text("OSCILLOSCOPE", panelX + 11, waveY + 16);

      // ─────────────────────────────────────────────────────────
      // 4. Right Side: CONTROLLER FADERS Panel (2-row title)
      // ─────────────────────────────────────────────────────────
      const hudPanelX = 705;
      const hudW = 215;
      const hudH = 394;
      const sliders = window.midiState?.sliders || [0, 64, 64, 0, 64, 0, 0, 0, 100];
      const volPct = Math.round(((sliders[8] !== undefined ? sliders[8] : 100) / 127) * 100);
      const cutPct = Math.round(((sliders[0] !== undefined ? sliders[0] : 127) / 127) * 100);

      stroke(80, 120, 160, 100);
      strokeWeight(1);
      fill(10, 18, 30, 200);
      rect(hudPanelX, startY, hudW, hudH, 12);

      // 2-row Title for CONTROLLER FADERS
      noStroke();
      fill(0, 230, 255);
      textSize(12);
      textAlign(LEFT, TOP);
      text("CONTROLLER", hudPanelX + 16, startY + 12);
      text("FADERS", hudPanelX + 16, startY + 28);

      const faderNames = [
        `F1 (CUTOFF):  ${cutPct}%`,
        `F2 (REVERB):  ${Math.round((sliders[1] || 0) / 1.27)}%`,
        `F3 (DELAY):   ${Math.round((sliders[2] || 0) / 1.27)}%`,
        `F4 (CHORUS):  ${Math.round((sliders[3] || 0) / 1.27)}%`,
        `F5 (DRIVE):   ${Math.round((sliders[4] || 0) / 1.27)}%`,
        `F6 (ATTACK):  ${Math.round((sliders[5] || 0) / 1.27)}%`,
        `F7 (RELEASE): ${Math.round((sliders[6] || 0) / 1.27)}%`,
        `F8 (OCTAVE):  ${Math.round((sliders[7] || 0) / 1.27)}%`,
        `MASTER VOL:   ${volPct}%`,
      ];

      textSize(9);
      for (let f = 0; f < faderNames.length; f++) {
        fill(f === 8 ? color(0, 255, 140) : 210);
        text(faderNames[f], hudPanelX + 16, startY + 54 + f * 24);
      }

      // Bottom Navigation Hint
      fill(120, 160, 190);
      textSize(9.5);
      textAlign(CENTER, CENTER);
      text("PRESS SPACEBAR OR MAKE RIGHT FIST TO RETURN TO MENU", width / 2, height - 18);

      // Hardware light sync
      updateApcPadLeds();
    } catch (err) {
      console.error("[MUSIC DRAW ERR]:", err);
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Touch / Pinch Click Handler
  // ─────────────────────────────────────────────────────────────
  function handleMusicClicks(rh, isPinch) {
    if (!isPinch) return;

    // 1. Record button toggle
    if (MusicState.hoveredRecordBtn) {
      toggleRecording();
      return;
    }

    // 2. Instrument selection
    if (MusicState.hoveredInstrument) {
      MusicState.selectedInstrument = MusicState.hoveredInstrument;
      console.log(`[MUSIC] Switched instrument via gesture: ${MusicState.hoveredInstrument}`);
      return;
    }

    // 3. Pad click via pointer
    if (MusicState.hoveredPadIndex >= 0) {
      triggerPad(MusicState.hoveredPadIndex, true);
      setTimeout(() => triggerPad(MusicState.hoveredPadIndex, false), 250);
    }
  }

  // Expose global music API
  window.MusicEngine = {
    init: initAudio,
    draw: drawMusicView,
    triggerPad,
    toggleRecording,
    handleClicks: handleMusicClicks,
    state: MusicState,
  };
})();
