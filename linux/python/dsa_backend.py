#!/usr/bin/env python3

import argparse
import sys
import json
import base64
import subprocess
import time
import random
import re
import io
import signal
import os
from pathlib import Path

from PIL import Image
import mss
from groq import Groq


# ============================================================
# CONFIGURATION
# ============================================================

MAX_WIDTH = 1000
DEFAULT_VISION_MODEL = "qwen/qwen3.8-27b"


def parse_args():
    parser = argparse.ArgumentParser(description="ScreenSum DSA Backend")
    parser.add_argument("command", nargs="?", default=None, help="Command to run")
    parser.add_argument("--api-key", default=None, help="Groq API key")
    parser.add_argument("--model", default=None, help="Vision model to use")
    return parser.parse_known_args()


# ============================================================
# PERSISTENT DATA
# ============================================================

# Use ~/.screensum-dsa so data survives across PyInstaller temp dirs
DATA_DIR = Path.home() / ".screensum-dsa"
SCREENSHOTS_DIR = DATA_DIR / "screenshots"
SOLUTION_FILE = DATA_DIR / "solution.txt"
INTERRUPT_FLAG_FILE = DATA_DIR / "interrupt.flag"

DATA_DIR.mkdir(
    parents=True,
    exist_ok=True
)

SCREENSHOTS_DIR.mkdir(
    parents=True,
    exist_ok=True
)


# ============================================================
# INTERRUPT HANDLING
# ============================================================

def check_for_interrupt():
    """
    Check if an interrupt has been requested via a flag file.
    """
    if INTERRUPT_FLAG_FILE.exists():
        INTERRUPT_FLAG_FILE.unlink()  # Delete the flag file
        return True
    return False


def clear_interrupt_flag():
    """
    Clear the interrupt flag file.
    """
    if INTERRUPT_FLAG_FILE.exists():
        try:
            INTERRUPT_FLAG_FILE.unlink()
        except Exception:
            pass


# ============================================================
# SCREEN HELPERS
# ============================================================

def get_screen_size():
    """
    Get screen size.
    """

    with mss.MSS() as sct:
        monitor = sct.monitors[0]

        return (
            monitor["width"],
            monitor["height"]
        )


def move_mouse_to_top_right():
    """
    Move mouse to the top-right corner.
    """

    width, height = get_screen_size()

    x = width - 50
    y = 50

    subprocess.run(
        [
            "xdotool",
            "mousemove",
            str(x),
            str(y),
        ],
        check=False,
    )


# ============================================================
# SCREENSHOT PERSISTENCE
# ============================================================

def get_existing_screenshots():
    """
    Get all saved screenshots.
    """

    return sorted(
        SCREENSHOTS_DIR.glob(
            "screenshot_*.png"
        )
    )


def get_next_screenshot_path():
    """
    Generate the next screenshot filename.
    """

    existing = get_existing_screenshots()

    next_number = len(existing) + 1

    while True:

        filename = (
            f"screenshot_{next_number:03d}.png"
        )

        screenshot_path = (
            SCREENSHOTS_DIR / filename
        )

        if not screenshot_path.exists():
            return screenshot_path

        next_number += 1


def capture_screen():
    """
    Capture the full screen and save it to disk.
    """

    screenshot_path = (
        get_next_screenshot_path()
    )

    with mss.MSS() as sct:

        monitor = sct.monitors[0]

        screenshot = sct.grab(
            monitor
        )

        image = Image.frombytes(
            "RGB",
            screenshot.size,
            screenshot.bgra,
            "raw",
            "BGRX",
        )

        image.save(
            screenshot_path,
            format="PNG"
        )

    screenshots = (
        get_existing_screenshots()
    )

    return {
        "status": "ok",
        "count": len(screenshots),
        "file": str(screenshot_path),
    }


# ============================================================
# IMAGE STITCHING
# ============================================================

def stitch_images():
    """
    Load all screenshots and stitch them vertically.
    """

    screenshot_files = (
        get_existing_screenshots()
    )

    if not screenshot_files:
        return None

    images = []

    for screenshot_file in screenshot_files:

        try:

            image = Image.open(
                screenshot_file
            ).convert("RGB")

            images.append(image)

        except Exception as error:

            print(
                f"Warning: failed to load "
                f"{screenshot_file}: {error}",
                file=sys.stderr
            )

    if not images:
        return None

    total_width = max(
        image.width
        for image in images
    )

    total_height = sum(
        image.height
        for image in images
    )

    stitched = Image.new(
        "RGB",
        (
            total_width,
            total_height
        )
    )

    y_offset = 0

    for image in images:

        stitched.paste(
            image,
            (
                0,
                y_offset
            )
        )

        y_offset += image.height

    # Resize if the image is too wide
    if stitched.width > MAX_WIDTH:

        ratio = (
            MAX_WIDTH /
            stitched.width
        )

        new_height = int(
            stitched.height *
            ratio
        )

        stitched = stitched.resize(
            (
                MAX_WIDTH,
                new_height
            ),
            Image.Resampling.LANCZOS
        )

    buffer = io.BytesIO()

    stitched.save(
        buffer,
        format="PNG"
    )

    return base64.b64encode(
        buffer.getvalue()
    ).decode()


# ============================================================
# GROQ
# ============================================================

def send_to_groq(image_b64, api_key, model):
    """
    Send screenshot to Groq and generate solution.
    """

    client = Groq(
        api_key=api_key
    )

    completion = (
        client.chat.completions.create(
            model=model,

            messages=[
                {
                    "role": "system",
                    "content": "You are an expert programming problem solver. Read the screenshot, identify the selected programming language, and solve the problem in that language. If no language is visible, use C++. Output only complete code with no explanations, markdown, comments."
                },
                {
                    "role": "user",

                    "content": [
                        {
                            "type": "image_url",

                            "image_url": {
                                "url": (
                                    "data:image/png;base64,"
                                    f"{image_b64}"
                                )
                            }
                        }
                    ]
                }
            ],

            temperature=0.05,
            top_p=0.1,
            stream=False,
        )
    )

    response = (
        completion
        .choices[0]
        .message
        .content
    )

    if not response:

        raise RuntimeError(
            "Groq returned an empty response."
        )

    response = response.strip()
    
    # Remove ```cpp ... ```
    cpp_match = re.search(
        r"```cpp\s*(.*?)```",
        response,
        re.DOTALL | re.IGNORECASE
    )

    if cpp_match:

        return (
            cpp_match
            .group(1)
            .strip()
        )

    # Remove generic ``` ... ```
    generic_match = re.search(
        r"```\s*(.*?)```",
        response,
        re.DOTALL
    )

    if generic_match:

        return (
            generic_match
            .group(1)
            .strip()
        )

    # Remove any <think> tags and content
    response = re.sub(r'<think>.*?</think>', '', response, flags=re.DOTALL | re.IGNORECASE)
    
    # Remove any other XML-like tags
    response = re.sub(r'<[^>]+>', '', response)
    
    # Remove any lines that look like thinking
    lines = response.split('\n')
    cleaned_lines = []
    code_started = False
    
    for line in lines:
        if not code_started:
            # Skip lines that look like reasoning
            if any(re.search(pattern, line, re.IGNORECASE) for pattern in [
                r'^<think>',
                r'^Let me think',
                r'^I need to',
                r'^The problem',
                r'^Looking at',
                r'^For this',
                r'^I will',
                r'^Let\'s',
                r'^Wait,',
                r'^Actually,'
            ]):
                continue
            
            # Start collecting when we see code-like content
            if any(keyword in line for keyword in ['#include', 'class Solution', 'using namespace', 'int main']):
                code_started = True
                cleaned_lines.append(line)
        else:
            cleaned_lines.append(line)
    
    if cleaned_lines:
        result = '\n'.join(cleaned_lines).strip()
        if result:
            return result
    
    # If nothing else, return the response with think tags removed
    return response


# ============================================================
# SOLUTION PERSISTENCE
# ============================================================

def save_solution(solution_code):
    """
    Save solution so another Python process can use it.
    """

    SOLUTION_FILE.write_text(
        solution_code,
        encoding="utf-8"
    )


def load_solution():
    """
    Load previously generated solution.
    """

    if not SOLUTION_FILE.exists():
        return None

    solution = (
        SOLUTION_FILE
        .read_text(
            encoding="utf-8"
        )
        .strip()
    )

    if not solution:
        return None

    return solution


# ============================================================
# CLEAR DATA
# ============================================================

def clear_all_data():
    """
    Clear all screenshots and solution file.
    """
    deleted_count = 0

    # Delete all screenshots
    for screenshot_file in get_existing_screenshots():
        try:
            screenshot_file.unlink()
            deleted_count += 1
        except Exception:
            pass

    # Delete solution file
    if SOLUTION_FILE.exists():
        try:
            SOLUTION_FILE.unlink()
        except Exception:
            pass

    # Clear interrupt flag
    clear_interrupt_flag()

    return deleted_count


# ============================================================
# TYPE CODE
# ============================================================


# Human-like tuning
THINK_EVERY_LINES_MIN = 1
THINK_EVERY_LINES_MAX = 2
THINK_PAUSE_MIN = 1.0
THINK_PAUSE_MAX = 2.0


def _report_interrupt():
    print("Typing interrupted by user", file=sys.stderr)


def _interruptible_sleep(seconds):
    """
    Sleep in small slices and return True if interrupt flag is set.
    This keeps long pauses from blocking interrupt detection.
    """
    deadline = time.monotonic() + max(0.0, seconds)

    while True:
        if check_for_interrupt():
            return True

        remaining = deadline - time.monotonic()
        if remaining <= 0:
            return False

        time.sleep(min(0.05, remaining))


def _human_return():
    """
    Press Return like a human:
    - sometimes pause a little before pressing Enter
    - small delay after Enter
    """
    if random.random() < 0.10:
        if _interruptible_sleep(random.uniform(0.18, 0.55)):
            return True

    subprocess.run(["xdotool", "key", "Return"], check=False)
    return _interruptible_sleep(random.uniform(0.12, 0.25))


def type_code_humanlike(code):
    """
    Type code through xdotool with interrupt support and human-like pauses.
    """
    clear_interrupt_flag()

    lines = code.split('\n')
    stripped_lines = []

    for line in lines:
        # NOTE: If indentation matters, use line.rstrip('\n') instead of line.lstrip()
        stripped_lines.append(line.lstrip())

    while stripped_lines and stripped_lines[-1] == '':
        stripped_lines.pop()

    # Select everything
    subprocess.run(["xdotool", "key", "ctrl+a"], check=False)
    if _interruptible_sleep(0.1):
        _report_interrupt()
        return

    # Delete selected text
    subprocess.run(["xdotool", "key", "BackSpace"], check=False)
    if _interruptible_sleep(0.2):
        _report_interrupt()
        return

    if not stripped_lines:
        return

    lines_since_last_pause = 0
    pause_after_lines = random.randint(THINK_EVERY_LINES_MIN, THINK_EVERY_LINES_MAX)

    for line_index, line in enumerate(stripped_lines):
        if check_for_interrupt():
            _report_interrupt()
            return

        # Occasional pause before starting a line, like reading/thinking
        if line_index > 0 and random.random() < 0.12:
            if _interruptible_sleep(random.uniform(0.25, 0.80)):
                _report_interrupt()
                return

        # Empty line: just press Enter if not last line
        if line == "":
            if line_index < len(stripped_lines) - 1:
                if _human_return():
                    _report_interrupt()
                    return

        else:
            # Type each character of the line
            for char in line:
                if check_for_interrupt():
                    _report_interrupt()
                    return

                # Random micro-hesitation
                if random.random() < 0.2:
                    if _interruptible_sleep(random.uniform(0.10, 0.35)):
                        _report_interrupt()
                        return

                # Type characters directly; no special modifier handling for D/S/T
                if char == '\t':
                    subprocess.run(["xdotool", "key", "Tab"], check=False)
                    delay = random.uniform(0.04, 0.08)

                elif char == ' ':
                    subprocess.run(["xdotool", "key", "space"], check=False)
                    delay = random.uniform(0.02, 0.05)

                else:
                    subprocess.run(["xdotool", "type", "--", char], check=False)

                    # Slightly slower for symbols, faster for letters/digits
                    if not char.isalnum():
                        delay = random.uniform(0.05, 0.12)
                    else:
                        delay = random.uniform(0.03, 0.09)

                if _interruptible_sleep(delay):
                    _report_interrupt()
                    return

                # Very small chance of an extra pause after a character
                if random.random() < 0.1:
                    if _interruptible_sleep(random.uniform(0.08, 0.18)):
                        _report_interrupt()
                        return

            # Press Enter after each line except last line
            if line_index < len(stripped_lines) - 1:
                if _human_return():
                    _report_interrupt()
                    return

        # Count only non-empty lines for the main thinking pause
        if line != "":
            lines_since_last_pause += 1

        # Main human-like pause every 2-3 non-empty lines
        if lines_since_last_pause >= pause_after_lines and line_index < len(stripped_lines) - 1:
            if check_for_interrupt():
                _report_interrupt()
                return

            # Main thinking pause: 1-2 seconds
            if _interruptible_sleep(random.uniform(THINK_PAUSE_MIN, THINK_PAUSE_MAX)):
                _report_interrupt()
                return

            # Occasionally add a small extra hesitation
            if random.random() < 0.15:
                if _interruptible_sleep(random.uniform(0.30, 0.90)):
                    _report_interrupt()
                    return

            lines_since_last_pause = 0
            pause_after_lines = random.randint(THINK_EVERY_LINES_MIN, THINK_EVERY_LINES_MAX)

# ============================================================
# SCREENSHOT COMMAND
# ============================================================

def handle_screenshot():

    result = capture_screen()

    print(
        json.dumps(result)
    )


# ============================================================
# SOLVE COMMAND
# ============================================================

def handle_solve(api_key, model):

    screenshot_files = (
        get_existing_screenshots()
    )

    if not screenshot_files:

        print(
            json.dumps(
                {
                    "error":
                        "No screenshots taken yet"
                }
            )
        )

        return

    try:

        print(
            "Preparing screenshots...",
            file=sys.stderr
        )

        image_b64 = stitch_images()

        if not image_b64:

            raise RuntimeError(
                "Failed to prepare screenshots."
            )

        print(
            "Sending screenshot to Groq...",
            file=sys.stderr
        )

        solution_code = (
            send_to_groq(
                image_b64,
                api_key,
                model
            )
        )

        if not solution_code:

            raise RuntimeError(
                "No solution generated."
            )

        # Save solution to disk
        save_solution(
            solution_code
        )

        # Removed: move_mouse_to_top_right()
        # so the mouse stays where the user placed it for typing

        print(
            json.dumps(
                {
                    "status": "ok",
                    "code": solution_code,
                    "screenshots":
                        len(screenshot_files)
                }
            )
        )

    except Exception as error:

        print(
            json.dumps(
                {
                    "error": str(error)
                }
            )
        )


# ============================================================
# TYPE COMMAND
# ============================================================

def handle_type():

    solution_code = (
        load_solution()
    )

    if not solution_code:

        print(
            json.dumps(
                {
                    "error":
                        "No solution generated yet"
                }
            )
        )

        return

    try:

        type_code_humanlike(
            solution_code
        )

        # Auto-clear data after successful typing
        deleted_count = clear_all_data()
        print(
            f"Auto-cleared {deleted_count} screenshots",
            file=sys.stderr
        )

        print(
            json.dumps(
                {
                    "status": "ok",
                    "message":
                        "Typing complete and data cleared",
                    "screenshotsDeleted":
                        deleted_count
                }
            )
        )

    except Exception as error:

        print(
            json.dumps(
                {
                    "error": str(error)
                }
            )
        )


# ============================================================
# CLEAR COMMAND
# ============================================================

def handle_clear():

    deleted_count = clear_all_data()

    print(
        json.dumps(
            {
                "status": "ok",
                "message":
                    "Session cleared",
                "screenshotsDeleted":
                    deleted_count
            }
        )
    )


# ============================================================
# MAIN
# ============================================================

def main():

    args, remaining = parse_args()

    if not args.command:

        print(
            json.dumps(
                {
                    "error":
                        "No command provided"
                }
            )
        )

        return

    command = (
        args.command
        .lower()
        .strip()
    )

    api_key = args.api_key
    model = args.model or DEFAULT_VISION_MODEL

    if command == "screenshot":

        handle_screenshot()

    elif command == "solve":

        if not api_key:

            print(
                json.dumps(
                    {
                        "error":
                            "No API key provided. Configure keys in settings (CapsLock+1)."
                    }
                )
            )

            return

        handle_solve(api_key, model)

    elif command == "type":

        handle_type()

    elif command == "clear":

        handle_clear()

    else:

        print(
            json.dumps(
                {
                    "error":
                        f"Unknown command: {command}"
                }
            )
        )


# ============================================================
# ENTRY POINT
# ============================================================

if __name__ == "__main__":
    main()