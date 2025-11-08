from __future__ import annotations

import uvicorn
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, PlainTextResponse

# 复用现有扫描逻辑（兼容直接以脚本运行与模块方式运行）
try:
    # 当以模块方式运行：python -m scripts.local_scanner_server
    from .scan import scan_lan_devices
except Exception:
    # 当以脚本方式运行：python scripts/local_scanner_server.py
    from scan import scan_lan_devices  # type: ignore

app = FastAPI(title="本地局域网扫描助手", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def add_private_network_header(request: Request, call_next):
    # 避免浏览器触发的 Private Network Access (PNA) 预检阻断
    response = await call_next(request)
    response.headers["Access-Control-Allow-Private-Network"] = "true"
    return response


@app.get("/", response_class=HTMLResponse)
def index():
    # 提供简单主页，避免访问根路径出现 404 造成“运行失败”的误解
    return """<!doctype html>
<html lang="zh-CN">
<meta charset="utf-8">
<title>本地局域网扫描助手</title>
<style>
body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;padding:24px;line-height:1.6}
code{background:#f4f4f5;padding:2px 4px;border-radius:4px}
ul{margin:8px 0 0 20px}
.hint{color:#555}
</style>
<h1>本地局域网扫描助手</h1>
<p class="hint">服务已启动。请使用以下接口：</p>
<ul>
  <li>健康检查：<a href="/health"><code>/health</code></a></li>
  <li>执行扫描：<a href="/scan"><code>/scan</code></a></li>
  <li>默认监听：<code>http://127.0.0.1:47832</code></li>
  <li>提示：如扫描结果为空，请以管理员权限运行以允许 ARP（macOS/Linux 建议使用 <code>sudo</code>）。</li>
  <li>本页面仅用于说明，前端会自动调用 <code>/scan</code> 获取数据。</li>
  </ul>
</html>"""


@app.get("/favicon.ico")
def favicon():
    return PlainTextResponse(status_code=204)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/scan")
def scan():
    """
    触发一次本机所在局域网的扫描，输出结构与后端 /api/tasks/network-scan 尽量保持一致：
    {
        "message": "...",
        "networks": [...],
        "devices": [...],
        "groups": [
            { "key": "camera", "label": "摄像头", "count": N, "devices": [...] },
            ...
        ]
    }
    """
    result = scan_lan_devices()
    devices = result.get("devices", [])
    networks = result.get("networks", [])
    groups = result.get("groups", {})

    label_map = {
        "camera": "摄像头",
        "computer": "计算机/服务器",
        "printer": "打印机",
        "network": "网络设备",
        "iot": "物联网设备",
        "unknown": "未知设备",
    }
    grouped = []
    for key, items in groups.items():
        grouped.append(
            {
                "key": key,
                "label": label_map.get(key, key),
                "count": len(items),
                "devices": [
                    {
                        "name": item.get("name"),
                        "ip": item.get("ip"),
                        "mac": item.get("mac"),
                        "hostname": item.get("hostname"),
                        "open_ports": item.get("open_ports", []),
                    }
                    for item in items
                ],
            }
        )

    return {
        "message": f"本地扫描完成，发现 {len(devices)} 台设备（{', '.join(networks) or '未知网段'}）",
        "networks": networks,
        "devices": devices,
        "groups": grouped,
    }


if __name__ == "__main__":
    # 默认监听本机回环端口
    uvicorn.run("scripts.local_scanner_server:app", host="127.0.0.1", port=47832, reload=False)


