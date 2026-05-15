#!/usr/bin/env python3
"""
HTTP 代理服务器
将前端页面的API请求转发到后端 FastAPI 服务
解决前端通过 http.server 直连 FastAPI 的 CORS/端口问题
"""
import http.server
import http.client
import urllib.parse
import json

CONFIG = {
    'backend_host': '192.168.0.56',
    'backend_port': 10023,
}

class ProxyHandler(http.server.BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        self.end_headers()

    def do_GET(self):
        self._proxy('GET')

    def do_POST(self):
        self._proxy('POST')

    def do_PUT(self):
        self._proxy('PUT')

    def do_DELETE(self):
        self._proxy('DELETE')

    def _proxy(self, method):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        # 跳过非API请求
        if not path.startswith('/api/'):
            self.send_error(404, 'Not Found')
            return

        # 读取请求体
        content_length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_length) if content_length > 0 else None

        # 构建转发请求
        headers = {}
        for k, v in self.headers.items():
            if k.lower() not in ('host', 'connection'):
                headers[k] = v
        headers['Host'] = f"{CONFIG['backend_host']}:{CONFIG['backend_port']}"

        try:
            conn = http.client.HTTPConnection(CONFIG['backend_host'], CONFIG['backend_port'], timeout=30)
            conn.request(method, path, body=body, headers=headers)
            resp = conn.getresponse()

            # 转发响应
            self.send_response(resp.status)
            for k, v in resp.getheaders():
                if k.lower() not in ('connection', 'transfer-encoding'):
                    self.send_header(k, v)
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(resp.read())
            conn.close()
        except Exception as e:
            self.send_error(502, f'Proxy error: {e}')

    def log_message(self, format, *args):
        print(f'[Proxy] {args[0]}')

if __name__ == '__main__':
    server_address = ('', 8080)
    httpd = http.server.HTTPServer(server_address, ProxyHandler)
    print(f'HTTP Proxy running on http://localhost:8080')
    print(f'Requesting backend at {CONFIG["backend_host"]}:{CONFIG["backend_port"]}')
    httpd.serve_forever()
