from __future__ import annotations

from dataclasses import dataclass
import re

from .hardware import (
    AccelerometerArray,
    AccelerometerMux,
    LIS3DH_OUT_X_L,
    LIS3DH_REGISTER_TABLE,
    LIS3DH_SPI_AUTO_INCREMENT,
    LIS3DH_SPI_READ,
    LIS3DHTransferCounter,
)
from ..fsr.hardware import ModuleUplinkSPI


def clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def format_byte(value: int) -> dict:
    value &= 0xFF
    return {"value": value, "hex": f"0x{value:02X}", "binary": format(value, "08b")}


def parse_spi_bytes(text: str) -> list[int]:
    tokens = re.split(r"[\s,;]+", text.strip())
    values: list[int] = []
    for token in tokens:
        if not token:
            continue
        cleaned = token.replace("_", "")
        if cleaned.lower().startswith("0b"):
            value = int(cleaned[2:], 2)
        elif cleaned.lower().startswith("0x"):
            value = int(cleaned[2:], 16)
        elif re.fullmatch(r"[01]{8}", cleaned):
            value = int(cleaned, 2)
        elif re.fullmatch(r"[0-9a-fA-F]{2}", cleaned) and re.search(r"[a-fA-F]", cleaned):
            value = int(cleaned, 16)
        else:
            value = int(cleaned, 10)
        if not 0 <= value <= 0xFF:
            raise ValueError(f"SPI byte out of range: {token}")
        values.append(value)
    return values


@dataclass
class AccelerometerReadoutProgram:
    mux: AccelerometerMux
    array: AccelerometerArray
    uplink: ModuleUplinkSPI
    refresh_hz: float = 25.0

    @classmethod
    def create(cls, refresh_hz: float = 25.0) -> "AccelerometerReadoutProgram":
        return cls(
            mux=AccelerometerMux(),
            array=AccelerometerArray(),
            uplink=ModuleUplinkSPI(rows=4, cols=4, sample_bits=48),
            refresh_hz=clamp(refresh_hz, 1.0, 700.0),
        )

    @property
    def read_xyz_command(self) -> list[int]:
        return [LIS3DH_SPI_READ | LIS3DH_SPI_AUTO_INCREMENT | LIS3DH_OUT_X_L, 0, 0, 0, 0, 0, 0]

    def tick(self, selected_sensor: int, object_row: float, object_col: float, object_size: float, vibration_g: float) -> dict:
        object_row = clamp(object_row, 1.0, 4.0)
        object_col = clamp(object_col, 1.0, 4.0)
        object_size = clamp(object_size, 20.0, 180.0)
        vibration_g = clamp(vibration_g, 0.0, 8.0)
        selected_sensor = max(1, min(16, int(selected_sensor)))

        generated_samples = self.array.update_samples(object_row, object_col, object_size, vibration_g)
        self.mux.select(selected_sensor)
        selected_chip_selects = self.mux.chip_select_states()
        selected_chip_state = selected_chip_selects[selected_sensor - 1]
        mosi = self.read_xyz_command
        selected_chip = self.array.get(selected_sensor)
        transfer = selected_chip.transfer(mosi)
        selected_decoded = self.decode_xyz_bytes(transfer["miso"][1:])

        frame_transfers = []
        counter = LIS3DHTransferCounter()
        for sensor_id in range(1, 17):
            self.mux.select(sensor_id)
            chip_selects = self.mux.chip_select_states()
            active_chip_select = chip_selects[sensor_id - 1]
            chip = self.array.get(sensor_id)
            result = chip.transfer(mosi)
            sample = self.decode_xyz_bytes(result["miso"][1:])
            counter.record(sensor_id, self.mux.address_bits, mosi, result["miso"])
            frame_transfers.append(
                {
                    "sensor": sensor_id,
                    "row": (sensor_id - 1) // 4 + 1,
                    "col": (sensor_id - 1) % 4 + 1,
                    "address": self.mux.address,
                    "addressBits": [{"name": f"A{bit + 1}", "level": level} for bit, level in enumerate(self.mux.address_bits)],
                    "cs": active_chip_select["cs"],
                    "chipSelect": active_chip_select,
                    "chipSelects": chip_selects,
                    "mosi": [format_byte(byte) for byte in mosi],
                    "miso": [format_byte(byte) for byte in result["miso"]],
                    "sample": sample,
                    "vibration": generated_samples[sensor_id - 1],
                }
            )

        self.mux.select(selected_sensor)
        selected_chip_selects = self.mux.chip_select_states()
        heatmap = [
            {
                "sensor": item["sensor"],
                "row": item["row"],
                "col": item["col"],
                "value": item["sample"]["magnitudeG"],
                "raw": item["sample"]["raw"],
                "bytes": item["miso"][1:],
            }
            for item in frame_transfers
        ]
        return {
            "selectedSensor": selected_sensor,
            "object": {"row": object_row, "col": object_col, "size": object_size, "vibrationG": vibration_g},
            "mux": {
                "address": self.mux.address,
                "addressBits": [{"name": f"A{bit + 1}", "level": level} for bit, level in enumerate(self.mux.address_bits)],
                "chipSelects": self.mux.chip_select_states(),
            },
            "electricalDrive": self.mux.electrical_snapshot(),
            "lis3dh": {
                "registerTable": LIS3DH_REGISTER_TABLE,
                "readCommand": {
                    "label": "Read OUT_X_L..OUT_Z_H",
                    "mosi": [format_byte(byte) for byte in mosi],
                    "command": format_byte(mosi[0]),
                    "address": "0x28",
                    "readBit": 1,
                    "autoIncrementBit": 1,
                },
                "outputFormat": "Six bytes: OUT_X_L, OUT_X_H, OUT_Y_L, OUT_Y_H, OUT_Z_L, OUT_Z_H. Each axis is little-endian signed 16-bit in this high-resolution simulation.",
            },
            "selectedTransfer": {
                "mosi": [format_byte(byte) for byte in mosi],
                "miso": [format_byte(byte) for byte in transfer["miso"]],
                "sample": selected_decoded,
                "command": transfer["command"],
                "chipSelect": selected_chip_state,
            },
            "frameTransfers": frame_transfers,
            "heatmap": heatmap,
            "mcu": counter.snapshot(self.refresh_hz),
            "moduleUplink": self.uplink.snapshot(self.refresh_hz, module_id=1),
            "clock": {
                "refreshHz": self.refresh_hz,
                "framePeriodMs": 1000.0 / self.refresh_hz,
                "sensorPeriodMs": 1000.0 / self.refresh_hz / 16.0,
                "spiClockHz": len(mosi) * 8 * 16 * self.refresh_hz,
            },
        }

    @staticmethod
    def decode_xyz_bytes(data: list[int]) -> dict:
        padded = list(data[:6]) + [0] * max(0, 6 - len(data))

        def axis(low_index: int) -> int:
            value = padded[low_index] | (padded[low_index + 1] << 8)
            return value - 0x10000 if value & 0x8000 else value

        raw = {"x": axis(0), "y": axis(2), "z": axis(4)}
        g = {name: value / 4096.0 for name, value in raw.items()}
        dynamic_z = g["z"] - 1.0
        magnitude = (g["x"] * g["x"] + g["y"] * g["y"] + dynamic_z * dynamic_z) ** 0.5
        return {"raw": raw, "g": g, "magnitudeG": magnitude}


def run_accel_readout(sensor: int, object_row: float, object_col: float, object_size: float, vibration_g: float, refresh_rate: float) -> dict:
    return AccelerometerReadoutProgram.create(refresh_rate).tick(sensor, object_row, object_col, object_size, vibration_g)


def run_lis3dh_spi_program(mosi_text: str, sensor: int, object_row: float, object_col: float, object_size: float, vibration_g: float) -> dict:
    program = AccelerometerReadoutProgram.create(25.0)
    state = program.tick(sensor, object_row, object_col, object_size, vibration_g)
    values = parse_spi_bytes(mosi_text)
    if not values:
        raise ValueError("Enter at least one SPI byte.")
    program.array.update_samples(object_row, object_col, object_size, vibration_g)
    program.mux.select(sensor)
    chip_selects = program.mux.chip_select_states()
    chip = program.array.get(sensor)
    result = chip.transfer(values)
    return {
        "selectedSensor": sensor,
        "chipSelect": chip_selects[sensor - 1],
        "electricalDrive": program.mux.electrical_snapshot(),
        "mosi": [format_byte(byte) for byte in values],
        "miso": [format_byte(byte) for byte in result["miso"]],
        "decodedCommand": result["command"],
        "operation": result["operation"],
        "sample": program.decode_xyz_bytes(result["miso"][1:]) if result["command"] and result["command"]["read"] else state["selectedTransfer"]["sample"],
    }
