#!/usr/bin/env python3
"""Serve only the public, data-free Chromecast receiver shell."""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent / "cast-receiver"

class ReceiverHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs): super().__init__(*args, directory=str(ROOT), **kwargs)
    def end_headers(self):
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        super().end_headers()

if __name__ == "__main__":
    print("FlipCast receiver listening on port 8790", flush=True)
    ThreadingHTTPServer(("127.0.0.1", 8790), ReceiverHandler).serve_forever()
