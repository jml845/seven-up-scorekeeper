#!/usr/bin/env python3
"""Capture the local FlipCast beta landing page at a mobile viewport."""

import base64
import json
import shutil
import subprocess
import tempfile
import time
import urllib.request
from pathlib import Path

import websocket


PORT = 19384
URL = "http://127.0.0.1:8787/?campaign=launch_preview"
OUTPUT = Path(__file__).with_name("build85-home.png")


def wait_targets(timeout=10):
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(f"http://127.0.0.1:{PORT}/json/list", timeout=1) as response:
                return json.load(response)
        except Exception:
            time.sleep(0.1)
    raise RuntimeError("Chrome DevTools did not start")


def main():
    profile = tempfile.mkdtemp(prefix="flipcast-launch-capture-")
    chrome = subprocess.Popen(
        [
            shutil.which("google-chrome-stable") or shutil.which("chromium"),
            "--headless=new",
            "--no-sandbox",
            "--disable-gpu",
            "--disable-background-networking",
            "--remote-allow-origins=*",
            f"--remote-debugging-port={PORT}",
            f"--user-data-dir={profile}",
            "about:blank",
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    try:
        page = next(target for target in wait_targets() if target["type"] == "page")
        ws = websocket.create_connection(page["webSocketDebuggerUrl"], timeout=10)
        sequence = 0

        def command(method, params=None):
            nonlocal sequence
            sequence += 1
            ws.send(json.dumps({"id": sequence, "method": method, "params": params or {}}))
            while True:
                reply = json.loads(ws.recv())
                if reply.get("id") == sequence:
                    if "error" in reply:
                        raise RuntimeError(reply["error"])
                    return reply.get("result", {})

        command("Page.enable")
        command("Runtime.enable")
        command(
            "Emulation.setDeviceMetricsOverride",
            {"width": 390, "height": 844, "deviceScaleFactor": 1, "mobile": True},
        )
        command("Page.navigate", {"url": URL})
        deadline = time.time() + 10
        while time.time() < deadline:
            result = command(
                "Runtime.evaluate",
                {"expression": "document.readyState === 'complete' && Boolean(document.querySelector('.beta-invite'))", "returnByValue": True},
            )
            if result.get("result", {}).get("value"):
                break
            time.sleep(0.1)
        else:
            raise RuntimeError("FlipCast beta landing page did not render")
        metrics = command(
            "Runtime.evaluate",
            {"expression": "({innerWidth,clientWidth:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth,arrowPath:document.querySelector('.cast-arrow-overlay path')?.getAttribute('d'),arrowHead:document.querySelector('.cast-arrow-overlay polyline')?.getAttribute('points'),pointer:[...Object.values(document.querySelector('.hero-cast-pointer')?.getBoundingClientRect()||{})].slice(0,4),launcher:[...Object.values(document.querySelector('.cast-launcher')?.getBoundingClientRect()||{})].slice(0,4)})", "returnByValue": True},
        )["result"]["value"]
        if metrics["scrollWidth"] > metrics["clientWidth"]:
            raise RuntimeError(f"Mobile landing page overflows horizontally: {metrics}")
        time.sleep(2.3)
        image = command("Page.captureScreenshot", {"format": "png", "captureBeyondViewport": False})
        OUTPUT.write_bytes(base64.b64decode(image["data"]))
        print(json.dumps(metrics, sort_keys=True))
        ws.close()
    finally:
        chrome.terminate()
        try:
            chrome.wait(timeout=5)
        except subprocess.TimeoutExpired:
            chrome.kill()
        shutil.rmtree(profile, ignore_errors=True)


if __name__ == "__main__":
    main()
