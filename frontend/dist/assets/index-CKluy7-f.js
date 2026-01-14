(function(){const t=document.createElement("link").relList;if(t&&t.supports&&t.supports("modulepreload"))return;for(const r of document.querySelectorAll('link[rel="modulepreload"]'))i(r);new MutationObserver(r=>{for(const s of r)if(s.type==="childList")for(const l of s.addedNodes)l.tagName==="LINK"&&l.rel==="modulepreload"&&i(l)}).observe(document,{childList:!0,subtree:!0});function a(r){const s={};return r.integrity&&(s.integrity=r.integrity),r.referrerPolicy&&(s.referrerPolicy=r.referrerPolicy),r.crossOrigin==="use-credentials"?s.credentials="include":r.crossOrigin==="anonymous"?s.credentials="omit":s.credentials="same-origin",s}function i(r){if(r.ep)return;r.ep=!0;const s=a(r);fetch(r.href,s)}})();const _e="current-year",ge=8e3,be=47832,Z="image-preview-overlay",he=()=>{const e=typeof window.APP_CONFIG=="object"&&window.APP_CONFIG!==null?window.APP_CONFIG:null;if(e&&typeof e.backendBaseUrl=="string"&&e.backendBaseUrl.trim()!=="")return e.backendBaseUrl.trim();try{const i=window.localStorage.getItem("backendBaseUrl");if(typeof i=="string"&&i.trim()!=="")return i.trim()}catch(i){console.warn("读取本地后端地址失败：",i)}const{protocol:t,hostname:a}=window.location;return`${t}//${a}:${ge}`},T=he(),ee=()=>`http://127.0.0.1:${be}`,ye=(e,t,a="text/plain")=>{const i=new Blob([t],{type:a}),r=URL.createObjectURL(i),s=document.createElement("a");s.href=r,s.download=e,document.body.appendChild(s),s.click(),document.body.removeChild(s),URL.revokeObjectURL(r)},ae=()=>{const e=window.navigator.userAgent.toLowerCase();return e.includes("win")?"win":e.includes("mac")?"mac":"linux"},Y=()=>String.raw`from __future__ import annotations

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
    main()`,we=()=>{const e=ae(),t=e==="win"?"python":"python3";return e==="win"?['powershell -NoProfile -ExecutionPolicy Bypass -Command "','$venv=\\"$env:USERPROFILE\\\\.lan-scan-venv\\";',`if(!(Test-Path $venv)){ ${t} -m venv $venv };`,'& \\"$venv\\\\Scripts\\\\Activate.ps1\\";',"pip install --upgrade pip;",'pip install fastapi "uvicorn[standard]" scapy netifaces;',"$code=@'",Y().replace(/'/g,"''"),"'@;",'Set-Content -Path \\"$env:TEMP\\\\lan_scanner.py\\" -Value $code;',`${t} \\"$env:TEMP\\\\lan_scanner.py\\""`].join(" "):["bash -c 'set -e;",`PY=${t}; VENV=\\"$HOME/.lan-scan-venv\\";`,'if [ ! -d "$VENV" ]; then $PY -m venv "$VENV"; fi;','source "$VENV/bin/activate";',"pip install --upgrade pip;",'pip install fastapi "uvicorn[standard]" scapy netifaces;',`cat > "$TMPDIR/lan_scanner.py" <<\\'PY'`,Y().replace(/\\/g,"\\\\").replace(/\$/g,"\\$"),"PY",`$PY "$TMPDIR/lan_scanner.py"'`].join(" ")},Ee=()=>ae()==="win"?{filename:"run_local_scanner.bat",content:["@echo off","setlocal enabledelayedexpansion","set VENV=%USERPROFILE%\\.lan-scan-venv","where python >nul 2>nul","if %errorlevel% neq 0 (","  echo 未找到 Python，请先安装 https://www.python.org/downloads/","  pause","  exit /b 1",")",'if not exist "%VENV%" (','  python -m venv "%VENV%"',")",'call "%VENV%\\Scripts\\activate.bat"',"pip install --upgrade pip",'pip install fastapi "uvicorn[standard]" scapy netifaces',"set CODE_FILE=%TEMP%\\lan_scanner.py",">%CODE_FILE% echo "+Y().split(`
`).map(i=>i.replace(/"/g,'""')).map(i=>`"${i}"`).join(" & echo "),'python "%CODE_FILE%"',"pause"].join(`\r
`),mime:"application/octet-stream"}:{filename:"run_local_scanner.sh",content:["#!/usr/bin/env bash","set -e","PY=${PYTHON:-python3}",'VENV="$HOME/.lan-scan-venv"','if [ ! -d "$VENV" ]; then $PY -m venv "$VENV"; fi','source "$VENV/bin/activate"',"pip install --upgrade pip",'pip install fastapi "uvicorn[standard]" scapy netifaces','CODE_FILE="$TMPDIR/lan_scanner.py"',`cat > "$CODE_FILE" <<'PY'`,Y(),"PY",'$PY "$CODE_FILE"'].join(`
`),mime:"text/x-shellscript"},O=[{id:"extract-frames",name:"视频抽帧",summary:"截取指定时间范围的视频帧，支持自定义帧率输出。",description:"上传视频后，可设置起止时间与目标帧率，后台将调用 `extract_frames.py` 把关键帧导出为图片。",endpoint:"/api/tasks/extract-frames",tags:[{id:"media",label:"视频处理"},{id:"opencv",label:"OpenCV"}],fields:[{id:"video",type:"file",label:"视频文件",accept:"video/*",required:!0,description:"支持 mp4、mov 等常见格式，单次最大 1GB（以后台限制为准）。"},{id:"start_sec",type:"number",label:"起始时间（秒）",placeholder:"例如 0",description:"默认为 0，建议小于结束时间。"},{id:"end_sec",type:"number",label:"结束时间（秒）",placeholder:"留空表示处理到视频末尾"},{id:"n_fps",type:"number",label:"抽帧帧率",placeholder:"例如 5",required:!0,description:"单位为帧/秒，推荐 1-30。"},{id:"output_dir",type:"text",label:"输出文件夹",placeholder:"例如 frames",description:"后台会在作业目录下创建该文件夹存放结果图片。"}],guide:{title:"使用建议",tips:["长视频抽帧请合理设置时间段，避免生成过多图片。","如需保证时间戳，请确保上传的视频 FPS 信息正确。","输出目录名仅支持英文字母、数字和下划线。"]}},{id:"mp4-to-gif",name:"MP4 转 GIF",summary:"截取视频片段并导出为 GIF 动图。",description:"上传 MP4/MOV 等常见视频格式，设置起止时间与目标帧率，后台将调用 `mp42gif.py` 输出 GIF 文件。",endpoint:"/api/tasks/mp4-to-gif",tags:[{id:"media",label:"视频处理"},{id:"tool",label:"格式转换"}],fields:[{id:"video",type:"file",label:"视频文件",accept:"video/*",required:!0,description:"支持 mp4、mov 等常见格式。"},{id:"start_sec",type:"number",label:"起始时间（秒）",placeholder:"例如 0",description:"默认为 0，建议小于结束时间。"},{id:"end_sec",type:"number",label:"结束时间（秒）",placeholder:"留空表示处理到视频末尾"},{id:"scale",type:"select",label:"分辨率缩放",options:["原始（100%）","75%","50%","33%"],description:"用于减小 GIF 体积（仅缩小，不放大）。"}],guide:{title:"导出建议",tips:["GIF 文件体积与时长、分辨率、帧率相关，必要时缩短区间或降低帧率。","若需更小文件，可在导出后使用压缩工具进一步处理。"]}},{id:"images-download",name:"网页图片批量下载",summary:"解析网页内容并批量下载图片资源。",description:"提供目标网址与存储目录后，后台脚本 `images_download.py` 会抓取页面上的图片。",endpoint:"/api/tasks/images-download",tags:[{id:"crawler",label:"网络采集"},{id:"automation",label:"自动化"}],fields:[{id:"page_url",type:"text",label:"网页地址",placeholder:"https://example.com",required:!0}],guide:{title:"注意事项",tips:["仅用于合法授权的网站采集，请勿抓取受版权保护的内容。","如页面图片为懒加载，建议先在本地浏览器滚动加载后复制最终地址。"]}},{id:"qrcode-generator",name:"二维码生成",summary:"在一个模块内生成网址/音频的二维码。",description:"支持两种输入模态：网址链接（生成访问二维码）或 MP3 文件（生成美化播放页二维码）。",endpoint:"/api/tasks/url-to-qrcode",tags:[{id:"tool",label:"工具"},{id:"qrcode",label:"二维码"},{id:"audio",label:"音频"}],fields:[{id:"mode",type:"select",label:"输入类型",options:["url","mp3"]},{id:"target_url",type:"text",label:"网址链接",placeholder:"https://example.com"},{id:"audio",type:"file",label:"MP3 文件",accept:"audio/mpeg,.mp3,audio/*"}],guide:{title:"使用提示",tips:["选择“网址链接”时，填写完整的 http/https 链接。","选择“MP3 文件”时，上传 .mp3，二维码将指向美化播放页。"]}},{id:"mp4-to-live-photo",name:"Live Photo 生成",summary:"将短视频转换为 iOS 实况照片格式。",description:"上传短视频并设置时长与封面帧，后台脚本 `mp42mov.py` 会输出 `.mov` 和 `.jpg`。",endpoint:"/api/tasks/mp4-to-live-photo",tags:[{id:"media",label:"视频处理"},{id:"live-photo",label:"Live Photo"}],fields:[{id:"video",type:"file",label:"视频文件",accept:"video/*",required:!0},{id:"output_prefix",type:"text",label:"输出前缀",placeholder:"如 live/photo_001",required:!0},{id:"duration",type:"number",label:"目标时长（秒）",placeholder:"默认 3",description:"超出原视频长度时会自动截断。"},{id:"keyframe_time",type:"number",label:"封面时间点（秒）",placeholder:"默认 1.0",description:"建议介于 0.1 与时长-0.1 之间。"}],guide:{title:"导出说明",tips:["建议上传 3-5 秒的短视频以保证动效流畅。","导出的 JPG 为封面图，可配合 MOV 直接导入 iOS 相册。"]}},{id:"network-scan",name:"局域网设备扫描",summary:"按指定网段（CIDR）扫描在线设备。",description:"请输入要扫描的局域网网段（CIDR），例如 192.168.1.0/24。本功能仅根据用户输入的网段执行扫描，不再尝试自动识别或访问“用户所在的网段”。",endpoint:"/api/tasks/network-scan",tags:[{id:"network",label:"网络"},{id:"scapy",label:"Scapy"}],fields:[{id:"network_range",type:"text",label:"扫描网段（CIDR）",placeholder:"如 192.168.1.0/24 或 10.0.0.0/24",required:!0,description:"可输入多个网段，使用逗号或空格分隔；仅扫描你填写的网段。"}],guide:{title:"安全提示",tips:["仅在授权的内网环境中使用，避免对他人网络造成干扰。","部分设备可能关闭 ARP 响应，如需更全列表可多次扫描。"]}},{id:"folder-split",name:"批量文件分拣",summary:"将同类文件平均分配到多个子文件夹。",description:"`split-files.py` 支持按扩展名对目录内文件均分，适合分发标注任务。",endpoint:"/api/tasks/folder-split",tags:[{id:"file",label:"文件管理"},{id:"automation",label:"自动化"}],fields:[{id:"source_dir",type:"text",label:"源目录",placeholder:"如 datasets/images",required:!0},{id:"file_extension",type:"text",label:"文件后缀",placeholder:".jpg",required:!0},{id:"num_folders",type:"number",label:"分组数量",placeholder:"例如 5",required:!0}],guide:{title:"使用小技巧",tips:["执行前请确认源目录中仅包含目标文件类型，避免误分拣。","分组完成后，脚本会在源目录内生成 `Folder_1...` 子目录。"]}},{id:"url-to-mp4",name:"在线视频下载",summary:"支持 YouTube、bilibili 及其他由 yt-dlp 支持的视频链接下载（尝试兼容咪咕等国内平台）。",description:"调用 `URL2mp4.py`，输入视频链接后将自动下载最佳质量的 mp4 文件。实际可支持站点范围取决于后端使用的 yt-dlp 版本，对咪咕等平台为“尽力支持”，如检测到 Unsupported URL 或需登录/DRM，下载会失败。",endpoint:"/api/tasks/url-to-mp4",tags:[{id:"media",label:"视频"},{id:"download",label:"下载"}],fields:[{id:"video_url",type:"text",label:"视频链接",placeholder:"https://...",required:!0}],guide:{title:"版权声明",tips:["仅下载有权限的公开视频，遵守平台使用条款。","部分站点需额外登录或 Cookie，暂不支持。"]}},{id:"yolo-json-to-txt",name:"YOLO 标注转换",summary:"批量将 LabelMe JSON 转为 YOLO 标签。",description:"借助 `yolo/json_to_yolo.py`，上传 JSON 数据集并指定类别即可自动生成 YOLO 标签文件。",endpoint:"/api/tasks/yolo-json-to-txt",tags:[{id:"cv",label:"计算机视觉"},{id:"dataset",label:"数据集工具"}],fields:[{id:"json_archive",type:"file",label:"JSON 数据压缩包",accept:".zip,.tar,.tar.gz",description:"请将 `Annotations` 文件夹打包上传。"},{id:"classes",type:"text",label:"类别列表",placeholder:"如 person,hat,reflective_clothes",required:!0,description:"多个类别用英文逗号分隔。"}],guide:{title:"转换流程",tips:["后台会按原有 JSON 文件名在 `labels/` 目录中生成同名 txt。","若存在矩形标注外的形状，需要先在本地转换为矩形框。"]}},{id:"yolo-label-vis",name:"YOLO 标注可视化",summary:"渲染 YOLO 标注框，批量导出叠加图片。",description:"脚本 `yolo/label_vis.py` 会读取标签文件与原图，输出带框的调试图像。",endpoint:"/api/tasks/yolo-label-vis",tags:[{id:"cv",label:"计算机视觉"},{id:"debug",label:"数据检查"}],fields:[{id:"annotations_archive",type:"file",label:"标注压缩包",accept:".zip,.tar,.tar.gz",description:"包含 YOLO txt 标签的压缩包。"},{id:"images_archive",type:"file",label:"图像压缩包",accept:".zip,.tar,.tar.gz",description:"与标注对应的原始图片。"},{id:"output_dir",type:"text",label:"输出目录",placeholder:"默认 label_output"},{id:"suffix",type:"text",label:"文件后缀",placeholder:"默认 _annotated"},{id:"class_names",type:"text",label:"类别名称",placeholder:"空格分隔，如 car truck person",description:"若留空则使用标签文件中的 ID。"}],guide:{title:"结果说明",tips:["输出文件名为原图名加后缀，可在结果页面下载。","颜色按类别区分，若类别超过 6 种会自动生成随机色。"]}},{id:"yolo-write-img-path",name:"YOLO 数据集路径生成",summary:"批量生成训练集/验证集图片路径清单。",description:"`yolo/write_img_path.py` 根据 `ImageSets/Main` 与配置生成 `train/val/test` 路径文件。",endpoint:"/api/tasks/yolo-write-img-path",tags:[{id:"dataset",label:"数据集工具"},{id:"automation",label:"自动化"}],fields:[{id:"images_root",type:"text",label:"图片根目录",placeholder:"如 /data/images",required:!0},{id:"image_sets_archive",type:"file",label:"ImageSets 压缩包",description:"包含 `ImageSets/Main/*.txt` 的压缩包。"},{id:"class_name",type:"text",label:"类别名称",placeholder:"默认 weed"}],guide:{title:"生成内容",tips:["会在 `dataSet_path/` 下输出 train/val/test 三个列表。","脚本默认类别配置如需修改，请在提交参数中同步更新。"]}},{id:"yolo-split-dataset",name:"YOLO 数据集划分",summary:"按比例拆分标注文件为 train/val/test。",description:"脚本 `yolo/split_train_val.py` 支持自定义 XML 目录并生成 `ImageSets/Main` 划分文件。",endpoint:"/api/tasks/yolo-split-dataset",tags:[{id:"dataset",label:"数据集工具"},{id:"automation",label:"自动化"}],fields:[{id:"xml_archive",type:"file",label:"XML 标签压缩包",accept:".zip,.tar,.tar.gz",description:"请上传 `Annotations` 目录压缩包。"},{id:"trainval_ratio",type:"number",label:"训练+验证占比",placeholder:"0.9",description:"与脚本默认一致，可覆盖。"},{id:"train_ratio",type:"number",label:"训练集占比",placeholder:"0.9",description:"仅作用在训练+验证子集内。"}],guide:{title:"输出文件",tips:["最终会生成 train.txt、val.txt、trainval.txt、test.txt。","若需固定随机种子，请联系管理员在后端扩展。"]}}],C=e=>{if(typeof e!="string"||e.trim()==="")throw new Error("模块未配置有效的接口地址");try{return new URL(e,T).toString()}catch(t){throw new Error(`无法解析接口地址：${t instanceof Error?t.message:String(t)}`)}},te=e=>{if(typeof e!="string"||e.trim()==="")return e;try{return new URL(e,T).toString()}catch{return e}},P=e=>{if(typeof e!="string"||e.trim()==="")return e;let t="";try{if(e.startsWith("http://")||e.startsWith("https://"))t=new URL(e).pathname||"";else try{t=decodeURIComponent(e)}catch{t=e}t.includes("/files/")?t=t.slice(t.indexOf("/files/")):t.startsWith("/files/")||(t=`/files/${t}`)}catch{try{t=decodeURIComponent(e),t.startsWith("/files/")||(t=`/files/${t}`)}catch{t=e.startsWith("/files/")?e:`/files/${e}`}}const a=new URL("/api/download",T);return a.searchParams.set("path",t),a.toString()},$e=e=>{if(typeof e!="string"||e.trim()==="")return e;let t="";try{const r=new URL(e,T).pathname||"";t=r.includes("/files/")?r.slice(r.indexOf("/files/")):r}catch{t=e}const a=new URL("/gif",T);return a.searchParams.set("file",t),a.toString()},_=(e,t,a,i="")=>{const r=e.querySelector("[data-status-panel]");if(!r)return;r.classList.remove("status--info","status--success","status--error"),r.classList.add(`status--${t}`),r.hidden=!1;const s=r.querySelector(".status__text"),l=r.querySelector(".status__meta");s&&(s.textContent=a),l&&(l.textContent=i)},Le=e=>{const t=e.querySelector("[data-result-panel]");if(!t)return;const a=t.querySelector("[data-result-title]"),i=t.querySelector("[data-result-meta]"),r=t.querySelector("[data-result-actions]"),s=t.querySelector("[data-result-previews]"),l=t.querySelector("[data-result-files]"),p=t.querySelector("[data-result-file-list]");if(a&&(a.textContent="处理结果"),i&&(i.textContent="",i.hidden=!0),r&&(r.innerHTML=""),s&&(s.hidden=!0,s.innerHTML=""),p&&(p.innerHTML=""),l){l.hidden=!0;const n=l.querySelector("details");n&&(n.open=!1)}t.hidden=!0},re=(e,t,a)=>{const i=e.querySelector("[data-result-panel]");if(!i)return;const r=i.querySelector("[data-result-title]"),s=i.querySelector("[data-result-meta]"),l=i.querySelector("[data-result-actions]"),p=i.querySelector("[data-result-previews]"),n=i.querySelector("[data-result-files]"),u=i.querySelector("[data-result-file-list]"),m=typeof a.message=="string"&&a.message.trim()!==""?a.message.trim():`${t.name}任务完成`;if(r&&(r.textContent=m),s){const d=[];typeof a.job_id=="string"&&a.job_id.trim()!==""&&d.push(`任务编号：${a.job_id.trim()}`),typeof a.total_files=="number"&&Number.isFinite(a.total_files)?d.push(`生成文件：${a.total_files} 个`):Array.isArray(a.files)&&d.push(`生成文件：${a.files.length} 个`),s.textContent=d.join(" · "),s.hidden=d.length===0}if(l){const d=[];if(typeof a.archive=="string"&&a.archive.trim()!==""){const o=P(a.archive);d.push(`<a class="button" href="${o}">下载压缩包</a>`)}if(t.id==="url-to-mp4"&&Array.isArray(a.files)&&a.files.length>0){const o=a.files[0];if(typeof o=="string"&&o.trim()!==""){const v=P(o);d.push(`<a class="button" href="${v}">下载视频</a>`)}}if(t.id==="mp4-to-gif"&&Array.isArray(a.files)&&a.files.length>0){const o=a.files[0];if(typeof o=="string"&&o.trim()!==""){const v=te(o),b=P(o),w=$e(o),f=`${T}/api/utils/qrcode?url=${encodeURIComponent(w)}`;d.push(`<a class="button" href="${b}">下载 GIF</a>`,`<button class="button" type="button" data-copy-gif data-src="${v}">复制 GIF</button>`,`<a class="button" href="${f}" target="_blank" rel="noopener noreferrer">微信二维码</a>`)}}if(d.length===0&&Array.isArray(a.files)&&a.files.length>0){const o=a.files[0];if(typeof o=="string"&&o.trim()!==""){const v=P(o),b=t.tags.some(w=>w.id==="media")?"下载文件":"下载结果";d.push(`<a class="button" href="${v}">${b}</a>`)}}l.innerHTML=d.length>0?d.join(" "):'<span class="result__empty">暂无可下载内容</span>'}if(p)if(t.id==="network-scan"&&Array.isArray(a.groups)){const d=Array.isArray(a.networks)?a.networks:[],o=a.groups.map(b=>{const w=Array.isArray(b.devices)?b.devices.map(f=>{const h=typeof f.name=="string"&&f.name?f.name:f.ip,g=f.ip??"",x=f.mac??"",L=f.hostname??"",q=Array.isArray(f.open_ports)?f.open_ports.join(", "):"";return`<li class="result__list-item">
                    <span class="result__device-name">${h}</span>
                    <span class="result__device-meta">IP: ${g}${x?` · MAC: ${x}`:""}${L?` · 主机名: ${L}`:""}${q?` · 端口: ${q}`:""}</span>
                  </li>`}).join(""):"";return`
            <section class="result__group">
              <header class="result__group-header">
                <h4 class="result__group-title">${b.label??b.key}</h4>
                <span class="result__group-count">${b.count??0} 台</span>
              </header>
              <ul class="result__list">${w||'<li class="result__list-item">暂无设备</li>'}</ul>
            </section>
          `}).join(""),v=`<p class="result__meta">扫描网段：${d.join(", ")||"未识别"}</p>`;p.innerHTML=`${v}${o}`,p.hidden=!1}else if(Array.isArray(a.previews)&&a.previews.length>0){const d=t.id==="images-download",o=t.id==="qrcode-generator"||t.id==="url-to-qrcode"||t.id==="mp3-to-qrcode",v=a.previews.map((f,h)=>{if(typeof f!="string")return"";const g=te(f),x=P(f),L=f.split("/").pop()||`file-${h+1}`,q=t.id==="mp4-to-gif"?`<button class="preview-grid__copy" type="button" data-copy-gif data-src="${g}">复制</button>`:"";return`
            <figure class="preview-grid__item">
              <button
                class="preview-grid__image-button"
                type="button"
                data-preview-full="${g}"
                data-preview-alt="${t.name} 预览图 ${h+1}"
              >
                <img class="preview-grid__image" src="${g}" alt="${t.name} 预览图 ${h+1}" loading="lazy" />
              </button>
              <figcaption class="preview-grid__caption">
                <span class="preview-grid__label">预览 ${h+1}</span>
                <a class="preview-grid__download" href="${x}" download="${L}">下载</a>
                ${q}
              </figcaption>
            </figure>
          `}).join(""),b=`<p class="result__meta">结果预览（${d?"共":"展示前"} ${a.previews.length} 项）</p>`,w=`preview-grid${o?" preview-grid--qrcode":""}`;p.innerHTML=`${b}<div class="${w}">${v}</div>`,p.hidden=!1}else p.hidden=!0,p.innerHTML="";if(n&&u)if(Array.isArray(a.files)&&a.files.length>0){const d=a.files.map((v,b)=>{if(typeof v!="string")return"";const w=P(v),f=v.split("/").pop()||`文件 ${b+1}`;return`<li class="result__file-item"><a href="${w}" download="${f}">${f}</a></li>`}).filter(Boolean).join("");u.innerHTML=d,n.hidden=!1;const o=n.querySelector("details");o&&(o.open=!1)}else u.innerHTML="",n.hidden=!0;i.hidden=!1},Se=e=>{const t=new FormData;return Array.from(e.elements).forEach(i=>{if(!(i instanceof HTMLElement))return;const r=i.getAttribute("name");r&&(i instanceof HTMLInputElement&&i.type==="file"?Array.from(i.files??[]).forEach(s=>{t.append(r,s)}):(i instanceof HTMLInputElement||i instanceof HTMLTextAreaElement||i instanceof HTMLSelectElement)&&i.value!==""&&t.append(r,i.value))}),t},xe=async e=>{e.preventDefault();const t=e.target;if(!(t instanceof HTMLFormElement))return;const a=t.getAttribute("data-module-form"),i=O.find(r=>r.id===a);if(i){Le(t),_(t,"info","任务提交中...","请稍候，正在处理");try{const r=Se(t);let s=C(i.endpoint);if(i.id==="qrcode-generator"){const m=t.querySelector('[name="mode"]'),d=m&&m.value==="mp3"?"mp3":m&&m.value==="video"?"video":"url";d==="mp3"?s=C("/api/tasks/mp3-to-qrcode"):d==="video"?s=C("/api/tasks/video-to-qrcode"):s=C("/api/tasks/url-to-qrcode")}const l=await fetch(s,{method:"POST",body:r});if(!l.ok){let m=`请求失败，状态码 ${l.status}`;try{if((l.headers.get("content-type")||"").includes("application/json")){const o=await l.json();o&&typeof o.detail=="string"&&o.detail.trim()!==""?m=o.detail.trim():typeof o.message=="string"&&o.message.trim()!==""&&(m=o.message.trim())}else{const o=await l.text();o&&o.trim()!==""&&(m=o.trim())}}catch{}throw new Error(m)}const p=await l.json().catch(()=>({message:"提交成功"})),n=typeof p.message=="string"&&p.message.trim()!==""?p.message.trim():`${i.name}任务已提交`,u=p.job_id?`任务编号：${p.job_id}`:"任务已排队";_(t,"success",n,u),re(t,i,p)}catch(r){const s=r instanceof TypeError?`无法连接后端服务：${r.message}`:r instanceof Error?r.message:"未知错误";_(t,"error","提交失败",s)}}};let k=null,N=null;const ne=()=>{k instanceof HTMLDivElement&&(k.classList.remove("image-preview--visible"),document.body.classList.remove("image-preview--locked"))},oe=()=>{if(k instanceof HTMLDivElement&&N instanceof HTMLImageElement)return;const e=document.getElementById(Z);if(e instanceof HTMLDivElement){k=e,N=e.querySelector("img");return}const t=document.createElement("div");t.id=Z,t.className="image-preview",t.innerHTML=`
    <div class="image-preview__backdrop" data-preview-dismiss></div>
    <div class="image-preview__content" role="dialog" aria-modal="true">
      <button class="image-preview__close" type="button" data-preview-dismiss aria-label="关闭预览">
        &times;
      </button>
      <img class="image-preview__image" src="" alt="" />
    </div>
  `,document.body.appendChild(t),k=t,N=t.querySelector(".image-preview__image"),t.querySelectorAll("[data-preview-dismiss]").forEach(i=>{i.addEventListener("click",()=>{ne()})})},ke=(e,t)=>{oe(),!(!(k instanceof HTMLDivElement)||!(N instanceof HTMLImageElement))&&(N.src=e,N.alt=t||"图片预览",k.classList.add("image-preview--visible"),document.body.classList.add("image-preview--locked"))},Te=()=>{document.addEventListener("keydown",e=>{e.key==="Escape"&&ne()})},qe=()=>{document.body.addEventListener("click",e=>{const t=e.target;if(!(t instanceof HTMLElement))return;const a=t.getAttribute("data-navigate");if(a){e.preventDefault(),window.location.hash=`#/module/${a}`;return}if(t.getAttribute("data-link")==="home"&&(e.preventDefault(),window.location.hash=""),t.matches("[data-check-local-scanner]")){e.preventDefault();const s=t.closest("form");s instanceof HTMLFormElement&&_(s,"info","检测本地扫描助手...",ee());const l=new AbortController,p=setTimeout(()=>l.abort(),4e3);fetch(`${ee()}/health`,{signal:l.signal}).then(n=>n.ok?n.json():Promise.reject(new Error(`状态码 ${n.status}`))).then(n=>{s instanceof HTMLFormElement&&_(s,"success","本地扫描助手已就绪",JSON.stringify(n))}).catch(n=>{s instanceof HTMLFormElement&&_(s,"error","未检测到本地扫描助手",String(n&&n.message?n.message:n))}).finally(()=>clearTimeout(p));return}if(t.matches("[data-copy-local-command]")){e.preventDefault();const s=we();navigator.clipboard.writeText(s).then(()=>{const l=t.closest("form");l instanceof HTMLFormElement&&_(l,"success","已复制运行命令","请在本机终端粘贴执行；macOS/Linux 建议加 sudo")},l=>{const p=t.closest("form");p instanceof HTMLFormElement&&_(p,"error","复制命令失败",String(l&&l.message?l.message:l))});return}if(t.matches("[data-download-local-script]")){e.preventDefault();const{filename:s,content:l,mime:p}=Ee();ye(s,l,p);const n=t.closest("form");n instanceof HTMLFormElement&&_(n,"success","已下载启动脚本","macOS: 赋予执行权限并运行；Windows: 双击运行 .bat");return}if(t.matches("[data-copy-gif]")){e.preventDefault();const s=t.closest("form"),l=t.getAttribute("data-src")||"";if(!(s instanceof HTMLFormElement)||!l)return;const p=async n=>{try{if(navigator.clipboard&&typeof window.ClipboardItem=="function"){const u=await fetch(n,{mode:"cors"});if(!u.ok)throw new Error(`获取 GIF 失败：HTTP ${u.status}`);const m=await u.blob(),d=new window.ClipboardItem({"image/gif":m});await navigator.clipboard.write([d]),_(s,"success","已复制 GIF 到剪贴板","可直接在聊天/文档中粘贴图片");return}await navigator.clipboard.writeText(n),_(s,"success","已复制 GIF 链接",n)}catch(u){try{navigator.clipboard?(await navigator.clipboard.writeText(n),_(s,"success","已复制 GIF 链接",n)):_(s,"error","复制失败",String(u&&u.message?u.message:u))}catch(m){_(s,"error","复制失败",String(m&&m.message?m.message:m))}}};_(s,"info","正在复制 GIF...",""),p(l);return}const r=t.closest("[data-preview-full]");if(r){e.preventDefault();const s=r.getAttribute("data-preview-full")??"";if(s!==""){const l=r.getAttribute("data-preview-alt")??"";ke(s,l)}}}),document.body.addEventListener("submit",e=>{e.target instanceof HTMLFormElement&&xe(e)})},se="view-root",Ie=()=>{const e=document.getElementById(se);if(!e)throw new Error(`未找到视图容器 #${se}`);return e},J=e=>{Ie().innerHTML=e},Me=()=>{const e=O.length,t=O.filter(i=>i.tags.some(r=>r.id==="media")).length,a=O.filter(i=>i.tags.some(r=>r.id==="automation")).length;return{total:e,media:t,automation:a}},Fe=()=>{const{total:e,media:t,automation:a}=Me(),i=O.map(r=>`
      <article class="module-card" data-module="${r.id}">
        <div class="module-card__header">
          <h3 class="module-card__title">${r.name}</h3>
          <p class="module-card__summary">${r.summary}</p>
          <div class="module-card__tags">
            ${r.tags.map(s=>`<span class="tag">${s.label}</span>`).join("")}
          </div>
        </div>
        <div class="module-card__meta">
          <span>脚本：${r.id.replace(/-/g,"_")}.py</span>
        </div>
        <div class="module-card__actions">
          <button class="button" data-navigate="${r.id}">立即使用 →</button>
        </div>
      </article>
    `).join("");J(`
    <section class="hero">
      <div>
        <h2>脚本服务概览</h2>
        <p>根据当前仓库脚本自动生成的前端界面，点击即可进入具体操作。</p>
      </div>
      <div class="hero__summary">
        <div class="hero__chip">
          <span class="hero__chip-title">总计脚本</span>
          <span class="hero__chip-value">${e}</span>
        </div>
        <div class="hero__chip">
          <span class="hero__chip-title">媒体处理</span>
          <span class="hero__chip-value">${t}</span>
        </div>
        <div class="hero__chip">
          <span class="hero__chip-title">自动化工具</span>
          <span class="hero__chip-value">${a}</span>
        </div>
      </div>
    </section>
    <section class="section">
      <h2 class="section__title">脚本模块</h2>
      <div class="module-grid">${i}</div>
    </section>
  `)},D=e=>!Number.isFinite(e)||e<0?"--":`${e.toFixed(2)}s`,Pe=e=>{const t=p=>e.fields.find(n=>n.id===p),a=t("video"),i=t("start_sec"),r=t("end_sec"),s=t("n_fps"),l=t("scale");return`
    <div class="form__group form__group--video">
      <label class="form__label" for="extract-video-input">${(a==null?void 0:a.label)??"视频文件"}<sup>*</sup></label>
      <input
        class="input"
        type="file"
        name="video"
        id="extract-video-input"
        accept="${(a==null?void 0:a.accept)??"video/*"}"
        required
        data-video-input
      />
      ${a!=null&&a.description?`<p class="form__hint">${a.description}</p>`:""}
    </div>
    <div class="video-preview-container" data-video-preview>
      <div class="video-preview__placeholder" data-video-placeholder>
        <div class="video-preview__placeholder-icon"></div>
        <div class="video-preview__placeholder-text">
          <p class="video-preview__placeholder-title">等待上传视频</p>
          <span class="video-preview__placeholder-desc">请选择或拖入视频文件，便于预览与设置抽帧区间。</span>
        </div>
      </div>
      <div class="video-preview__player-wrapper" hidden data-video-player-wrapper>
        <video class="video-preview__player" controls preload="metadata" data-video-player></video>
      </div>
      <div class="video-preview__timeline" hidden data-video-timeline>
        <input
          class="video-preview__seek"
          type="range"
          min="0"
          max="0"
          value="0"
          step="0.01"
          disabled
          data-video-seek
        />
        <div class="video-preview__meta">
          <span>当前时间：<strong data-current-display>00.00s</strong></span>
          <span>视频时长：<strong data-duration-display>--</strong></span>
        </div>
        <div class="video-preview__actions">
          <button class="button button--primary" type="button" data-save-frame>
            保存当前帧
          </button>
        </div>
      </div>
      <div class="video-toolbar" hidden data-video-toolbar>
        <div class="time-control">
          <div class="time-control__header">
            <span class="time-control__title">${(i==null?void 0:i.label)??"起始时间（秒）"}</span>
            <button class="button button--ghost time-control__action" type="button" data-set-start>
              使用当前时间
            </button>
          </div>
          <div class="time-control__inputs">
            <input
              class="input input--condensed"
              type="number"
              min="0"
              step="0.01"
              value="0"
              name="start_sec"
              placeholder="${(i==null?void 0:i.placeholder)??""}"
              data-start-input
            />
            <span class="time-control__meta">已选：<strong data-start-display>0.00s</strong></span>
          </div>
          ${i!=null&&i.description?`<p class="form__hint">${i.description}</p>`:""}
        </div>
        <div class="time-control">
          <div class="time-control__header">
            <span class="time-control__title">${(r==null?void 0:r.label)??"结束时间（秒）"}</span>
            <button class="button button--ghost time-control__action" type="button" data-set-end>
              使用当前时间
            </button>
          </div>
          <div class="time-control__inputs">
            <input
              class="input input--condensed"
              type="number"
              min="0"
              step="0.01"
              value=""
              name="end_sec"
              placeholder="${(r==null?void 0:r.placeholder)??""}"
              data-end-input
            />
            <span class="time-control__meta">已选：<strong data-end-display>--</strong></span>
          </div>
          ${r!=null&&r.description?`<p class="form__hint">${r.description}</p>`:""}
        </div>
      </div>
    </div>
    ${s?`
    <div class="form__group">
      <label class="form__label" for="extract-fps-input">${s.label??"抽帧帧率"}<sup>*</sup></label>
      <div class="fps-control">
        <input class="fps-control__slider" type="range" min="1" max="60" value="5" step="1" data-fps-range />
        <div class="fps-control__value">
          <input class="input input--condensed" type="number" min="1" max="60" step="1" value="5" name="n_fps" id="extract-fps-input" required data-fps-input />
          <span class="fps-control__suffix">fps</span>
        </div>
      </div>
      ${s.description?`<p class="form__hint">${s.description}</p>`:""}
    </div>`:""}
    ${l?`
    <div class="form__group">
      <label class="form__label" for="extract-scale-select">${l.label??"分辨率缩放"}</label>
      <select class="select" name="scale" id="extract-scale-select">
        <option value="1">原始（100%）</option>
        <option value="0.75">75%</option>
        <option value="0.5">50%</option>
        <option value="0.33">33%</option>
      </select>
      ${l.description?`<p class="form__hint">${l.description}</p>`:""}
    </div>`:""}
  `},Oe=e=>{if(!(e instanceof HTMLFormElement))return;const t=e.querySelector("[data-video-input]"),a=e.querySelector("[data-video-preview]"),i=e.querySelector("[data-video-placeholder]"),r=e.querySelector("[data-video-player-wrapper]"),s=e.querySelector("[data-video-player]"),l=e.querySelector("[data-video-timeline]"),p=e.querySelector("[data-video-toolbar]"),n=e.querySelector("[data-video-seek]"),u=e.querySelector("[data-current-display]"),m=e.querySelector("[data-duration-display]"),d=e.querySelector("[data-start-input]"),o=e.querySelector("[data-end-input]"),v=e.querySelector("[data-start-display]"),b=e.querySelector("[data-end-display]"),w=e.querySelector("[data-set-start]"),f=e.querySelector("[data-set-end]"),h=e.querySelector("[data-fps-range]"),g=e.querySelector("[data-fps-input]"),x=e.querySelector("[data-save-frame]"),L=e.querySelector("[data-status-panel]"),q=e.querySelector("[data-result-panel]");if(!t||!a||!i||!r||!(s instanceof HTMLVideoElement)||!l||!p||!(n instanceof HTMLInputElement)||!(d instanceof HTMLInputElement)||!(o instanceof HTMLInputElement))return;let A="";const K=()=>{A&&(URL.revokeObjectURL(A),A="")},R=c=>{i.hidden=c,i.classList.toggle("video-preview__placeholder--hidden",c),c?i.setAttribute("aria-hidden","true"):i.removeAttribute("aria-hidden"),r.hidden=!c,a.classList.toggle("video-preview--active",c),l.hidden=!c,p.hidden=!c},j=()=>{u&&(u.textContent=D(s.currentTime))},z=()=>{m&&(m.textContent=D(s.duration))},U=()=>{if(v){const c=Number.parseFloat(d.value);v.textContent=Number.isFinite(c)?D(c):"--"}},I=()=>{if(b){const c=Number.parseFloat(o.value);b.textContent=Number.isFinite(c)?D(c):"--"}},H=c=>{const y=Number.isFinite(s.duration)?s.duration:0;return Number.isFinite(c)?y<=0?Math.max(c,0):Math.min(Math.max(c,0),y):0},W=()=>{const c=Number.isFinite(s.duration)?s.duration:0;c>0?(n.max=String(c),n.disabled=!1,n.value=String(s.currentTime)):(n.max="0",n.value="0",n.disabled=!0)},V=()=>{d.value="0",o.value="",U(),I()},le=()=>{K();const[c]=t.files??[];if(!c){R(!1),s.removeAttribute("src"),s.load(),V(),j(),z(),W();return}A=URL.createObjectURL(c),s.src=A,R(!0),s.load(),V(),j(),z(),W()},ce=()=>{const c=Number.parseFloat(n.value);Number.isFinite(c)&&(s.currentTime=Math.max(c,0))},de=()=>{const c=H(s.currentTime);d.value=c.toFixed(2),Number.isFinite(Number.parseFloat(o.value))&&Number.parseFloat(o.value)<c&&(o.value=c.toFixed(2)),U(),I()},pe=()=>{const c=H(s.currentTime);o.value=c.toFixed(2),Number.parseFloat(d.value)>c&&(d.value=c.toFixed(2),U()),I()},Q=()=>{const c=H(Number.parseFloat(d.value));if(Number.isNaN(c))d.value="0";else{d.value=c.toFixed(2);const y=Number.parseFloat(o.value);Number.isFinite(y)&&y<c&&(o.value=c.toFixed(2),I())}U()},X=()=>{if(o.value===""){I();return}const c=H(Number.parseFloat(o.value));if(Number.isNaN(c))o.value="";else{const y=Number.parseFloat(d.value),E=y>c?y:c;o.value=E.toFixed(2)}I()},B=c=>{if(!(h instanceof HTMLInputElement)||!(g instanceof HTMLInputElement))return;const y=Number(h.min)||1,E=Number(h.max)||60;let S=Number.parseInt(String(c),10);Number.isFinite(S)||(S=y),S=Math.min(Math.max(S,y),E),h.value=String(S),g.value=String(S)};t.addEventListener("change",le),n.addEventListener("input",ce),s.addEventListener("timeupdate",()=>{n.matches(":active")||(n.value=String(s.currentTime)),j()}),s.addEventListener("loadedmetadata",()=>{z(),W()}),s.addEventListener("ended",()=>{s.currentTime=s.duration||0,j(),n.value=String(s.currentTime)}),d.addEventListener("change",Q),d.addEventListener("blur",Q),o.addEventListener("change",X),o.addEventListener("blur",X),w instanceof HTMLButtonElement&&w.addEventListener("click",de),f instanceof HTMLButtonElement&&f.addEventListener("click",pe),h instanceof HTMLInputElement&&h.addEventListener("input",()=>B(h.value)),g instanceof HTMLInputElement&&(g.addEventListener("change",()=>B(g.value)),g.addEventListener("blur",()=>B(g.value))),e.addEventListener("reset",()=>{K(),R(!1),s.removeAttribute("src"),s.load(),n.value="0",n.disabled=!0,h instanceof HTMLInputElement&&(h.value="5"),g instanceof HTMLInputElement&&(g.value="5"),u&&(u.textContent="00.00s"),m&&(m.textContent="--"),V()}),g instanceof HTMLInputElement&&B(g.value),V(),R(!1);const ue=async()=>{const[c]=t.files??[];if(!c){L&&_(e,"error","请先上传视频文件","");return}const y=H(s.currentTime);if(!Number.isFinite(y)||y<0){L&&_(e,"error","无法获取当前视频时刻","");return}L&&_(e,"info","正在保存当前帧...",`时刻: ${D(y)}`);try{const E=new FormData;E.append("video",c),E.append("timestamp",String(y.toFixed(2)));const S=C("/api/tasks/extract-single-frame"),M=await fetch(S,{method:"POST",body:E});if(!M.ok){let G=`请求失败，状态码 ${M.status}`;try{if((M.headers.get("content-type")||"").includes("application/json")){const $=await M.json();$&&typeof $.detail=="string"&&$.detail.trim()!==""?G=$.detail.trim():typeof $.message=="string"&&$.message.trim()!==""&&(G=$.message.trim())}else{const $=await M.text();$&&$.trim()!==""&&(G=$.trim())}}catch{}throw new Error(G)}const F=await M.json(),me=typeof F.message=="string"&&F.message.trim()!==""?F.message.trim():"帧图片保存成功",fe=F.job_id?`任务编号：${F.job_id}`:"";L&&_(e,"success",me,fe),q&&re(e,{id:"extract-single-frame",name:"单帧提取",tags:[{id:"media",label:"视频处理"}]},F)}catch(E){const S=E instanceof TypeError?`无法连接后端服务：${E.message}`:E instanceof Error?E.message:"未知错误";L&&_(e,"error","保存失败",S)}};x instanceof HTMLButtonElement&&x.addEventListener("click",()=>{ue()})},Ne=()=>`
    <div class="segmented" role="tablist" aria-label="输入类型" data-qrcode-toggle>
      <button class="segmented__item is-active" type="button" role="tab" aria-selected="true" data-mode="url">网站</button>
      <button class="segmented__item" type="button" role="tab" aria-selected="false" data-mode="mp3">MP3</button>
      <button class="segmented__item" type="button" role="tab" aria-selected="false" data-mode="video">视频</button>
    </div>
    <input type="hidden" name="mode" value="url" data-qrcode-mode />

    <div class="form__group" data-url-group>
      <label class="form__label" for="qrcode-target-url">网址链接<sup>*</sup></label>
      <input class="input" type="text" name="target_url" id="qrcode-target-url" placeholder="https://example.com" />
      <p class="form__hint">请输入完整链接（含 http/https），生成网页访问二维码。</p>
    </div>

    <div class="form__group" data-audio-group hidden>
      <label class="form__label" for="qrcode-audio">MP3 文件<sup>*</sup></label>
      <input class="input" type="file" name="audio" id="qrcode-audio" accept="audio/mpeg,.mp3,audio/*" />
      <p class="form__hint">上传 .mp3 后将生成“美化播放页”的二维码，扫码后直接播放。</p>
    </div>

    <div class="form__group" data-video-group hidden>
      <label class="form__label" for="qrcode-video">视频文件<sup>*</sup></label>
      <input class="input" type="file" name="video" id="qrcode-video" accept="video/*" />
      <p class="form__hint">支持常见视频格式（如 mp4/mov/webm），将生成“美化观看页”的二维码。</p>
    </div>
  `,Ae=e=>{if(!(e instanceof HTMLFormElement))return;const t=e.querySelector("[data-qrcode-mode]"),a=e.querySelector("[data-qrcode-toggle]"),i=e.querySelector("[data-url-group]"),r=e.querySelector("[data-audio-group]"),s=e.querySelector("[data-video-group]");if(!(t instanceof HTMLInputElement)||!a||!i||!r||!s)return;const l=()=>{const p=t.value==="mp3"?"mp3":t.value==="video"?"video":"url",n=p==="mp3",u=p==="video";i.hidden=n||u,r.hidden=!n,s.hidden=!u;const m=i.querySelector("input[name='target_url']"),d=r.querySelector("input[name='audio']"),o=s.querySelector("input[name='video']");m instanceof HTMLInputElement&&(m.disabled=n||u,(n||u)&&(m.value="")),d instanceof HTMLInputElement&&(d.disabled=!n,n||(d.value="")),o instanceof HTMLInputElement&&(o.disabled=!u,u||(o.value=""))};a.addEventListener("click",p=>{const n=p.target;if(!(n instanceof HTMLElement))return;const u=n.closest("[data-mode]");if(!u)return;const m=u.getAttribute("data-mode"),d=m==="mp3"?"mp3":m==="video"?"video":"url";t.value=d,a.querySelectorAll(".segmented__item").forEach(v=>{v.classList.toggle("is-active",v===u),v.setAttribute("aria-selected",v===u?"true":"false")}),l()}),t.value="url",l()},He=e=>`
  <nav class="breadcrumbs">
    <a class="breadcrumbs__item" href="#" data-link="home">首页</a>
    <span class="breadcrumbs__item">${e.name}</span>
  </nav>
`,De=e=>`
  <div class="module-detail__meta">
    ${e.tags.map(t=>`<span class="module-detail__meta-item">${t.label}</span>`).join("")}
    <span class="module-detail__meta-item">API: ${e.endpoint}</span>
    <span class="module-detail__meta-item">后端: ${T}</span>
  </div>
`,Ce=e=>{const t=`name="${e.id}" id="${e.id}" ${e.required?"required":""}`,a=e.description?`<p class="form__hint">${e.description}</p>`:"";switch(e.type){case"textarea":return`
        <div class="form__group">
          <label class="form__label" for="${e.id}">${e.label}${e.required?"<sup>*</sup>":""}</label>
          <textarea class="textarea" ${t} placeholder="${e.placeholder??""}"></textarea>
          ${a}
        </div>
      `;case"select":return`
        <div class="form__group">
          <label class="form__label" for="${e.id}">${e.label}${e.required?"<sup>*</sup>":""}</label>
          <select class="select" ${t}>
            ${(e.options??[]).map(i=>`<option value="${i}">${i}</option>`).join("")}
          </select>
          ${a}
        </div>
      `;case"file":return`
        <div class="form__group">
          <label class="form__label" for="${e.id}">${e.label}${e.required?"<sup>*</sup>":""}</label>
          <input class="input" type="file" ${t} ${e.accept?`accept="${e.accept}"`:""} />
          ${a}
        </div>
      `;default:return`
        <div class="form__group">
          <label class="form__label" for="${e.id}">${e.label}${e.required?"<sup>*</sup>":""}</label>
          <input class="input" type="${e.type}" ${t} placeholder="${e.placeholder??""}" />
          ${a}
        </div>
      `}},Re=e=>{const t=O.find(i=>i.id===e);if(!t){J(`<div class="empty">
        <p>未找到对应模块。</p>
        <button class="button button--ghost" data-link="home">返回首页</button>
      </div>`);return}const a=t.id==="extract-frames"||t.id==="mp4-to-gif"?Pe(t):t.id==="qrcode-generator"?Ne():t.fields.map(Ce).join("");if(J(`
    ${He(t)}
    <section class="module-detail">
      <header class="module-detail__header">
        <h2 class="module-detail__title">${t.name}</h2>
        <p class="module-detail__desc">${t.description}</p>
        ${De(t)}
      </header>
      <div class="module-detail__body">
        <form class="form form-card" data-module-form="${t.id}" autocomplete="off">
          ${a}
          <div class="form__actions">
            <button class="button" type="submit">提交任务</button>
            <button class="button button--ghost" type="button" data-link="home">取消</button>
          </div>
          <div class="status status--info" hidden data-status-panel>
            <span class="status__text">等待提交</span>
            <span class="status__meta"></span>
          </div>
          <div class="result" hidden data-result-panel>
            <h3 class="result__title" data-result-title>处理结果</h3>
            <p class="result__meta" data-result-meta></p>
            <div class="result__actions" data-result-actions></div>
            <div class="result__previews" hidden data-result-previews></div>
            <div class="result__files" hidden data-result-files>
              <details>
                <summary class="result__files-summary">查看生成文件</summary>
                <ul class="result__file-list" data-result-file-list></ul>
              </details>
            </div>
          </div>
        </form>
      </div>
    </section>
  `),t.id==="extract-frames"||t.id==="mp4-to-gif"){const i=document.querySelector(`[data-module-form="${t.id}"]`);Oe(i)}else if(t.id==="qrcode-generator"){const i=document.querySelector(`[data-module-form="${t.id}"]`);Ae(i)}},ie=()=>{const e=window.location.hash;if(e.startsWith("#/module/")){const t=e.replace("#/module/","");Re(t)}else Fe()},je=()=>{qe(),ie(),window.addEventListener("hashchange",ie);const e=document.getElementById(_e);e&&(e.textContent=String(new Date().getFullYear())),oe(),Te()};je();
