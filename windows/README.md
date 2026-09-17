# ScreenSum DSA - Windows Guide

ScreenSum DSA is an automated Data Structures & Algorithms coding assistant that captures problem screenshots and auto-types C++ solutions via Groq AI.

---

## Prerequisites on Windows

Before you start, make sure your Windows PC has:

1. **Node.js** (v18 or higher): Download from [nodejs.org](https://nodejs.org/)
2. **Python** (v3.10 or higher): Download from [python.org](https://www.python.org/)
   - ⚠️ **IMPORTANT during Python setup**: Check the box **"Add python.exe to PATH"** before clicking Install.

---

## Option 1: Running Locally (Development Mode)

If you just want to run the app directly from source on Windows:

### Step 1: Open Command Prompt or PowerShell in the `windows` folder

```cmd
cd path\to\sc-dsa\windows
```

### Step 2: Install Node dependencies

```cmd
npm install
```

### Step 3: Create Python Virtual Environment & Install Dependencies

```cmd
python -m venv venv
venv\Scripts\pip install -r python\requirements.txt
```

### Step 4: Run the App

```cmd
npm start
```

---

## Option 2: Build Standalone Executable (.exe)

Follow these steps to create a single `.exe` file or installer that **contains all Python libraries and Node dependencies bundled inside**. The resulting file can be shared with anyone on Windows, and they can run it without installing Node.js or Python!

### Step 1: Install Node dependencies

```cmd
cd path\to\sc-dsa\windows
npm install
```

### Step 2: Generate Windows Icons (Optional, if modified)

```cmd
npm run generate-icons
```

### Step 3: Build Python Backend & Package `.exe`

Run this single command:

```cmd
npm run dist
```

This will automatically:

1. Create a Python build virtual environment (`python\build-venv`)
2. Install `groq`, `Pillow`, `mss`, `pyautogui`, and `pyinstaller`
3. Bundle `dsa_backend.py` into a standalone `dsa_backend.exe` ELF binary
4. Package the Electron app into Windows installers using `electron-builder`

---

## Where to find the generated files

After running `npm run dist`, look inside the `windows\dist\` folder:

| File                            | Type                    | Description                                                                  |
| ------------------------------- | ----------------------- | ---------------------------------------------------------------------------- |
| `ScreenSum DSA Setup 1.0.0.exe` | **NSIS Installer**      | Standard Windows setup program. Double-click to install.                     |
| `ScreenSum DSA 1.0.0.exe`       | **Portable Executable** | Single standalone `.exe`. Just double-click to run (no installation needed). |

**Shareability:** You can copy either `.exe` file to any Windows computer and it will work immediately out of the box!

---

## Hotkeys

- **CapsLock + 1**: Open Settings (enter/manage Groq API keys)
- **CapsLock + 2**: Take screenshot of problem
- **CapsLock + 4**: Solve problem & auto-type solution into editor
- **CapsLock + `**: Stop typing immediately

---

## Packaging as ZIP (portable distribution)

If you prefer a simple ZIP file for distribution instead of an installer, package the `windows` folder contents produced by `npm run dist` into a ZIP archive.

Steps:

```cmd
cd windows\dist
rem Example: package the portable executable and resources into zip
powershell -command "Compress-Archive -Path 'ScreenSum DSA 1.0.0.exe','resources' -DestinationPath '..\ScreenSum-DSA-1.0.0.zip'"
```

Then share `windows\ScreenSum-DSA-1.0.0.zip` with users; they can extract and run the portable `.exe` inside.
