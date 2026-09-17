# ScreenSum DSA - Linux Guide

ScreenSum DSA is an automated Data Structures & Algorithms coding assistant for Linux Mint and other Linux distributions. It captures problem screenshots via global hotkeys and auto-types C++ solutions using Groq AI.

---

## System Requirements

- **Linux OS**: Linux Mint, Ubuntu, Debian, or derivative
- **Dependencies**: `xdotool` (used for simulated human typing)
  ```bash
  sudo apt update
  sudo apt install xdotool
  ```

---

## Running Locally (Development Mode)

### Step 1: Install Node.js dependencies

```bash
cd linux/
npm install
```

### Step 2: Set up Python virtual environment

```bash
python3 -m venv venv
venv/bin/pip install -r python/requirements.txt
```

### Step 3: Run the application

```bash
npm start
```

---

## Building Portable AppImage (Shareable Linux App)

To package ScreenSum DSA into a standalone **AppImage** that contains all Python dependencies and libraries pre-bundled (so anyone on Linux can run it with a single click):

```bash
cd linux/
npm run dist
```

This command will:

1. Build the bundled PyInstaller backend (`python/dsa_backend`)
2. Package the Electron frontend and bundled backend into an AppImage
3. Output the standalone binary to `dist/ScreenSum DSA-1.0.0.AppImage`

### How to use the generated AppImage:

```bash
chmod +x "dist/ScreenSum DSA-1.0.0.AppImage"
./"dist/ScreenSum DSA-1.0.0.AppImage"
```

---

## Hotkeys

- **CapsLock + 1**: Open Settings (Groq API Key management with round-robin rotation)
- **CapsLock + 2**: Take screenshot
- **CapsLock + 4**: Solve problem & auto-type solution into code editor
- **CapsLock + `**: Stop typing immediately
