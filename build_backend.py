#!/usr/bin/env python3
"""
Backend build script - Use PyInstaller to package FastAPI backend as a single executable.

Usage:
  python build_backend.py          # Build for current platform
  python build_backend.py --clean  # Clean and rebuild
"""

import os
import sys
import shutil
import subprocess
import argparse

ROOT = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.join(ROOT, "backend")
DIST_DIR = os.path.join(ROOT, "dist-backend")


def clean():
    """Clean build artifacts."""
    paths = [
        os.path.join(BACKEND_DIR, "build"),
        os.path.join(BACKEND_DIR, "dist"),
        os.path.join(BACKEND_DIR, "*.spec"),
        DIST_DIR,
    ]
    for p in paths:
        if "*" in p:
            import glob
            for f in glob.glob(p):
                shutil.rmtree(f, ignore_errors=True)
        elif os.path.exists(p):
            shutil.rmtree(p, ignore_errors=True)
    print("Build artifacts cleaned")


def build():
    """Execute PyInstaller packaging."""
    os.chdir(BACKEND_DIR)

    # PyInstaller arguments
    # --onefile: Single executable file
    # --name: Output filename
    # --hidden-import: Implicitly imported modules
    # --add-data: Add data files (if needed)
    cmd = [
        sys.executable, "-m", "PyInstaller",
        "--onefile",
        "--name", "bookweaver-backend",
        # Hidden imports (modules not auto-detected by PyInstaller)
        "--hidden-import", "uvicorn.logging",
        "--hidden-import", "uvicorn.loops",
        "--hidden-import", "uvicorn.loops.auto",
        "--hidden-import", "uvicorn.protocols",
        "--hidden-import", "uvicorn.protocols.http",
        "--hidden-import", "uvicorn.protocols.http.auto",
        "--hidden-import", "uvicorn.protocols.websockets",
        "--hidden-import", "uvicorn.protocols.websockets.auto",
        "--hidden-import", "uvicorn.lifespan",
        "--hidden-import", "uvicorn.lifespan.on",
        # Entry file
        "main.py",
    ]

    print(f"Executing: {' '.join(cmd)}")
    subprocess.check_call(cmd)

    # Move output to dist-backend in project root
    os.chdir(ROOT)
    os.makedirs(DIST_DIR, exist_ok=True)

    src = os.path.join(BACKEND_DIR, "dist", "bookweaver-backend")
    if sys.platform == "win32":
        src += ".exe"
        dst = os.path.join(DIST_DIR, "bookweaver-backend.exe")
    else:
        dst = os.path.join(DIST_DIR, "bookweaver-backend")

    if os.path.exists(src):
        shutil.copy2(src, dst)
        os.chmod(dst, 0o755)
        print(f"Build completed: {dst}")
    else:
        print(f"Error: Build artifact not found at {src}")
        sys.exit(1)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Build BookWeaver backend")
    parser.add_argument("--clean", action="store_true", help="Clean and rebuild")
    args = parser.parse_args()

    if args.clean:
        clean()

    build()
