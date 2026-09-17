# ScreenSum DSA

ScreenSum DSA is an automated Data Structures & Algorithms coding assistant built with Electron and Python (powered by Groq AI vision models).

---

## Directory Structure

```
sc-dsa/
├── linux/              # Complete Linux application source & build scripts
│   ├── README.md       # Linux guide (local run & AppImage creation)
│   ├── main.js
│   ├── package.json
│   └── python/
└── windows/            # Complete Windows application source & build scripts
    ├── README.md       # Windows guide (local run & .exe installer creation)
    ├── main.js
    ├── package.json
    └── python/
```

---

## Quick Links

- **Linux Users**: See [linux/README.md](linux/README.md) for instructions on running locally on Linux Mint / Ubuntu or building a portable `.AppImage`.
- **Windows Users**: See [windows/README.md](windows/README.md) for instructions on running locally on Windows PC or building a standalone `.exe` installer.

---

## Features

- **Multi-API Key Rotation**: Add up to 10 Groq API keys in UI. Automatically rotates one key per request so no rate limits are hit.
- **Global Hotkeys**:
- **Global Hotkeys**:
  - `CapsLock + 1`: Open Settings
  - `CapsLock + 2`: Take screenshot
  - `CapsLock + 4`: Solve DSA problem & human-like auto-type into code editor
  - `CapsLock + \``: Stop typing mid-stream
- **Vision AI Support**: Choice of Qwen 3.8 27B, Llama 4 Scout 17B, or Llama 4 Maverick 17B models.
