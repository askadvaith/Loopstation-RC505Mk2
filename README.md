# Loopstation Web App

A powerful, browser-based 5-track loop station built with React, Web Audio API, and Tailwind CSS. It is designed to mimic the workflow of a fully-featured hardware loop station, enabling complex live looping performances directly in your browser.

## Features

- **5 Independent Loop Tracks:** Record, overdub, play, and stop 5 separate audio tracks.
- **Advanced Track Controls:** Per-track volume, pan, reverse playback, and 1-shot modes.
- **Sync & Quantize:** Loop synchronization, tempo match, and measure-based quantization ensure your loops always stay in time.
- **Play Modes:** "Multi" (play all active tracks) and "Single" (play one track at a time) modes.
- **Input & Track Effects (FX):** 50+ built-in effect types across several categories (Filters, Modulation, Delays, Reverbs, Pitch, Vocoders, and Beat FX). 
- **FX Banks & Slots:** 4 Input FX banks (A–D) and 4 Track FX banks (A–D). Each bank contains up to 4 effects (slots) that can be individually customized and chained.
- **FX Sequencer:** Automate and modulate effect parameters to the beat using a 16-step sequencer (perfect for rhythmic gating or filter sweeps).
- **Keyboard Shortcuts:** Keyboard mappings available for hands-free performance.

---

## Installation & Setup

Ensure you have [Node.js](https://nodejs.org/) installed on your machine.

1. **Clone the repository** (if you haven't already):
   ```bash
   git clone <repository_url>
   cd Loopstation
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Start the development server:**
   ```bash
   npm run dev
   ```

4. **Open in browser:**
   Navigate to the local URL provided by Vite (usually `http://localhost:5173` or `http://localhost:5180`).
   *Note: Using a modern browser (Chrome, Edge, Firefox) is highly recommended for optimal Web Audio API performance.*

5. **Microphone Access:**
   When you click the `START` button in the app, the browser will ask for microphone permissions. Allow access so you can record audio.

---

## User Manual

### 1. Getting Started

- **Initialize Audio:** Click the `START` button on the initial screen to start the Web Audio context and connect your microphone.
- **Master Controls:** The top panel houses your global settings such as Master Volume, Input Gain, and Tap Tempo.
- **Microphone Signal:** Speak or play an instrument into your microphone. The visualizer at the top will indicate input signal strength.

### 2. Recording & Playback

The central section features 5 independent loop tracks. Each track has its own fader and transport buttons.

- **Record:** Click a track's main play/record button to begin capturing audio. The button turns red.
- **Playback/Overdub:** Click the button again while recording to switch to playback (green), or overdub mode (yellow) depending on your configuration.
- **Stop:** Click the `⏹` Stop button below a track to halt its playback.
- **Clear:** Click the `CLR` (Clear) button to erase the track's contents and free it up for a new recording.
- **Undo/Redo:** Click `UNDO` (or `REDO`) if you make a mistake on your last overdub pass.

### 3. Track Settings

Clicking the `EDIT` button above a track fader opens the configuration screen for that specific track.

- **Volume & Pan:** Adjust the fader and pan knob.
- **Reverse:** Plays the track audio backwards.
- **1-Shot:** Makes the track play once and stop (useful for samples or drum hits).
- **Dub Mode:** Change overdub behavior (Add/Overdub, Replace).
- **Loop Sync & Tempo Sync:** Set whether the track syncs to the master loop length or scales to the global BPM.

### 4. Effects Engine (Input FX & Track FX)

The loop station features a massive effects engine broken down into **Input FX** (applied to your microphone before it hits the track) and **Track FX** (applied to the track output).

- **Selecting a Bank:** Click one of the bank letters (`A`, `B`, `C`, `D`) to view its 4 effect slots.
- **Toggling a Bank:** Double-click a bank letter to completely turn that entire bank ON or OFF.
- **Editing an Effect:** Click on one of the 4 effect slots under the active bank. This opens the FX Edit Screen in the display area.
- **Changing Effect Types:** In the FX Edit Screen, click the effect name (e.g., "LPF" or "DELAY") to open the FX Type Picker and choose from 50+ effects.
- **Parameters & Knobs:** Use the virtual knobs to adjust effect settings (Cutoff, Feedback, Pitch, etc.).
- **★ Parameters (Sequenceable):** Any parameter marked with a `★` can be modulated rhythmically using the built-in 16-step FX Sequencer.

### 5. Keyboard Shortcuts

For rapid control, you can use the following keyboard shortcuts:

| Key | Action |
|-----|--------|
| `1`–`5` | Toggle track Record/Play/Overdub |
| `Q`–`T` | Stop track 1-5 |
| `Shift` + `1`–`5` | Clear track 1-5 |
| `Space` | All Start/Stop |
| `Shift` + `Backspace` | All Clear (Wipe all loops) |
| `Z` | Undo |
| `X` | Redo |
| `F1`–`F4` | Toggle Input FX Banks A, B, C, D |
| `F5`–`F8` | Toggle Track FX Banks A, B, C, D |

---

## Technical Architecture

Built with modern web standards:
- **Audio Engine:** Pure Web Audio API standard nodes natively connected in a highly optimized routing graph. Features custom DSP nodes via Worklets and complex graph routing for effects.
- **Frontend Framework:** React 18, utilizing `Strict Mode` for optimized rendering.
- **State Management:** `Zustand` provides separate global stores for Audio Transport, Track states, and FX parameters.
- **Styling:** Tailwind CSS combined with custom CSS variables to create a hardware-authentic "dark mode" interface.
- **Build Tool:** Vite for blazing fast HMR and optimized production bundles.
