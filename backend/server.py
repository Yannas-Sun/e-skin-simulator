from __future__ import annotations

import json
import math
import mimetypes
import os
import re
import shutil
import struct
import subprocess
import threading
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import unquote

try:
    import serial
except ImportError:  # pragma: no cover - reported through the API at runtime.
    serial = None

from .accel.sampler import run_accel_readout, run_lis3dh_spi_program
from .electrical.ngspice_backend import ngspice_health
from .fsr.sampler import run_adc_mosi_program, run_fsr_readout


ROOT = Path(__file__).resolve().parent.parent
FRONTEND_ROOT = ROOT / "frontend"
MODEL_ROOT = (FRONTEND_ROOT / "assets" / "models").resolve()
HARDWARE_ROOT = ROOT.parent / "hardware" / "e-skin_original"
FIRMWARE_TARGETS = {
    "fsr": {
        "label": "FSR-only",
        "sketch": HARDWARE_ROOT / "src" / "fsr_adc_plexed_serial" / "fsr_adc_plexed_serial.ino",
    },
    "combined": {
        "label": "FSR + ACC combined",
        "sketch": HARDWARE_ROOT / "src" / "Eskin" / "Eskin.ino",
    },
    "combined-delta": {
        "label": "FSR + ACC delta stream",
        "sketch": HARDWARE_ROOT / "src" / "Eskin" / "Eskin.ino",
    },
    "combined-triggered": {
        "label": "FSR triggered low/high scan",
        "sketch": HARDWARE_ROOT / "src" / "Eskin" / "Eskin.ino",
    },
}
DEFAULT_TEENSY_FQBN = "teensy:avr:teensy41"
LOCAL_ARDUINO_CLI = Path("D:/study/Programing/arduino/arduino-cli.exe")
FIRMWARE_BUILD_ROOT = ROOT / ".codex_firmware_build"
SERIAL_METER_ROOT = ROOT / ".codex_serial_meter"
FSR_HARDWARE_PROTOCOLS = {"fsr-serial", "eskin-fsr", "eskin-combined", "eskin-combined-stream", "eskin-combined-delta"}
MODULE_CHANNELS = 560
MODULE_METADATA_BYTES = 20
PATCH_METADATA_BYTES = 20
ETHERNET_OVERHEAD_BYTES = 66
UDP_PAYLOAD_BYTES = 1472
MODULES_PER_PATCH = 5


def read_exact(port: Any, size: int) -> bytes:
    data = port.read(size)
    if len(data) != size:
        raise TimeoutError(f"Expected {size} bytes, received {len(data)} bytes")
    return data


def read_until_magic(port: Any, magic: bytes) -> None:
    matched = 0
    deadline = time.time() + float(getattr(port, "timeout", 3) or 3)
    while time.time() < deadline:
        chunk = port.read(1)
        if not chunk:
            continue
        if chunk[0] == magic[matched]:
            matched += 1
            if matched == len(magic):
                return
        else:
            matched = 1 if chunk[0] == magic[0] else 0
    raise TimeoutError(f"Timed out waiting for stream frame marker {magic!r}")


def hardware_command(mode: int, n: int) -> int:
    return ((mode & 0x03) << 6) | (n & 0x3F)


def unpack_u16_grid(raw: bytes, n: int) -> list[list[int]]:
    values = struct.unpack("<" + "H" * (n * n), raw)
    return [list(values[row * n:(row + 1) * n]) for row in range(n)]


def unpack_interleaved_two_layer_fsr(raw: bytes, n: int) -> list[list[list[int]]]:
    values = struct.unpack("<" + "H" * (2 * n * n), raw)
    # Match MATLAB: fsr = reshape(fsr_vec, 2*n, n);
    # raw1 = fsr(1:n, :); raw2 = fsr(n+1:2*n, :).
    layer1 = [[0 for _ in range(n)] for _ in range(n)]
    layer2 = [[0 for _ in range(n)] for _ in range(n)]
    for selected_row in range(n):
        offset = selected_row * 2 * n
        for channel in range(n):
            layer1[channel][selected_row] = int(values[offset + channel])
            layer2[channel][selected_row] = int(values[offset + n + channel])
    return [layer1, layer2]


def normalize_grid(values: list[list[float]], display_limit: float | None = None) -> list[list[float]]:
    peak = display_limit if display_limit and display_limit > 0 else max((max(row) for row in values if row), default=1.0)
    peak = max(1.0, float(peak))
    return [[max(0.0, min(1.0, float(value) / peak)) for value in row] for row in values]


class FSRHardwareSession:
    def __init__(self, port: str, baud: int, protocol: str, n: int) -> None:
        if serial is None:
            raise RuntimeError("pyserial is not installed for this Python environment.")
        if protocol not in FSR_HARDWARE_PROTOCOLS:
            raise ValueError(f"Unsupported FSR hardware protocol: {protocol}")
        self.port_name = port
        self.baud = baud
        self.protocol = protocol
        self.n = n
        self.lock = threading.Lock()
        self.latest_lock = threading.Lock()
        self.baseline: list[list[list[float]]] | None = None
        self.previous_fsr_ts: int | None = None
        self.hardware_fps = 0.0
        self.serial_measured_bytes_per_second = 0.0
        self.delta_layers_state: list[list[list[int]]] | None = None
        self.latest_payload: dict[str, Any] | None = None
        self.latest_error: str | None = None
        self.stream_thread: threading.Thread | None = None
        self.stream_stop = threading.Event()
        self.stream_params: dict[str, Any] = {
            "layer": "max",
            "display_limit": 300.0,
            "deadband": 8.0,
            "layer2_deadband": 35.0,
        }
        self.opened_at = time.time()
        safe_meter_name = re.sub(r"[^A-Za-z0-9_.-]+", "_", f"{port}_{protocol}_{n}")
        SERIAL_METER_ROOT.mkdir(parents=True, exist_ok=True)
        self.serial_meter_path = SERIAL_METER_ROOT / f"{safe_meter_name}.bin"
        self.serial_meter_started_at = time.time()
        self.serial_meter_path.write_bytes(b"")
        self.port = serial.Serial(port, baud, timeout=3)
        time.sleep(0.8)
        self.port.reset_input_buffer()
        self.port.reset_output_buffer()

    def close(self) -> None:
        self.stop_stream()
        try:
            self.port.close()
        except Exception:
            pass
        try:
            self.serial_meter_path.write_bytes(b"")
        except Exception:
            pass

    def _roll_serial_meter(self) -> None:
        now = time.time()
        elapsed = now - self.serial_meter_started_at
        if elapsed < 1.0:
            return
        try:
            byte_count = self.serial_meter_path.stat().st_size
            self.serial_measured_bytes_per_second = byte_count / elapsed
            self.serial_meter_path.write_bytes(b"")
            self.serial_meter_started_at = now
        except OSError:
            self.serial_measured_bytes_per_second = 0.0
            self.serial_meter_started_at = now

    def _record_serial_bytes(self, data: bytes) -> None:
        if not data:
            return
        self._roll_serial_meter()
        try:
            with self.serial_meter_path.open("ab") as handle:
                handle.write(data)
        except OSError:
            pass

    def _read_exact(self, size: int) -> bytes:
        data = self.port.read(size)
        self._record_serial_bytes(data)
        if len(data) != size:
            raise TimeoutError(f"Expected {size} bytes, received {len(data)} bytes")
        return data

    def request_firmware_tare(self) -> None:
        try:
            self.port.write(b"T")
            self.port.flush()
            time.sleep(0.05)
            self.port.reset_input_buffer()
        except Exception:
            pass

    def _read_until_magic(self, magic: bytes) -> None:
        matched = 0
        deadline = time.time() + float(getattr(self.port, "timeout", 3) or 3)
        while time.time() < deadline:
            chunk = self.port.read(1)
            self._record_serial_bytes(chunk)
            if not chunk:
                continue
            if chunk[0] == magic[matched]:
                matched += 1
                if matched == len(magic):
                    return
            else:
                matched = 1 if chunk[0] == magic[0] else 0
        raise TimeoutError(f"Timed out waiting for stream frame marker {magic!r}")

    def _read_delta_marker(self) -> bytes:
        markers = {b"ESKF", b"ESKD", b"ESKN"}
        window = bytearray()
        deadline = time.time() + float(getattr(self.port, "timeout", 3) or 3)
        while time.time() < deadline:
            chunk = self.port.read(1)
            self._record_serial_bytes(chunk)
            if not chunk:
                continue
            window += chunk
            if len(window) > 4:
                del window[0]
            if len(window) == 4 and bytes(window) in markers:
                return bytes(window)
        raise TimeoutError("Timed out waiting for delta stream frame marker ESKF/ESKD/ESKN")

    def _empty_delta_state(self) -> list[list[list[int]]]:
        return [[[0 for _ in range(self.n)] for _ in range(self.n)] for _ in range(2)]

    def start_stream(
        self,
        layer: str = "max",
        display_limit: float = 300.0,
        deadband: float = 8.0,
        layer2_deadband: float | None = 35.0,
    ) -> None:
        self.stream_params = {
            "layer": layer,
            "display_limit": display_limit,
            "deadband": deadband,
            "layer2_deadband": layer2_deadband,
        }
        if self.stream_thread and self.stream_thread.is_alive():
            return
        self.stream_stop.clear()
        self.stream_thread = threading.Thread(target=self._stream_loop, daemon=True)
        self.stream_thread.start()

    def stop_stream(self) -> None:
        self.stream_stop.set()
        if self.stream_thread and self.stream_thread.is_alive() and threading.current_thread() is not self.stream_thread:
            self.stream_thread.join(timeout=1.5)

    def _stream_loop(self) -> None:
        while not self.stream_stop.is_set():
            params = dict(self.stream_params)
            try:
                payload = self.frame_payload(**params)
                with self.latest_lock:
                    self.latest_payload = payload
                    self.latest_error = None
            except Exception as exc:
                with self.latest_lock:
                    self.latest_error = str(exc)
                time.sleep(0.05)

    def cached_payload(self) -> dict[str, Any]:
        with self.latest_lock:
            if self.latest_error:
                raise RuntimeError(self.latest_error)
            if self.latest_payload is not None:
                return dict(self.latest_payload)
        empty = [[0.0 for _ in range(self.n)] for _ in range(self.n)]
        return {
            "ok": True,
            "source": "hardware",
            "status": "warming",
            "port": self.port_name,
            "baud": self.baud,
            "protocol": self.protocol,
            "n": self.n,
            "layer": self.stream_params["layer"],
            "baselineReady": self.baseline is not None,
            "hardwareFps": self.hardware_fps,
            "raw": empty,
            "values": empty,
            "normalized": empty,
            "layersRaw": [empty],
            "layersValues": [empty],
            "layersNormalized": [empty],
            "layerMaxValues": [0.0],
            "maxValue": 0.0,
            "displayLimit": self.stream_params["display_limit"],
            "deadband": self.stream_params["deadband"],
            "layer2Deadband": self.stream_params["layer2_deadband"],
            "serialBytesPerFrame": 0,
            "serialBitsPerSecond": 0.0,
            "serialMeasuredBytesPerSecond": self.serial_measured_bytes_per_second,
            "serialMeterPath": str(self.serial_meter_path),
        }

    def read_frame(self) -> dict[str, Any]:
        with self.lock:
            if self.protocol == "fsr-serial":
                frame = self._read_fsr_serial()
            elif self.protocol == "eskin-fsr":
                frame = self._read_eskin_fsr()
            elif self.protocol == "eskin-combined-stream":
                frame = self._read_eskin_combined_stream()
            elif self.protocol == "eskin-combined-delta":
                frame = self._read_eskin_combined_delta()
            else:
                frame = self._read_eskin_combined()
            self._update_hardware_fps(frame.get("tsFsr"))
            return frame

    def tare(self, frames: int = 20) -> dict[str, Any]:
        self.stop_stream()
        self.request_firmware_tare()
        frames = max(1, min(200, int(frames)))
        sums: list[list[list[float]]] | None = None
        captured = 0
        for _ in range(frames):
            frame = self.read_frame()
            layers = frame["layers"]
            if sums is None:
                sums = [[[0.0 for _ in row] for row in layer] for layer in layers]
            for layer_index, layer in enumerate(layers):
                for row_index, row in enumerate(layer):
                    for col_index, value in enumerate(row):
                        sums[layer_index][row_index][col_index] += float(value)
            captured += 1
        if sums is None or captured == 0:
            raise RuntimeError("No hardware frames were captured for tare.")
        self.baseline = [
            [[value / captured for value in row] for row in layer]
            for layer in sums
        ]
        with self.latest_lock:
            self.latest_payload = None
            self.latest_error = None
        return {"frames": captured}

    def _read_fsr_serial(self) -> dict[str, Any]:
        self.port.write(bytes([self.n]))
        ts0 = int.from_bytes(self._read_exact(4), "little")
        ts1 = int.from_bytes(self._read_exact(4), "little")
        raw = self._read_exact(self.n * self.n * 2)
        return {
            "ts0": ts0,
            "tsFsr": ts1,
            "serialBytesPerFrame": 1 + 8 + self.n * self.n * 2,
            "layers": [unpack_u16_grid(raw, self.n)],
        }

    def _read_eskin_fsr(self) -> dict[str, Any]:
        self.port.write(bytes([hardware_command(0, self.n)]))
        ts_fsr = int.from_bytes(self._read_exact(4), "little")
        if ts_fsr == 0:
            raise TimeoutError("Eskin firmware returned ts_fsr=0; FSR frame is not ready yet.")
        raw = self._read_exact(self.n * self.n * 2)
        return {
            "ts0": 0,
            "tsFsr": ts_fsr,
            "serialBytesPerFrame": 1 + 4 + self.n * self.n * 2,
            "layers": [unpack_u16_grid(raw, self.n)],
        }

    def _read_eskin_combined(self) -> dict[str, Any]:
        self.port.write(bytes([hardware_command(3, self.n)]))
        return self._read_eskin_combined_payload(serial_bytes_per_frame=1 + 8 + 16 * 3 * 2 + 2 * self.n * self.n * 2)

    def _read_eskin_combined_stream(self) -> dict[str, Any]:
        self._read_until_magic(b"ESKN")
        return self._read_eskin_combined_payload(serial_bytes_per_frame=4 + 8 + 16 * 3 * 2 + 2 * self.n * self.n * 2)

    def _read_eskin_combined_delta(self) -> dict[str, Any]:
        marker = self._read_delta_marker()
        ts_acc = int.from_bytes(self._read_exact(4), "little")
        ts_fsr = int.from_bytes(self._read_exact(4), "little")
        acc_raw = self._read_exact(16 * 3 * 2)
        acc_values = struct.unpack("<" + "h" * (16 * 3), acc_raw)
        if self.delta_layers_state is None:
            self.delta_layers_state = self._empty_delta_state()

        serial_bytes = 4 + 8 + 16 * 3 * 2
        changed_count = 0
        if marker == b"ESKF":
            fsr_raw = self._read_exact(2 * self.n * self.n * 2)
            self.delta_layers_state = unpack_interleaved_two_layer_fsr(fsr_raw, self.n)
            serial_bytes += 2 * self.n * self.n * 2
        elif marker == b"ESKD":
            changed_count = int.from_bytes(self._read_exact(2), "little")
            serial_bytes += 2
            for _ in range(changed_count):
                item = self._read_exact(4)
                layer_row = item[0]
                layer = 1 if layer_row & 0x80 else 0
                row = layer_row & 0x0F
                col = item[1] & 0x0F
                value = int.from_bytes(item[2:4], "little")
                if layer < 2 and row < self.n and col < self.n:
                    self.delta_layers_state[layer][row][col] = value
            serial_bytes += changed_count * 4

        return {
            "tsAcc": ts_acc,
            "tsFsr": ts_fsr,
            "serialBytesPerFrame": serial_bytes,
            "frameType": marker.decode("ascii"),
            "changedCount": changed_count,
            "acc": [list(acc_values[index * 3:(index + 1) * 3]) for index in range(16)],
            "layers": [[row[:] for row in layer] for layer in self.delta_layers_state],
        }

    def _read_eskin_combined_payload(self, serial_bytes_per_frame: int) -> dict[str, Any]:
        ts_acc = int.from_bytes(self._read_exact(4), "little")
        ts_fsr = int.from_bytes(self._read_exact(4), "little")
        acc_raw = self._read_exact(16 * 3 * 2)
        fsr_raw = self._read_exact(2 * self.n * self.n * 2)
        acc_values = struct.unpack("<" + "h" * (16 * 3), acc_raw)
        return {
            "tsAcc": ts_acc,
            "tsFsr": ts_fsr,
            "serialBytesPerFrame": serial_bytes_per_frame,
            "acc": [list(acc_values[index * 3:(index + 1) * 3]) for index in range(16)],
            "layers": unpack_interleaved_two_layer_fsr(fsr_raw, self.n),
        }

    def _update_hardware_fps(self, timestamp: int | None) -> None:
        if timestamp is None:
            return
        if self.previous_fsr_ts is not None:
            dt_us = int(timestamp) - int(self.previous_fsr_ts)
            if dt_us < 0:
                dt_us += 2**32
            if dt_us > 0:
                self.hardware_fps = 1_000_000.0 / dt_us
        self.previous_fsr_ts = int(timestamp)

    def frame_payload(
        self,
        layer: str = "0",
        display_limit: float = 300.0,
        deadband: float = 8.0,
        layer2_deadband: float | None = None,
    ) -> dict[str, Any]:
        frame = self.read_frame()
        raw_layers = frame["layers"]
        delta_layers = self._delta_layers(raw_layers, deadband, layer2_deadband)
        selected = self._select_layer(delta_layers, layer)
        raw_selected = self._select_layer(raw_layers, layer)
        max_value = max((max(row) for row in selected if row), default=0.0)
        serial_bytes = int(frame.get("serialBytesPerFrame", 0))
        self._roll_serial_meter()
        serial_measured_bytes = float(self.serial_measured_bytes_per_second)
        layer_max_values = [max((max(row) for row in layer_data if row), default=0.0) for layer_data in delta_layers]
        payload = {
            "ok": True,
            "source": "hardware",
            "port": self.port_name,
            "baud": self.baud,
            "protocol": self.protocol,
            "n": self.n,
            "layer": layer,
            "baselineReady": self.baseline is not None,
            "hardwareFps": self.hardware_fps,
            "tsFsr": frame.get("tsFsr"),
            "tsAcc": frame.get("tsAcc"),
            "frameType": frame.get("frameType"),
            "changedCount": frame.get("changedCount"),
            "raw": raw_selected,
            "values": selected,
            "normalized": normalize_grid(selected, display_limit),
            "layersRaw": raw_layers,
            "layersValues": delta_layers,
            "layersNormalized": [normalize_grid(layer_data, display_limit) for layer_data in delta_layers],
            "layerMaxValues": layer_max_values,
            "maxValue": max_value,
            "displayLimit": display_limit,
            "deadband": deadband,
            "layer2Deadband": layer2_deadband if layer2_deadband is not None else deadband,
            "serialBytesPerFrame": serial_bytes,
            "serialMeasuredBytesPerSecond": serial_measured_bytes,
            "serialBitsPerSecond": serial_measured_bytes * 8,
            "serialEstimatedBitsPerSecond": serial_bytes * 8 * self.hardware_fps,
            "serialMeterPath": str(self.serial_meter_path),
        }
        if "acc" in frame:
            payload["acc"] = frame["acc"]
            payload["accPreview"] = frame["acc"][:4]
        return payload

    def _delta_layers(
        self,
        layers: list[list[list[int]]],
        deadband: float,
        layer2_deadband: float | None = None,
    ) -> list[list[list[float]]]:
        thresholds = [float(deadband), float(layer2_deadband if layer2_deadband is not None else deadband)]
        if self.baseline is None:
            return [[[float(value) for value in row] for row in layer] for layer in layers]
        result: list[list[list[float]]] = []
        for layer_index, layer in enumerate(layers):
            base = self.baseline[min(layer_index, len(self.baseline) - 1)]
            threshold = thresholds[min(layer_index, len(thresholds) - 1)]
            output_layer = []
            for row_index, row in enumerate(layer):
                output_row = []
                for col_index, value in enumerate(row):
                    delta = max(0.0, float(value) - float(base[row_index][col_index]))
                    output_row.append(0.0 if delta < threshold else delta)
                output_layer.append(output_row)
            result.append(output_layer)
        return result

    def _select_layer(self, layers: list[list[list[float]]], layer: str) -> list[list[float]]:
        if layer == "max" and len(layers) > 1:
            return [
                [max(float(layers[0][row][col]), float(layers[1][row][col])) for col in range(self.n)]
                for row in range(self.n)
            ]
        index = 1 if layer == "1" and len(layers) > 1 else 0
        return [[float(value) for value in row] for row in layers[index]]


FSR_HARDWARE_SESSIONS: dict[tuple[str, int, str, int], FSRHardwareSession] = {}
FSR_HARDWARE_SESSIONS_LOCK = threading.RLock()


def get_fsr_hardware_session(port: str, baud: int, protocol: str, n: int) -> FSRHardwareSession:
    key = (port, baud, protocol, n)
    with FSR_HARDWARE_SESSIONS_LOCK:
        session = FSR_HARDWARE_SESSIONS.get(key)
        if session and getattr(session.port, "is_open", False):
            return session
        if session:
            session.close()
            FSR_HARDWARE_SESSIONS.pop(key, None)
        for existing_key, existing_session in list(FSR_HARDWARE_SESSIONS.items()):
            if existing_key[0].upper() == port.upper():
                existing_session.close()
                FSR_HARDWARE_SESSIONS.pop(existing_key, None)
        session = FSRHardwareSession(port, baud, protocol, n)
        FSR_HARDWARE_SESSIONS[key] = session
        return session


def close_fsr_hardware_sessions(port: str | None = None) -> int:
    closed = 0
    with FSR_HARDWARE_SESSIONS_LOCK:
        for key, session in list(FSR_HARDWARE_SESSIONS.items()):
            if port and key[0].upper() != port.upper():
                continue
            session.close()
            FSR_HARDWARE_SESSIONS.pop(key, None)
            closed += 1
    return closed


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
        super().__init__(*args, directory=str(FRONTEND_ROOT), **kwargs)

    def end_headers(self) -> None:
        if self.path.endswith((".js", ".css", ".html")):
            self.send_header("Cache-Control", "no-store, max-age=0")
            self.send_header("Pragma", "no-cache")
        super().end_headers()

    def do_GET(self) -> None:
        if self.path == "/api/ngspice-health":
            self.write_json(ngspice_health())
            return
        if self.path.startswith("/assets/models/"):
            self.serve_model_asset()
            return
        super().do_GET()

    def do_HEAD(self) -> None:
        if self.path.startswith("/assets/models/"):
            self.serve_model_asset(send_body=False)
            return
        super().do_HEAD()

    def serve_model_asset(self, send_body: bool = True) -> None:
        relative = unquote(self.path.removeprefix("/assets/models/")).split("?", 1)[0]
        requested = (MODEL_ROOT / relative).resolve()
        if not requested.is_file() or not requested.is_relative_to(MODEL_ROOT):
            self.send_error(404)
            return

        content_type = mimetypes.guess_type(requested.name)[0] or "application/octet-stream"
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(requested.stat().st_size))
        self.end_headers()
        if not send_body:
            return
        with requested.open("rb") as handle:
            while chunk := handle.read(1024 * 1024):
                self.wfile.write(chunk)

    def do_POST(self) -> None:
        if self.path == "/api/simulate":
            self.handle_simulation()
            return
        if self.path == "/api/fsr-readout":
            self.handle_fsr_readout()
            return
        if self.path == "/api/fsr-hardware-frame":
            self.handle_fsr_hardware_frame()
            return
        if self.path == "/api/fsr-hardware-tare":
            self.handle_fsr_hardware_tare()
            return
        if self.path == "/api/fsr-hardware-close":
            self.handle_fsr_hardware_close()
            return
        if self.path == "/api/adc-mosi":
            self.handle_adc_mosi()
            return
        if self.path == "/api/accel-readout":
            self.handle_accel_readout()
            return
        if self.path == "/api/lis3dh-spi":
            self.handle_lis3dh_spi()
            return
        if self.path == "/api/flash-firmware":
            self.handle_flash_firmware()
            return
        self.send_error(404)

    def handle_simulation(self) -> None:
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
        self.write_json(response)

    def handle_fsr_readout(self) -> None:
        length = int(self.headers.get("Content-Length", "0"))
        payload = json.loads(self.rfile.read(length) or b"{}")
        response = run_fsr_readout(
            row=int(payload.get("row", 1)),
            col=int(payload.get("col", 8)),
            force=float(payload.get("force", 62)),
            object_row=int(payload.get("objectRow", payload.get("row", 1))),
            object_size=float(payload.get("objectSize", 72)),
            object_mass=float(payload.get("objectMass", payload.get("force", 62) * 10)),
            refresh_rate=float(payload.get("refreshRate", 10)),
            scan_col=int(payload.get("scanCol", payload.get("adcCol", payload.get("col", 8)))),
        )
        self.write_json(response)

    def handle_fsr_hardware_frame(self) -> None:
        length = int(self.headers.get("Content-Length", "0"))
        payload = json.loads(self.rfile.read(length) or b"{}")
        port = str(payload.get("port", "COM5")).strip() or "COM5"
        try:
            session = get_fsr_hardware_session(
                port=port,
                baud=int(payload.get("baud", 500000)),
                protocol=str(payload.get("protocol", "fsr-serial")).strip() or "fsr-serial",
                n=int(payload.get("n", 16)),
            )
            session.start_stream(
                layer=str(payload.get("layer", "0")),
                display_limit=float(payload.get("displayLimit", 300)),
                deadband=float(payload.get("deadband", 8)),
                layer2_deadband=float(payload.get("layer2Deadband", 35)),
            )
            response = session.cached_payload()
            self.write_json(response)
        except Exception as exc:
            close_fsr_hardware_sessions(port=port)
            self.write_json({"ok": False, "source": "hardware", "error": str(exc)}, status=400)

    def handle_fsr_hardware_tare(self) -> None:
        length = int(self.headers.get("Content-Length", "0"))
        payload = json.loads(self.rfile.read(length) or b"{}")
        port = str(payload.get("port", "COM5")).strip() or "COM5"
        try:
            session = get_fsr_hardware_session(
                port=port,
                baud=int(payload.get("baud", 500000)),
                protocol=str(payload.get("protocol", "fsr-serial")).strip() or "fsr-serial",
                n=int(payload.get("n", 16)),
            )
            response = session.tare(frames=int(payload.get("frames", 20)))
            self.write_json({"ok": True, "source": "hardware", **response})
        except Exception as exc:
            close_fsr_hardware_sessions(port=port)
            self.write_json({"ok": False, "source": "hardware", "error": str(exc)}, status=400)

    def handle_fsr_hardware_close(self) -> None:
        length = int(self.headers.get("Content-Length", "0"))
        payload = json.loads(self.rfile.read(length) or b"{}")
        port = str(payload.get("port", "")).strip() or None
        closed = close_fsr_hardware_sessions(port=port)
        self.write_json({"ok": True, "source": "hardware", "closed": closed, "port": port or "all"})

    def handle_adc_mosi(self) -> None:
        length = int(self.headers.get("Content-Length", "0"))
        payload = json.loads(self.rfile.read(length) or b"{}")
        try:
            response = run_adc_mosi_program(
                mosi_text=str(payload.get("mosi", "")),
                row=int(payload.get("row", 1)),
                col=int(payload.get("col", 8)),
                object_row=int(payload.get("objectRow", payload.get("row", 1))),
                object_size=float(payload.get("objectSize", 72)),
                object_mass=float(payload.get("objectMass", payload.get("force", 62) * 10)),
            )
        except (TypeError, ValueError) as exc:
            self.send_response(400)
            self.send_header("Content-Type", "application/json")
            data = json.dumps({"error": str(exc)}).encode("utf-8")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            return
        self.write_json(response)

    def handle_accel_readout(self) -> None:
        length = int(self.headers.get("Content-Length", "0"))
        payload = json.loads(self.rfile.read(length) or b"{}")
        response = run_accel_readout(
            sensor=int(payload.get("sensor", 1)),
            object_row=float(payload.get("objectRow", 2.5)),
            object_col=float(payload.get("objectCol", 2.5)),
            object_size=float(payload.get("objectSize", 96)),
            vibration_g=float(payload.get("vibrationG", 2.4)),
            refresh_rate=float(payload.get("refreshRate", 25)),
        )
        self.write_json(response)

    def handle_lis3dh_spi(self) -> None:
        length = int(self.headers.get("Content-Length", "0"))
        payload = json.loads(self.rfile.read(length) or b"{}")
        try:
            response = run_lis3dh_spi_program(
                mosi_text=str(payload.get("mosi", "")),
                sensor=int(payload.get("sensor", 1)),
                object_row=float(payload.get("objectRow", 2.5)),
                object_col=float(payload.get("objectCol", 2.5)),
                object_size=float(payload.get("objectSize", 96)),
                vibration_g=float(payload.get("vibrationG", 2.4)),
            )
        except (TypeError, ValueError) as exc:
            self.send_response(400)
            self.send_header("Content-Type", "application/json")
            data = json.dumps({"error": str(exc)}).encode("utf-8")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            return
        self.write_json(response)

    def handle_flash_firmware(self) -> None:
        length = int(self.headers.get("Content-Length", "0"))
        payload = json.loads(self.rfile.read(length) or b"{}")
        target = str(payload.get("target", "")).strip().lower()
        port = str(payload.get("port", "COM5")).strip() or "COM5"
        fqbn = str(payload.get("fqbn", DEFAULT_TEENSY_FQBN)).strip() or DEFAULT_TEENSY_FQBN
        sample_hz = payload.get("sampleHz")
        trigger_threshold = payload.get("triggerThreshold")
        result = flash_firmware(
            target,
            port,
            fqbn,
            sample_hz=float(sample_hz) if sample_hz not in (None, "") else None,
            trigger_threshold=float(trigger_threshold) if trigger_threshold not in (None, "") else None,
        )
        status = 200 if result.get("ok") else 400
        self.write_json(result, status=status)

    def write_json(self, response: dict[str, Any], status: int = 200) -> None:
        data = json.dumps(response).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


def prepare_firmware_sketch(
    config: dict[str, Any],
    target: str,
    sample_hz: float | None,
    trigger_threshold: float | None = None,
) -> tuple[Path, dict[str, Any]]:
    source = Path(config["sketch"])
    metadata: dict[str, Any] = {"sourceSketch": str(source), "sampleHz": sample_hz}
    if sample_hz is None:
        return source, metadata

    sample_hz = max(1.0, min(5000.0, float(sample_hz)))
    if target == "combined-triggered" and sample_hz <= 10:
        sample_hz = 200.0
    metadata["sampleHz"] = sample_hz
    trigger_threshold_value = max(0, min(65535, int(trigger_threshold if trigger_threshold is not None else 150)))
    metadata["triggerThreshold"] = trigger_threshold_value
    build_root = FIRMWARE_BUILD_ROOT / target / str(int(time.time() * 1000))
    build_dir = build_root / source.parent.name
    build_root.mkdir(parents=True, exist_ok=True)
    ignore_firmware_artifacts = shutil.ignore_patterns(
        ".vscode",
        ".git",
        ".github",
        "__pycache__",
        "*.pyc",
        "build",
        ".build",
        ".pio",
    )
    shutil.copytree(source.parent, build_dir, ignore=ignore_firmware_artifacts)
    sketch = build_dir / source.name
    text = sketch.read_text(encoding="utf-8")

    if target in ("combined", "combined-delta", "combined-triggered"):
        text = text.replace("#define ACC_SAMPLE_RATE 200", f"#define ACC_SAMPLE_RATE {int(sample_hz)}")
        text = text.replace("#define FSR_SAMPLE_RATE 50", f"#define FSR_SAMPLE_RATE {int(sample_hz)}")
        if target == "combined-triggered":
            stream_loop = rf'''
void
loop()
{{
    static uint32_t last_stream_us = 0;
    static uint32_t last_active_us = 0;
    static bool high_speed_active = false;
    static bool has_trigger_baseline = false;
    static uint16_t trigger_baseline_fsr[2 * 16 * 16];
    static uint16_t stream_fsr_data[2 * 16 * 16];
    const uint32_t idle_interval_us = 100000UL;
    const uint32_t active_interval_us = 1000000UL / FSR_SAMPLE_RATE;
    const uint16_t trigger_threshold = {trigger_threshold_value};
    uint32_t now = micros();
    while(Serial.available() > 0)
    {{
        uint8_t control = Serial.read();
        if(control == 'T')
        {{
            has_trigger_baseline = false;
            high_speed_active = false;
            last_active_us = now;
        }}
    }}
    uint32_t interval_us = high_speed_active ? active_interval_us : idle_interval_us;
    if((uint32_t)(now - last_stream_us) < interval_us)
        return;
    last_stream_us = now;

    ts_acc = micros();
    for(int i = 0; i < 16; i++)
        lis3dh[i].getAccelerationRaw((uint8_t *)&acc_data[i * 3]);

    ts_fsr = micros();
    uint16_t max_delta = 0;

    if(high_speed_active)
    {{
        fsr.scan_2array(fsr_data, 16);
        for(int selected_row = 0; selected_row < 16; selected_row++)
        {{
            const int layer2_row8_index = selected_row * 32 + 16 + 7;
            fsr_data[layer2_row8_index] = fsr_data[layer2_row8_index] / 7;
        }}
        for(int index = 0; index < 2 * 16 * 16; index++)
        {{
            stream_fsr_data[index] = fsr_data[index];
        }}
        for(int row = 0; row < 16; row++)
        {{
            for(int col = 0; col < 16; col++)
            {{
                for(int layer = 0; layer < 2; layer++)
                {{
                    const int index = row * 32 + layer * 16 + col;
                    int diff = (int)fsr_data[index] - (int)trigger_baseline_fsr[index];
                    if(diff < 0)
                        diff = -diff;
                    if(diff > max_delta)
                        max_delta = diff;
                }}
            }}
        }}
        if(max_delta > trigger_threshold)
            last_active_us = now;
        else if((uint32_t)(now - last_active_us) > 1000000UL)
        {{
            high_speed_active = false;
            for(int row = 0; row < 16; row++)
            {{
                for(int col = 0; col < 16; col++)
                    for(int layer = 0; layer < 2; layer++)
                    {{
                        const int index = row * 32 + layer * 16 + col;
                        trigger_baseline_fsr[index] = fsr_data[index];
                    }}
            }}
            has_trigger_baseline = true;
        }}
    }}
    else
    {{
        fsr.scan_2array(fsr_data, 16);
        for(int selected_row = 0; selected_row < 16; selected_row++)
        {{
            const int layer2_row8_index = selected_row * 32 + 16 + 7;
            fsr_data[layer2_row8_index] = fsr_data[layer2_row8_index] / 7;
        }}
        for(int row = 0; row < 16; row++)
        {{
            for(int col = 0; col < 16; col++)
            {{
                for(int layer = 0; layer < 2; layer++)
                {{
                    const int index = row * 32 + layer * 16 + col;
                    uint16_t value = fsr_data[index];
                    if(has_trigger_baseline)
                    {{
                        int diff = (int)value - (int)trigger_baseline_fsr[index];
                        if(diff < 0)
                            diff = -diff;
                        if(diff > max_delta)
                            max_delta = diff;
                    }}
                    else
                    {{
                        trigger_baseline_fsr[index] = value;
                    }}
                }}
            }}
        }}
        if(!has_trigger_baseline)
            has_trigger_baseline = true;
        if(max_delta > trigger_threshold)
        {{
            high_speed_active = true;
            last_active_us = now;
            fsr.scan_2array(fsr_data, 16);
            for(int selected_row = 0; selected_row < 16; selected_row++)
            {{
                const int layer2_row8_index = selected_row * 32 + 16 + 7;
                fsr_data[layer2_row8_index] = fsr_data[layer2_row8_index] / 7;
            }}
            for(int index = 0; index < 2 * 16 * 16; index++)
                stream_fsr_data[index] = fsr_data[index];
        }}
        else
        {{
            for(int index = 0; index < 2 * 16 * 16; index++)
                stream_fsr_data[index] = fsr_data[index];
        }}
    }}

    Serial.write((const uint8_t *)"ESKN", 4);
    Serial.write((uint8_t *)&ts_acc, 4);
    Serial.write((uint8_t *)&ts_fsr, 4);
    Serial.write((uint8_t *)&acc_data, 2 * 16 * 3);
    Serial.write((uint8_t *)&stream_fsr_data, 2 * 2 * 16 * 16);
}}
'''.strip()
            metadata["frequencyMode"] = "Triggered streaming: idle scans both FSR layers at fixed 10 Hz, switches to FSR_SAMPLE_RATE when either layer changes from tare baseline beyond threshold, then sleeps after ~1 s below threshold"
            metadata["protocol"] = "eskin-combined-stream"
        elif target == "combined-delta":
            stream_loop = r'''
void
loop()
{
    static uint32_t last_stream_us = 0;
    static uint16_t previous_fsr_data[2 * 16 * 16];
    static bool has_previous_fsr = false;
    static uint16_t frames_since_full_sync = 0;
    const uint32_t interval_us = 1000000UL / FSR_SAMPLE_RATE;
    const uint16_t delta_threshold = 8;
    const uint16_t full_sync_interval = FSR_SAMPLE_RATE > 0 ? FSR_SAMPLE_RATE : 1;
    uint32_t now = micros();
    if((uint32_t)(now - last_stream_us) < interval_us)
        return;
    last_stream_us = now;

    ts_acc = micros();
    for(int i = 0; i < 16; i++)
        lis3dh[i].getAccelerationRaw((uint8_t *)&acc_data[i * 3]);

    ts_fsr = micros();
    fsr.scan_2array(fsr_data, 16);
    for(int selected_row = 0; selected_row < 16; selected_row++)
    {
        const int layer2_row8_index = selected_row * 32 + 16 + 7;
        fsr_data[layer2_row8_index] = fsr_data[layer2_row8_index] / 7;
    }

    bool send_full = !has_previous_fsr || frames_since_full_sync >= full_sync_interval;
    if(send_full)
    {
        Serial.write((const uint8_t *)"ESKF", 4);
        Serial.write((uint8_t *)&ts_acc, 4);
        Serial.write((uint8_t *)&ts_fsr, 4);
        Serial.write((uint8_t *)&acc_data, 2 * 16 * 3);
        Serial.write((uint8_t *)&fsr_data, 2 * 2 * 16 * 16);
        for(int index = 0; index < 2 * 16 * 16; index++)
            previous_fsr_data[index] = fsr_data[index];
        has_previous_fsr = true;
        frames_since_full_sync = 0;
        return;
    }

    uint16_t changed_count = 0;
    for(int selected_row = 0; selected_row < 16; selected_row++)
    {
        for(int layer = 0; layer < 2; layer++)
        {
            for(int channel = 0; channel < 16; channel++)
            {
                const int index = selected_row * 32 + layer * 16 + channel;
                int diff = (int)fsr_data[index] - (int)previous_fsr_data[index];
                if(diff < 0)
                    diff = -diff;
                if(diff > delta_threshold)
                    changed_count++;
            }
        }
    }

    if(changed_count == 0)
    {
        Serial.write((const uint8_t *)"ESKN", 4);
        Serial.write((uint8_t *)&ts_acc, 4);
        Serial.write((uint8_t *)&ts_fsr, 4);
        Serial.write((uint8_t *)&acc_data, 2 * 16 * 3);
        frames_since_full_sync++;
        return;
    }

    Serial.write((const uint8_t *)"ESKD", 4);
    Serial.write((uint8_t *)&ts_acc, 4);
    Serial.write((uint8_t *)&ts_fsr, 4);
    Serial.write((uint8_t *)&acc_data, 2 * 16 * 3);
    Serial.write((uint8_t *)&changed_count, 2);
    for(int selected_row = 0; selected_row < 16; selected_row++)
    {
        for(int layer = 0; layer < 2; layer++)
        {
            for(int channel = 0; channel < 16; channel++)
            {
                const int index = selected_row * 32 + layer * 16 + channel;
                int diff = (int)fsr_data[index] - (int)previous_fsr_data[index];
                if(diff < 0)
                    diff = -diff;
                if(diff > delta_threshold)
                {
                    uint8_t layer_row = (layer ? 0x80 : 0x00) | (channel & 0x0F);
                    uint8_t col = selected_row & 0x0F;
                    uint16_t value = fsr_data[index];
                    Serial.write(&layer_row, 1);
                    Serial.write(&col, 1);
                    Serial.write((uint8_t *)&value, 2);
                    previous_fsr_data[index] = fsr_data[index];
                }
            }
        }
    }
    frames_since_full_sync++;
}
'''.strip()
            metadata["frequencyMode"] = "Teensy delta streaming: loop() sends full sync, changed FSR cells, or no-change heartbeat at FSR_SAMPLE_RATE"
            metadata["protocol"] = "eskin-combined-delta"
        else:
            stream_loop = r'''
void
loop()
{
    static uint32_t last_stream_us = 0;
    const uint32_t interval_us = 1000000UL / FSR_SAMPLE_RATE;
    uint32_t now = micros();
    if((uint32_t)(now - last_stream_us) < interval_us)
        return;
    last_stream_us = now;

    ts_acc = micros();
    for(int i = 0; i < 16; i++)
        lis3dh[i].getAccelerationRaw((uint8_t *)&acc_data[i * 3]);

    ts_fsr = micros();
    fsr.scan_2array(fsr_data, 16);
    for(int selected_row = 0; selected_row < 16; selected_row++)
    {
        const int layer2_row8_index = selected_row * 32 + 16 + 7;
        fsr_data[layer2_row8_index] = fsr_data[layer2_row8_index] / 7;
    }

    Serial.write((const uint8_t *)"ESKN", 4);
    Serial.write((uint8_t *)&ts_acc, 4);
    Serial.write((uint8_t *)&ts_fsr, 4);
    Serial.write((uint8_t *)&acc_data, 2 * 16 * 3);
    Serial.write((uint8_t *)&fsr_data, 2 * 2 * 16 * 16);
}
'''.strip()
            metadata["frequencyMode"] = "Teensy active streaming: loop() sends ACC + two FSR layers at FSR_SAMPLE_RATE"
            metadata["protocol"] = "eskin-combined-stream"
        text = re.sub(r"\nvoid\s*\nloop\(\)\s*\{.*\}\s*$", "\n" + stream_loop + "\n", text, flags=re.S)
    else:
        banner = f"#define FSR_SAMPLE_RATE {int(sample_hz)}\n"
        if "#define FSR_SAMPLE_RATE" not in text:
            text = text.replace("#include \"fsr.hpp\"\n", f"#include \"fsr.hpp\"\n{banner}", 1)
        metadata["frequencyMode"] = "host-requested live poll rate; FSR-only firmware scans when commanded"

    sketch.write_text(text, encoding="utf-8")
    metadata["preparedSketch"] = str(sketch)
    return sketch, metadata


def cleanup_prepared_firmware(sketch: Path) -> bool:
    try:
        sketch_path = sketch.resolve()
        build_root = FIRMWARE_BUILD_ROOT.resolve()
        relative_parts = sketch_path.relative_to(build_root).parts
        if len(relative_parts) < 4:
            return False
        target_dir = build_root / relative_parts[0] / relative_parts[1]
        for path in sorted(target_dir.rglob("*"), key=lambda item: len(item.parts), reverse=True):
            try:
                os.chmod(path, 0o700)
            except OSError:
                pass
        try:
            os.chmod(target_dir, 0o700)
        except OSError:
            pass
        shutil.rmtree(target_dir, ignore_errors=True)
        return not target_dir.exists()
    except (OSError, ValueError):
        return False


def flash_firmware(
    target: str,
    port: str,
    fqbn: str,
    sample_hz: float | None = None,
    trigger_threshold: float | None = None,
) -> dict[str, Any]:
    config = FIRMWARE_TARGETS.get(target)
    if not config:
        return {
            "ok": False,
            "error": "Unknown firmware target. Use 'fsr', 'combined', 'combined-delta', or 'combined-triggered'.",
            "targets": sorted(FIRMWARE_TARGETS),
        }

    try:
        sketch, sketch_metadata = prepare_firmware_sketch(config, target, sample_hz, trigger_threshold)
    except Exception as exc:
        return {
            "ok": False,
            "target": target,
            "label": config["label"],
            "error": f"Could not prepare firmware sketch: {exc}",
        }

    if not sketch.exists():
        response = {
            "ok": False,
            "target": target,
            "error": f"Sketch not found: {sketch}",
        }
        response["temporaryBuildCleaned"] = cleanup_prepared_firmware(sketch)
        return response

    arduino_cli = shutil.which("arduino-cli")
    if not arduino_cli and LOCAL_ARDUINO_CLI.exists():
        arduino_cli = str(LOCAL_ARDUINO_CLI)
    if not arduino_cli:
        response = {
            "ok": False,
            "target": target,
            "label": config["label"],
            "port": port,
            "fqbn": fqbn,
            "sketch": str(sketch),
            **sketch_metadata,
            "error": "arduino-cli not found. Install Arduino CLI and Teensy board support first.",
            "hint": f"Expected CLI commands: arduino-cli compile --fqbn {fqbn} {sketch}; arduino-cli upload -p {port} --fqbn {fqbn} {sketch}",
        }
        response["temporaryBuildCleaned"] = cleanup_prepared_firmware(sketch)
        return response

    compile_cmd = [arduino_cli, "compile", "--fqbn", fqbn, str(sketch)]
    upload_cmd = [arduino_cli, "upload", "-p", port, "--fqbn", fqbn, str(sketch)]
    response: dict[str, Any]
    try:
        close_fsr_hardware_sessions(port=port)
        compile_result = subprocess.run(
            compile_cmd,
            cwd=str(sketch.parent),
            capture_output=True,
            text=True,
            timeout=180,
        )
        if compile_result.returncode != 0:
            response = {
                "ok": False,
                "stage": "compile",
                "target": target,
                "label": config["label"],
                "command": " ".join(compile_cmd),
                **sketch_metadata,
                "stdout": compile_result.stdout[-4000:],
                "stderr": compile_result.stderr[-4000:],
            }
            return response
        upload_result = subprocess.run(
            upload_cmd,
            cwd=str(sketch.parent),
            capture_output=True,
            text=True,
            timeout=180,
        )
        response = {
            "ok": upload_result.returncode == 0,
            "stage": "upload",
            "target": target,
            "label": config["label"],
            "port": port,
            "fqbn": fqbn,
            "sketch": str(sketch),
            **sketch_metadata,
            "compileCommand": " ".join(compile_cmd),
            "uploadCommand": " ".join(upload_cmd),
            "stdout": (compile_result.stdout + "\n" + upload_result.stdout)[-5000:],
            "stderr": (compile_result.stderr + "\n" + upload_result.stderr)[-5000:],
        }
        return response
    except subprocess.TimeoutExpired as exc:
        response = {
            "ok": False,
            "stage": "timeout",
            "target": target,
            "label": config["label"],
            "error": str(exc),
        }
        return response
    finally:
        cleaned_temp = cleanup_prepared_firmware(sketch)
        if "response" in locals():
            response["temporaryBuildCleaned"] = cleaned_temp

def main() -> None:
    server = ThreadingHTTPServer(("127.0.0.1", 8000), Handler)
    try:
        print("e-skin simulator running at http://127.0.0.1:8000")
        server.serve_forever()
    except (AttributeError, OSError, KeyboardInterrupt):
        pass
    finally:
        close_fsr_hardware_sessions()
        server.server_close()


if __name__ == "__main__":
    main()
