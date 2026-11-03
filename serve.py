#!/usr/bin/env python3
"""Static server with HTTP Range so the projector video can be scrubbed.

The movie lives on Google Drive (public link) so it is not part of the repo.
Drive refuses to play that file inside a page on another site, so /drive-video
fetches it here and hands the browser a same-origin stream with Range.

    python3 serve.py
"""
import os
import urllib.error
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

PORT = 8765
# Public file: https://drive.google.com/file/d/1uYMNQnEjW007vGKgWoXPV8sLHWUYRLqR/view
DRIVE_VIDEO = "https://drive.usercontent.google.com/download?id=1uYMNQnEjW007vGKgWoXPV8sLHWUYRLqR&export=download&confirm=t"


class RangeHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def do_GET(self):
        if self.path.split("?", 1)[0] == "/drive-video":
            self.proxy_drive()
            return
        range_header = self.headers.get("Range")
        if not range_header:
            return super().do_GET()
        path = self.translate_path(self.path.split("?", 1)[0])
        if not os.path.isfile(path):
            return super().do_GET()
        size = os.path.getsize(path)
        spec = range_header.strip()
        if not spec.startswith("bytes="):
            return super().do_GET()
        start_s, _, end_s = spec[6:].split(",", 1)[0].partition("-")
        try:
            if start_s == "":
                length = int(end_s)
                start = max(0, size - length)
                end = size - 1
            else:
                start = int(start_s)
                end = int(end_s) if end_s else size - 1
        except ValueError:
            return super().do_GET()
        if start < 0 or start >= size:
            self.send_error(416, "Requested Range Not Satisfiable")
            return
        end = min(end, size - 1)
        length = end - start + 1
        try:
            file_obj = open(path, "rb")
        except OSError:
            self.send_error(404)
            return
        file_obj.seek(start)
        self.send_response(206)
        self.send_header("Content-Type", self.guess_type(path))
        self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        self.send_header("Content-Length", str(length))
        self.end_headers()
        remaining = length
        try:
            while remaining > 0:
                chunk = file_obj.read(min(65536, remaining))
                if not chunk:
                    break
                self.wfile.write(chunk)
                remaining -= len(chunk)
        except (BrokenPipeError, ConnectionResetError):
            pass
        finally:
            file_obj.close()

    def proxy_drive(self):
        headers = {"User-Agent": "rumor-simulacion"}
        if self.headers.get("Range"):
            headers["Range"] = self.headers["Range"]
        req = urllib.request.Request(DRIVE_VIDEO, headers=headers)
        try:
            upstream = urllib.request.urlopen(req, timeout=120)
        except urllib.error.HTTPError as err:
            if err.code not in (200, 206):
                self.send_error(502, "Drive no entregó el video")
                return
            upstream = err
        except OSError:
            self.send_error(502, "Drive no respondió")
            return
        status = getattr(upstream, "status", None) or upstream.getcode()
        self.send_response(status)
        self.send_header("Content-Type", "video/quicktime")
        self.send_header("Accept-Ranges", "bytes")
        for key in ("Content-Length", "Content-Range"):
            value = upstream.headers.get(key)
            if value:
                self.send_header(key, value)
        self.end_headers()
        try:
            while True:
                chunk = upstream.read(65536)
                if not chunk:
                    break
                self.wfile.write(chunk)
        except (BrokenPipeError, ConnectionResetError):
            pass
        finally:
            upstream.close()


if __name__ == "__main__":
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    server = ThreadingHTTPServer(("127.0.0.1", PORT), RangeHandler)
    print(f"http://127.0.0.1:{PORT}/")
    server.serve_forever()
