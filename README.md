Vague
Vague is an interactive creative coding installation that bridges computer vision and real-time generative art. By utilizing hand tracking, the system generates dynamic visual effects directly in the browser, allowing users to physically interact with the digital canvas.

🛠️ Technologies & Stack
Computer Vision: Python & MediaPipe (Real-time hand tracking)

Visual Interface: JavaScript, HTML5 canvas, and p5.js

Data Bridge: WebSockets (Streams coordinate data from Python to the browser)

Audio & Hardware: Web MIDI API for physical controller integration (e.g., Akai APC Mini Mk2) and audio synchronization.

✨ Core Features
Real-Time Hand Tracking: Translates physical gestures into interactive digital coordinates using MediaPipe.

Generative Visuals: Dynamic, fluid visuals rendered via JavaScript (colorful-track.js, control-world.js).

MIDI Integration: Full support for external MIDI controllers to manipulate visual parameters and states live (midi-bridge.js, midi-controller.js).

Audio Reactivity: Built-in audio playback and synchronization (music-tracks.js).

📂 Project Structure
index.html - The main entry point for the visual interface.

control-world.js / colorful-track.js - Core rendering and visual logic files.

midi-controller.js / midi-bridge.js - Handles incoming MIDI signals to map hardware knobs/sliders to visual effects.

music-tracks.js - Audio loading and playback management.

/images/ - Local media assets (videos and UI graphics).

🚀 Setup & Installation
1. Python Tracking Environment
Ensure you have Python 3 installed. You will need to install the computer vision and networking dependencies:

Bash
pip install mediapipe opencv-python websockets asyncio
2. Running the Project

Start the Python backend script to begin the webcam hand-tracking and WebSocket server.

Serve the frontend directory using a local web server (e.g., using VS Code's Live Server extension, or running python -m http.server in the project root).

Open index.html in your browser (preferably Chrome for optimal Web MIDI and WebSocket support).

Allow camera permissions when prompted.

🎮 Usage
Once both the backend and frontend are running, position your hands in view of your webcam. The tracking points will be mapped to the canvas, driving the generative visual output. Connect your MIDI controller before refreshing the page to tweak visual variables on the fly.