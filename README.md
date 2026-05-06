# VascuAR — Patient-Specific AR Surgical Planning

> **Hack for Health Hackathon · Chattogram, Bangladesh · 2026**

> *"ChatGPT can't render a 3D model of the tumor in Bed 4. VascuAR does — right in the browser, in under 60 seconds, for pre-surgical planning."*

---

## What is VascuAR?

VascuAR is a **100% browser-based** tool that converts a patient's CT or MRI DICOM scan directly into an interactive, color-coded 3D anatomical model — no installation, no backend server, no patient data leaving the device. Clinicians upload the raw `.dcm` files from their workstation, and VascuAR extracts vascular trees, tumor nodules, and bone structure in real time using an in-browser segmentation pipeline. The resulting 3D model can be rotated, dissected with a clip plane, and viewed in augmented reality on an Android device.

---

## Screenshots

| Upload Screen | 3D Viewer — Demo Phantom | Multi-file Series |
|:---:|:---:|:---:|
| Upload a single `.dcm` or an entire series folder | Color-coded anatomy: red vessels, orange tumors, grey bone | Batch-parse 50–300 slice CT series |

---

## Features

| Feature | Details |
|---|---|
| 📂 **Multi-file DICOM upload** | Select individual `.dcm` files (Ctrl+click for hundreds), entire folders, or drag-and-drop a batch |
| 🧠 **In-browser segmentation** | HU-threshold masking → Gaussian blur → Surface Nets mesh extraction → Laplacian smoothing — all in a Web Worker, UI never freezes |
| 🎨 **3D Anatomy viewer** | Babylon.js WebGL2 renderer with 3-point medical lighting, specular highlights, auto-framing camera |
| ✂️ **Clip plane tool** | Axially slice through the model with a draggable slider to inspect internal anatomy |
| 👁 **Layer toggles** | Independently show/hide vessels, tumor, and bone |
| 📷 **AR info badge** | Prepared for WebXR immersive-ar on Android Chrome + HTTPS |
| 📰 **PubMed sidebar** | Fetches live relevant clinical literature based on modality and study description |
| 🔒 **Zero telemetry** | All processing is entirely client-side. No pixel of patient data is ever sent to any server |
| 📱 **Mobile-first responsive** | Full-screen 3D viewer on phones; slide-up control panel via ⚙ button |
| 🧪 **Built-in demo phantom** | Synthetic abdominal CT with aorta, renal vessels, and tumor nodules — no files needed |

---

## Technology Stack

| Layer | Technology |
|---|---|
| **Framework** | React 19 + TypeScript |
| **Build tool** | Vite 8 |
| **3D rendering** | Babylon.js v9 (WebGL2) |
| **DICOM parsing** | `dicom-parser` |
| **Segmentation** | Custom Web Worker (HU threshold → blur → Surface Nets → Laplacian smoothing) |
| **Styling** | Tailwind CSS v4 + custom CSS design system |
| **AR** | WebXR `immersive-ar` (Android Chrome + HTTPS) |
| **Literature** | PubMed E-utilities API |

---

## Architecture Overview

```
Browser
│
├── Main Thread (React)
│   ├── App.tsx            — State machine: upload → processing → viewer
│   ├── UploadZone         — Multi-file / folder picker + drag-and-drop
│   ├── BabylonCanvas      — WebGL2 scene, camera, lighting, mesh management
│   ├── ControlPanel       — Layer toggles + clip plane slider
│   ├── SlicePreview       — 2D axial DICOM thumbnail (windowed grayscale)
│   ├── PubMedSidebar      — Live PubMed article fetch
│   └── ProgressOverlay    — Worker progress bar
│
├── Web Worker
│   └── segmentation.worker.ts
│       ├── Step 1: Downsample volume 2× (performance)
│       ├── Step 2: HU-threshold binary masks (vessels / tumor / bone)
│       ├── Step 3: Gaussian blur (smooth boundaries)
│       ├── Step 4: Surface Nets mesh extraction (manifold geometry)
│       └── Step 5: Taubin-Laplacian smoothing (8 / 4 passes)
│
└── Library Layer (src/lib/)
    ├── dicomParser.ts     — Single-file + multi-file slice parser, HU conversion, preview render
    ├── syntheticPhantom.ts — Deterministic synthetic CT volume for demo
    └── pubmedApi.ts       — PubMed E-utilities search
```

---

## Segmentation Pipeline

Each tissue type is extracted independently using Hounsfield Unit ranges derived from clinical CT standards:

| Tissue | HU Range | Color | Clinical Significance |
|---|---|---|---|
| **Vessels** | 150 – 400 HU | 🔴 Red | Aorta, renal arteries, vascular tree |
| **Tumor** | 20 – 80 HU | 🟠 Orange | Soft tissue masses, nodules |
| **Bone** | 400 – 4000 HU | ⬜ Grey (transparent) | Skeletal reference frame |

The pipeline runs entirely off the main thread via a **Web Worker** and communicates results via transferable `ArrayBuffer` objects (zero-copy).

---

## Multi-File DICOM Series Support

Real CT scans consist of 50–300 individual `.dcm` files — one per axial slice. VascuAR handles this correctly:

1. **Parse in parallel** — Files are read in batches of 20 using `Promise.all`
2. **Sort by anatomy** — Slices are ordered by DICOM `InstanceNumber` tag (0020,0013), with `ImagePositionPatient` z-axis (0020,0032) as a fallback
3. **Validate dimensions** — Ensures all slices have identical width × height
4. **Assemble volume** — Concatenates HU arrays into a single `Float32Array` volume
5. **Run segmentation** — Full 3D pipeline on the assembled volume

---

## Getting Started

### Prerequisites

- **Node.js** v18 or higher
- **npm** v9 or higher
- A modern Chromium-based browser (Chrome 120+, Edge 120+)

### Installation

```bash
# Clone the repository
git clone <your-repo-url>
cd Medical_heckathon

# Install dependencies
npm install
```

### Development Server

```bash
npm run dev
```

The app will be available at:
- **Local:** `http://localhost:5173`
- **Network (for Android testing):** `http://<your-ip>:5173`

> **Note:** The Vite dev server is configured with `host: true` — your phone on the same Wi-Fi network can access the app directly.

### Production Build

```bash
npm run build
npm run preview   # Preview the production build locally
```

---

## Usage Guide

### Loading a DICOM Scan

**Option A — Multi-slice CT series (recommended for full 3D):**
1. Click **Select Files (.dcm)** → hold `Ctrl` and select all `.dcm` files from your CT series folder
2. *Or* click **Select Folder** → select the entire series directory

**Option B — Single `.dcm` file:**
1. Click **Select Files (.dcm)** and pick one file
2. VascuAR will display a warning that only 1 slice was found and advise uploading a series

**Option C — Demo Phantom:**
1. Click **Load Demo Phantom (no file needed)**
2. A synthetic abdominal CT volume loads instantly — no real patient data required

### Interacting with the 3D Model

| Action | How |
|---|---|
| **Rotate** | Click + drag on the canvas |
| **Zoom** | Scroll wheel / pinch on mobile |
| **Pan** | Right-click + drag |
| **Toggle layers** | ⚙ button → Layer checkboxes (Vessels / Tumor / Bone) |
| **Clip plane** | ⚙ button → "Clip Plane" slider |
| **New scan** | Click **↩ New Scan** in the header |

---

## Obtaining Real DICOM Test Data

To test with real CT data, download a free dataset from **[The Cancer Imaging Archive (TCIA)](https://www.cancerimagingarchive.net/)**:

1. Go to [cancerimagingarchive.net](https://www.cancerimagingarchive.net/)
2. Browse collections → choose any public CT study (e.g., *CT Colonography*, *LIDC-IDRI*)
3. Download a series — you'll receive a folder of `.dcm` files
4. In VascuAR, click **Select Folder** and point to the downloaded folder

---

## Deployment

### Deploy to Vercel (Recommended)

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel --prod
```

Vercel provides an HTTPS domain automatically — required for WebXR AR sessions on Android Chrome.

### Deploy to Netlify

```bash
npm run build
# Drag-and-drop the `dist/` folder to app.netlify.com
```

### LAN Testing on Android (Development)

```bash
npm run dev
# Note the "Network:" URL in the terminal output
# Open that URL in Chrome on your Android phone
```

> **WebXR AR** requires HTTPS. For local Android testing without deploying, use `localtunnel`:
> ```bash
> npx localtunnel --port 5173
> ```

---

## Project Structure

```
Medical_heckathon/
├── index.html                  # App shell, mobile viewport meta, Google Fonts
├── vite.config.ts              # Vite config: Web Worker support, COOP headers, LAN host
├── package.json
├── tsconfig.app.json
│
├── public/
│   └── favicon.svg
│
└── src/
    ├── main.tsx                # React entry point
    ├── App.tsx                 # Root component, state machine, worker orchestration
    ├── index.css               # Global design system (glassmorphism, gradients, animations)
    │
    ├── components/
    │   ├── BabylonCanvas.tsx   # WebGL2 3D scene with auto-framing camera
    │   ├── UploadZone.tsx      # Multi-file + folder DICOM picker + drag-drop
    │   ├── ControlPanel.tsx    # Layer toggles and clip plane slider
    │   ├── SlicePreview.tsx    # 2D axial slice thumbnail (compact + full size)
    │   ├── ProgressOverlay.tsx # Animated segmentation progress bar
    │   ├── PubMedSidebar.tsx   # Live PubMed article results
    │   ├── ARButton.tsx        # AR info badge (WebXR on Android Chrome)
    │   ├── ARCameraOverlay.tsx # getUserMedia camera feed component
    │   └── PrivacyBadge.tsx   # "Data stays on your device" indicator
    │
    ├── lib/
    │   ├── dicomParser.ts      # DICOM buffer parser, multi-slice parser, HU conversion
    │   ├── syntheticPhantom.ts # Procedural synthetic CT volume for demo mode
    │   └── pubmedApi.ts        # PubMed E-utilities REST client
    │
    └── workers/
        └── segmentation.worker.ts   # Off-thread segmentation pipeline
```

---

## Privacy & Data Security

VascuAR is engineered with **privacy-by-design**:

- ✅ All DICOM processing runs entirely in your browser — no data leaves your machine
- ✅ No user accounts, no analytics, no cookies
- ✅ Patient metadata (name, DOB, ID) is never read, stored, or displayed
- ✅ The PubMed API query uses only the anonymous study description (e.g., "CT Abdominal"), never patient details
- ✅ Works fully offline after initial page load (except PubMed literature fetch)

---

## Hackathon Context

**Event:** Hack for Health 2026 — Chattogram, Bangladesh  
**Category:** Clinical Decision Support / Surgical Planning  
**Track:** AI-Assisted Diagnostics  

### Problem Statement

In resource-constrained hospitals across South and Southeast Asia, pre-surgical 3D planning tools either:
- Require expensive proprietary workstations (Mimics, 3D Slicer + GPU server)
- Are too slow for emergency or urgent surgical decisions
- Have no pathway to AR visualization at the patient bedside

### Our Solution

VascuAR runs entirely in a standard browser tab — on any laptop or Android tablet already on the ward. A surgeon uploads the patient's CT scan, gets a patient-specific 3D model in under 60 seconds, and can interact with it at the bedside before incision.

### Key Technical Differentiators

1. **Zero-install:** Runs in any Chrome tab — no Python, no CUDA, no GPU server
2. **Patient-specific:** Unlike generic anatomy apps, VascuAR renders the exact anatomy of *this* patient's scan
3. **Sub-60-second pipeline:** Web Worker + 2× downsampling + Surface Nets delivers results fast
4. **Fully private:** DICOM data never leaves the device — critical for hospital compliance

---

## Known Limitations

| Limitation | Mitigation |
|---|---|
| Single `.dcm` file = 2D only | Clear warning + guidance to upload full series |
| HU thresholds tuned for abdominal CT | May need adjustment for chest, brain, or contrast-enhanced scans |
| WebXR AR requires HTTPS + Android Chrome | Vercel/Netlify deployment provides HTTPS automatically |
| Large series (300+ slices) may be slow on low-RAM devices | 2× downsampling reduces volume to 25% of original size |
| No DICOM SEG or RT-STRUCT support | Planned for v2 |

---

## Roadmap (Post-Hackathon)

- [ ] DICOM series ZIP upload (single archive → auto-extract)
- [ ] Contrast-enhanced CT window presets (arterial, venous, portal phases)
- [ ] Measurement tools (ruler, volume calculator)
- [ ] DICOM SR annotation export
- [ ] Side-by-side 2D MPR + 3D linked view
- [ ] PWA (installable offline app)
- [ ] Native WebXR AR on Android Chrome over HTTPS

---

## Contributing

Pull requests are welcome! Please:

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Commit your changes: `git commit -m 'feat: add my feature'`
4. Push to the branch: `git push origin feature/my-feature`
5. Open a Pull Request

---

## License

MIT License — see [LICENSE](./LICENSE) for details.

---

## Team

Built with ❤️ for the **Hack for Health 2026** hackathon in Chattogram, Bangladesh.

---

*VascuAR · Babylon.js WebGL2 · 100% client-side · Zero patient data transmitted*
