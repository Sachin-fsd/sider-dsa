# ScreenSum DSA

This is an Electron app that captures screenshots and auto-types DSA solutions.

## Build Windows .exe on Linux (cross-compilation)

Prerequisites:

- Node 16+ (match Electron version requirements)
- Wine (for building Windows targets on Linux)
- `mingw` toolchain if producing portable executables

Install dependencies:

```bash
npm install
```

Build an installer for Windows:

```bash
npm run dist
```

This uses `electron-builder` and will produce output under `dist/`.

If you don't have Wine, install it on Linux Mint:

```bash
sudo apt update
sudo apt install wine64
```

Generate Windows icons from the included SVG before building:

```bash
# install dev deps (sharp and png-to-ico) if not already
npm install --save-dev sharp png-to-ico

# generate icons (creates icon-*.png and icon.ico in assets/)
npm run generate-icons
```

Notes:

- The app includes `assets/icon.svg` used to generate Windows icons.
- If you want to sign the installer, configure `win.certificateFile` and `win.certificatePassword` in `package.json` or CI secrets.
