from __future__ import annotations

import json
import math
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parent
MODULE_CHANNELS = 560
MODULE_METADATA_BYTES = 20
PATCH_METADATA_BYTES = 20
ETHERNET_OVERHEAD_BYTES = 66
UDP_PAYLOAD_BYTES = 1472
MODULES_PER_PATCH = 5


def hex_vertices(cx: float, cy: float, radius: float) -> list[tuple[float, float]]:
    return [
        (cx + radius * math.cos(math.radians(angle)), cy + radius * math.sin(math.radians(angle)))
        for angle in (0, 60, 120, 180, 240, 300)
    ]


def point_in_polygon(x: float, y: float, points: list[tuple[float, float]]) -> bool:
    inside = False
    j = len(points) - 1
    for i, point in enumerate(points):
        xi, yi = point
        xj, yj = points[j]
        intersects = (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / ((yj - yi) or 1e-9) + xi
        if intersects:
            inside = not inside
        j = i
    return inside


def point_in_object(x: float, y: float, obj: dict[str, Any]) -> bool:
    size = float(obj.get("size", 74))
    half = size / 2
    ox = float(obj.get("x", 0))
    oy = float(obj.get("y", 0))
    dx = x - ox
    dy = y - oy
    shape = obj.get("shape", "circle")

    if shape == "circle":
        return dx * dx + dy * dy <= half * half
    if shape == "square":
        return abs(dx) <= half and abs(dy) <= half
    if shape == "triangle":
        points = [(ox, oy - half), (ox + half, oy + half), (ox - half, oy + half)]
        return point_in_polygon(x, y, points)
    return False


def object_area(obj: dict[str, Any]) -> float:
    size = max(1.0, float(obj.get("size", 74)))
    shape = obj.get("shape", "circle")
    if shape == "circle":
        return math.pi * (size / 2) ** 2
    if shape == "triangle":
        return size * size / 2
    return size * size


def compute_pressure(modules: list[dict[str, Any]], objects: list[dict[str, Any]]) -> dict[str, Any]:
    cells: list[dict[str, Any]] = []
    active_taxels = 0
    peak_pressure = 0.0
    total_contact = 0

    for module in modules:
        mx = float(module.get("x", 0))
        my = float(module.get("y", 0))
        radius = float(module.get("radius", 62))
        vertices = hex_vertices(mx, my, radius)
        module_values: list[float] = []

        for row in range(16):
            for col in range(16):
                tx = mx - radius * 0.72 + col * (radius * 1.44 / 15)
                ty = my - radius * 0.58 + row * (radius * 1.16 / 15)
                if not point_in_polygon(tx, ty, vertices):
                    module_values.append(0.0)
                    continue

                pressure = 0.0
                for obj in objects:
                    if point_in_object(tx, ty, obj):
                        mass = float(obj.get("mass", 220))
                        area = object_area(obj)
                        local = (mass / area) * 180.0
                        distance = math.hypot(tx - float(obj.get("x", 0)), ty - float(obj.get("y", 0)))
                        local *= max(0.35, 1.0 - distance / max(1.0, float(obj.get("size", 74))))
                        pressure += local

                pressure = min(1.0, pressure)
                if pressure > 0.18:
                    active_taxels += 2
                    total_contact += 1
                peak_pressure = max(peak_pressure, pressure)
                module_values.append(pressure)

        cells.append({"id": module.get("id"), "values": module_values})

    return {
        "cells": cells,
        "activeTaxels": active_taxels,
        "peakPressure": peak_pressure,
        "contactCells": total_contact,
    }


def compute_throughput(module_count: int, sampling_hz: float) -> dict[str, float | int | str]:
    frame_bytes = MODULE_CHANNELS * 2 + MODULE_METADATA_BYTES
    module_bps = frame_bytes * sampling_hz
    patch_count = math.ceil(module_count / MODULES_PER_PATCH) if module_count else 0
    ethernet_total = 0.0

    for patch_index in range(patch_count):
        modules_in_patch = min(MODULES_PER_PATCH, module_count - patch_index * MODULES_PER_PATCH)
        patch_payload = modules_in_patch * frame_bytes + PATCH_METADATA_BYTES
        packets = math.ceil(patch_payload / UDP_PAYLOAD_BYTES)
        ethernet_total += (patch_payload + packets * ETHERNET_OVERHEAD_BYTES) * sampling_hz

    mbps = ethernet_total / 1_000_000
    mbit = mbps * 8
    link_capacity = 12.5 if mbit <= 100 else 125.0
    link_name = "100BASE-TX" if mbit <= 100 else "1000BASE-T"
    utilization = min(100.0, (mbps / link_capacity) * 100 if link_capacity else 0.0)

    return {
        "moduleBytesPerSecond": module_bps,
        "megabytesPerSecond": mbps,
        "megabitsPerSecond": mbit,
        "patches": patch_count,
        "utilization": utilization,
        "link": link_name,
    }


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def do_POST(self) -> None:
        if self.path != "/api/simulate":
            self.send_error(404)
            return

        length = int(self.headers.get("Content-Length", "0"))
        payload = json.loads(self.rfile.read(length) or b"{}")
        modules = payload.get("modules", [])
        objects = payload.get("objects", [])
        sampling_hz = float(payload.get("samplingHz", 700))

        pressure = compute_pressure(modules, objects)
        throughput = compute_throughput(len(modules), sampling_hz)
        response = {
            "pressure": pressure,
            "throughput": throughput,
            "moduleCount": len(modules),
            "objectCount": len(objects),
        }
        data = json.dumps(response).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


def main() -> None:
    server = ThreadingHTTPServer(("127.0.0.1", 8000), Handler)
    print("e-skin simulator running at http://127.0.0.1:8000")
    server.serve_forever()


if __name__ == "__main__":
    main()
