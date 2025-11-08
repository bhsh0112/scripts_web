import socket
import ipaddress
from typing import Dict, List, Optional, Set, Tuple

import scapy.all as scapy

try:
    import netifaces as ni  # type: ignore
except ImportError:  # pragma: no cover
    ni = None


def get_my_ip() -> Optional[str]:
    """获取本机 IP 地址，优先使用 netifaces，回退到 socket。"""
    if ni is not None:
        try:
            gateway = ni.gateways().get("default", {})
            gw_v4 = gateway.get(ni.AF_INET)
            if gw_v4:
                gateway_interface = gw_v4[1]
                my_ip = ni.ifaddresses(gateway_interface)[ni.AF_INET][0]["addr"]
                return my_ip
        except Exception as exc:  # noqa: BLE001
            print(f"Error getting local IP address via netifaces: {exc}")

    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("8.8.8.8", 80))
            return s.getsockname()[0]
    except Exception as exc:  # noqa: BLE001
        print(f"Error getting local IP address via socket: {exc}")
        return None


def get_network_range(my_ip: str) -> str:
    """从 IP 地址推断网段（向后兼容，默认 /24）。"""
    ip_parts = my_ip.split(".")
    return f"{ip_parts[0]}.{ip_parts[1]}.{ip_parts[2]}.1/24"


def _cidr_from_addr_mask(addr: str, netmask: str) -> Optional[str]:
    try:
        network = ipaddress.IPv4Network(f"{addr}/{netmask}", strict=False)
        # 排除 /32（点对点、回环）
        if network.prefixlen >= 32:
            return None
        # 排除 127.0.0.0/8、169.254.0.0/16 等非期望网段
        if network.network_address.is_loopback or network.network_address.is_link_local:
            return None
        return str(network)
    except Exception:
        return None


def get_all_networks() -> List[str]:
    """获取所有可扫描的本地 IPv4 网段（CIDR）。"""
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
        except Exception as exc:  # noqa: BLE001
            print(f"Error reading interfaces via netifaces: {exc}")

    if not cidrs:
        # 回退：使用 get_my_ip 并假定 /24
        my_ip = get_my_ip()
        if my_ip:
            ip_parts = my_ip.split(".")
            cidrs.add(f"{ip_parts[0]}.{ip_parts[1]}.{ip_parts[2]}.1/24")
    return sorted(cidrs)


def scan_network(network_range: str) -> List[Dict[str, str]]:
    """使用 ARP 扫描指定网段，返回设备基本信息。"""
    try:
        arp_request = scapy.ARP(pdst=network_range)
        broadcast = scapy.Ether(dst="ff:ff:ff:ff:ff:ff")
        arp_request_broadcast = broadcast / arp_request
        answered_list = scapy.srp(arp_request_broadcast, timeout=1.2, verbose=False)[0]

        devices: List[Dict[str, str]] = []
        for sent, received in answered_list:
            device_info = {"ip": received.psrc, "mac": received.hwsrc}
            devices.append(device_info)
        return devices
    except Exception as exc:
        print(f"Error scanning network {network_range}: {exc}")
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
    """基于主机名与端口的简单启发式分类。"""
    hn = (hostname or "").lower()
    ports = set(open_ports)

    # 摄像头常见端口：RTSP 554、厂商常用 8000/8554、带 Web 80/8080
    if 554 in ports or 8000 in ports or "cam" in hn or "ipcam" in hn or "hik" in hn or "dahua" in hn:
        return "camera"

    # 打印机：9100 或主机名包含常见关键字
    if 9100 in ports or "printer" in hn or "hp" in hn or "canon" in hn or "epson" in hn:
        return "printer"

    # 计算机/服务器：SMB 或 SSH
    if 445 in ports or 139 in ports or 22 in ports or "mac" in hn or "win" in hn or "desktop" in hn or "laptop" in hn:
        return "computer"

    # 家庭/IoT：仅 Web/MQTT
    if (80 in ports or 443 in ports or 8080 in ports) and (1883 in ports or 8883 in ports or "iot" in hn):
        return "iot"

    # 网络设备：仅 Web 开放，或主机名包含常见路由关键字
    if (80 in ports or 443 in ports or 8080 in ports) and not (22 in ports or 445 in ports or 139 in ports):
        if "router" in hn or "switch" in hn or "gw" in hn or "ap" in hn:
            return "network"

    return "unknown"


def scan_lan_devices() -> Dict[str, object]:
    """扫描当前连接的局域网内全部设备，并进行分类与整合输出。"""
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

            devices_enriched.append(
                {
                    "ip": ip,
                    "mac": mac,
                    "hostname": hostname,
                    "open_ports": open_ports,
                    "category": category,
                    "name": name,
                }
            )

    # 分组统计
    groups: Dict[str, List[Dict[str, object]]] = {
        "camera": [],
        "computer": [],
        "printer": [],
        "network": [],
        "iot": [],
        "unknown": [],
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


def print_devices(devices: List[Dict[str, str]]) -> None:
    """兼容旧输出：仅打印 IP 与 MAC。"""
    print("Devices in the network:")
    print(f"{'IP Address':<20}{'MAC Address':<20}")
    for device in devices:
        print(f"{device['ip']:<20}{device['mac']:<20}")


if __name__ == "__main__":
    result = scan_lan_devices()
    print("Scanned networks:", ", ".join(result.get("networks", [])))
    print_devices([{ "ip": d["ip"], "mac": d["mac"] } for d in result.get("devices", [])])  # type: ignore[index]