#!/usr/bin/env python3
"""
VOICEVOX ローカルプロキシ
Mac上で動かすと、外部からの接続をlocalhost:50021に中継します。
使い方: python3 voicevox-proxy.py
"""

import http.server
import urllib.request
import urllib.error

VOICEVOX_URL = "http://localhost:50021"
LISTEN_PORT = 50022


class ProxyHandler(http.server.BaseHTTPRequestHandler):
    def proxy(self, body=None):
        url = VOICEVOX_URL + self.path
        method = self.command
        headers = {
            "Host": "localhost",
            "Content-Type": self.headers.get("Content-Type", "application/json"),
        }
        req = urllib.request.Request(url, data=body, method=method, headers=headers)
        try:
            resp = urllib.request.urlopen(req)
            self.send_response(resp.status)
            for k, v in resp.headers.items():
                if k.lower() not in ("transfer-encoding",):
                    self.send_header(k, v)
            self.end_headers()
            self.wfile.write(resp.read())
        except urllib.error.HTTPError as e:
            self.send_response(e.code)
            self.end_headers()
            self.wfile.write(e.read())

    def do_GET(self):
        self.proxy()

    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length) if length else None
        self.proxy(body)

    def log_message(self, fmt, *args):
        pass  # ログ抑制


if __name__ == "__main__":
    server = http.server.HTTPServer(("0.0.0.0", LISTEN_PORT), ProxyHandler)
    print(f"VOICEVOX プロキシ起動中: ポート {LISTEN_PORT} → localhost:50021")
    print("停止するには Ctrl+C")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("停止しました")
