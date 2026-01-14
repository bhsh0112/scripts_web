import { detectOS } from "./os.js";

/**
 * 生成“本地扫描助手”内联 Python 代码（自包含，独立运行）。
 * @returns {string}
 */
export const buildEmbeddedLocalScannerPython = () => {
  // 注意：尽量保持为单文件，便于通过 heredoc/bat 直接运行
  return String.raw`from __future__ import annotations

import socket
import ipaddress
from typing import Dict, List, Optional, Set, Tuple

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

try:
    import scapy.all as scapy  # type: ignore
except Exception as exc:
    raise SystemExit("未安装 scapy，请检查依赖安装是否成功") from exc

try:
    import netifaces as ni  # type: ignore
except Exception:
    ni = None  # 允许缺少 netifaces，回退方案继续工作


def get_my_ip() -> Optional[str]:
    if ni is not None:
        try:
            gateway = ni.gateways().get("default", {})
            gw_v4 = gateway.get(ni.AF_INET)
            if gw_v4:
                gateway_interface = gw_v4[1]
                my_ip = ni.ifaddresses(gateway_interface)[ni.AF_INET][0]["addr"]
                return my_ip
        except Exception:
            pass
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("8.8.8.8", 80))
            return s.getsockname()[0]
    except Exception:
        return None


def _cidr_from_addr_mask(addr: str, netmask: str) -> Optional[str]:
    try:
        network = ipaddress.IPv4Network(f"{addr}/{netmask}", strict=False)
        if network.prefixlen >= 32:
            return None
        if network.network_address.is_loopback or network.network_address.is_link_local:
            return None
        return str(network)
    except Exception:
        return None


def get_all_networks() -> List[str]:
    cidrs: Set[str] = set()
    if ni is not None:
        try:
            for iface in ni.interfaces():
                addrs = ni.ifaddresses(iface).get(ni.AF_INET, [])
                for item in addrs:
                    addr = item.get("addr")
                    mask = item.get("netmask")
                    if addr and mask:
                        cidr = _cidr_from_addr_mask(addr, mask)
                        if cidr:
                            cidrs.add(cidr)
        except Exception:
            pass
    if not cidrs:
        my_ip = get_my_ip()
        if my_ip:
            ip_parts = my_ip.split(".")
            cidrs.add(f"{ip_parts[0]}.{ip_parts[1]}.{ip_parts[2]}.1/24")
    return sorted(cidrs)


def scan_network(network_range: str) -> List[Dict[str, str]]:
    try:
        arp_request = scapy.ARP(pdst=network_range)
        broadcast = scapy.Ether(dst="ff:ff:ff:ff:ff:ff")
        arp_request_broadcast = broadcast / arp_request
        answered_list = scapy.srp(arp_request_broadcast, timeout=1.2, verbose=False)[0]
        devices: List[Dict[str, str]] = []
        for _sent, received in answered_list:
            devices.append({"ip": received.psrc, "mac": received.hwsrc})
        return devices
    except Exception:
        return []


def _resolve_hostname(ip: str) -> Optional[str]:
    try:
        hostname, _, _ = socket.gethostbyaddr(ip)
        return hostname
    except Exception:
        return None


def _check_tcp_port(ip: str, port: int, timeout: float = 0.3) -> bool:
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            sock.settimeout(timeout)
            result = sock.connect_ex((ip, port))
            return result == 0
    except Exception:
        return False


_PORTS_PROFILE: Tuple[int, ...] = (22, 80, 443, 554, 8000, 8080, 139, 445, 9100, 1883, 8883)


def _classify_device(hostname: Optional[str], open_ports: List[int]) -> str:
    hn = (hostname or "").lower()
    ports = set(open_ports)
    if 554 in ports or 8000 in ports or "cam" in hn or "ipcam" in hn or "hik" in hn or "dahua" in hn:
        return "camera"
    if 9100 in ports or "printer" in hn or "hp" in hn or "canon" in hn or "epson" in hn:
        return "printer"
    if 445 in ports or 139 in ports or 22 in ports or "mac" in hn or "win" in hn or "desktop" in hn or "laptop" in hn:
        return "computer"
    if (80 in ports or 443 in ports or 8080 in ports) and (1883 in ports or 8883 in ports or "iot" in hn):
        return "iot"
    if (80 in ports or 443 in ports or 8080 in ports) and not (22 in ports or 445 in ports or 139 in ports):
        if "router" in hn or "switch" in hn or "gw" in hn or "ap" in hn:
            return "network"
    return "unknown"


def scan_lan_devices() -> Dict[str, object]:
    networks = get_all_networks()
    seen_ips: Set[str] = set()
    devices_enriched: List[Dict[str, object]] = []
    for cidr in networks:
        for dev in scan_network(cidr):
            ip = dev.get("ip")
            mac = dev.get("mac")
            if not ip or ip in seen_ips:
                continue
            seen_ips.add(ip)
            hostname = _resolve_hostname(ip)
            open_ports = [p for p in _PORTS_PROFILE if _check_tcp_port(ip, p)]
            category = _classify_device(hostname, open_ports)
            name = hostname or ip
            devices_enriched.append({
                "ip": ip, "mac": mac, "hostname": hostname,
                "open_ports": open_ports, "category": category, "name": name
            })
    groups: Dict[str, List[Dict[str, object]]] = {
        "camera": [], "computer": [], "printer": [], "network": [], "iot": [], "unknown": [],
    }
    for d in devices_enriched:
        groups.setdefault(d["category"], []).append(d)
    return {
        "networks": networks,
        "devices": devices_enriched,
        "groups": {
            "camera": groups.get("camera", []),
            "computer": groups.get("computer", []),
            "printer": groups.get("printer", []),
            "network": groups.get("network", []),
            "iot": groups.get("iot", []),
            "unknown": groups.get("unknown", []),
        },
    }


def create_app() -> FastAPI:
    app = FastAPI(title="本地局域网扫描助手", version="1.0.0")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/health")
    def health():
        return {"status": "ok"}

    @app.get("/scan")
    def scan():
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
            grouped.append({
                "key": key, "label": label_map.get(key, key),
                "count": len(items),
                "devices": [{
                    "name": item.get("name"), "ip": item.get("ip"), "mac": item.get("mac"),
                    "hostname": item.get("hostname"), "open_ports": item.get("open_ports", []),
                } for item in items],
            })
        return {
            "message": f"本地扫描完成，发现 {len(devices)} 台设备（{', '.join(networks) or '未知网段'}）",
            "networks": networks,
            "devices": devices,
            "groups": grouped,
        }

    return app


def main():
    app = create_app()
    uvicorn.run(app, host="127.0.0.1", port=47832, reload=False)


if __name__ == "__main__":
    main()`;
};

/**
 * 构建“一键运行”命令（复制到剪贴板用）。
 * @returns {string}
 */
export const buildLocalScannerCommand = () => {
  const os = detectOS();
  const py = os === "win" ? "python" : "python3";
  if (os === "win") {
    return [
      'powershell -NoProfile -ExecutionPolicy Bypass -Command "',
      '$venv=\\"$env:USERPROFILE\\\\.lan-scan-venv\\";',
      `if(!(Test-Path $venv)){ ${py} -m venv $venv };`,
      `& \\"$venv\\\\Scripts\\\\Activate.ps1\\";`,
      "pip install --upgrade pip;",
      'pip install fastapi "uvicorn[standard]" scapy netifaces;',
      "$code=@'",
      buildEmbeddedLocalScannerPython().replace(/'/g, "''"),
      "'@;",
      `Set-Content -Path \\"$env:TEMP\\\\lan_scanner.py\\" -Value $code;`,
      `${py} \\"$env:TEMP\\\\lan_scanner.py\\""`,
    ].join(" ");
  }
  // macOS/Linux
  return [
    "bash -c 'set -e;",
    `PY=${py}; VENV=\\"$HOME/.lan-scan-venv\\";`,
    'if [ ! -d "$VENV" ]; then $PY -m venv "$VENV"; fi;',
    'source "$VENV/bin/activate";',
    "pip install --upgrade pip;",
    'pip install fastapi "uvicorn[standard]" scapy netifaces;',
    "cat > \"$TMPDIR/lan_scanner.py\" <<\\'PY'",
    buildEmbeddedLocalScannerPython().replace(/\\/g, "\\\\").replace(/\$/g, "\\$"),
    "PY",
    "$PY \"$TMPDIR/lan_scanner.py\"'",
  ].join(" ");
};

/**
 * 生成可下载的启动脚本文件名与内容。
 * @returns {{filename:string, content:string, mime:string}}
 */
export const buildLocalScannerScript = () => {
  const os = detectOS();
  if (os === "win") {
    const content = [
      "@echo off",
      "setlocal enabledelayedexpansion",
      "set VENV=%USERPROFILE%\\.lan-scan-venv",
      "where python >nul 2>nul",
      "if %errorlevel% neq 0 (",
      "  echo 未找到 Python，请先安装 https://www.python.org/downloads/",
      "  pause",
      "  exit /b 1",
      ")",
      'if not exist "%VENV%" (',
      '  python -m venv "%VENV%"',
      ")",
      'call "%VENV%\\Scripts\\activate.bat"',
      "pip install --upgrade pip",
      'pip install fastapi "uvicorn[standard]" scapy netifaces',
      "set CODE_FILE=%TEMP%\\lan_scanner.py",
      ">" +
        "%CODE_FILE% echo " +
        buildEmbeddedLocalScannerPython()
          .split("\n")
          .map((l) => l.replace(/"/g, '""'))
          .map((l) => `"${l}"`)
          .join(" & echo "),
      'python "%CODE_FILE%"',
      "pause",
    ].join("\r\n");
    return { filename: "run_local_scanner.bat", content, mime: "application/octet-stream" };
  }
  // macOS/Linux
  const content = [
    "#!/usr/bin/env bash",
    "set -e",
    "PY=${PYTHON:-python3}",
    'VENV="$HOME/.lan-scan-venv"',
    'if [ ! -d "$VENV" ]; then $PY -m venv "$VENV"; fi',
    'source "$VENV/bin/activate"',
    "pip install --upgrade pip",
    'pip install fastapi "uvicorn[standard]" scapy netifaces',
    'CODE_FILE="$TMPDIR/lan_scanner.py"',
    "cat > \"$CODE_FILE\" <<'PY'",
    buildEmbeddedLocalScannerPython(),
    "PY",
    '$PY "$CODE_FILE"',
  ].join("\n");
  return { filename: "run_local_scanner.sh", content, mime: "text/x-shellscript" };
};

