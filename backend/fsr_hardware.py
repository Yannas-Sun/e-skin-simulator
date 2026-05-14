from __future__ import annotations

from dataclasses import dataclass


VCC = 3.3
ADC_BITS = 12
ADC_MAX_CODE = (1 << ADC_BITS) - 1


@dataclass(frozen=True)
class Resistor:
    ohms: float


@dataclass
class FSR:
    min_ohms: float = 3_500.0
    max_ohms: float = 180_000.0

    def resistance(self, force_percent: float) -> float:
        force = max(0.0, min(1.0, force_percent / 100.0))
        return self.max_ohms * (1.0 - force) ** 2 + self.min_ohms


class DMUX:
    """16-output row driver controlled by four address lines A1-A4."""

    def __init__(self, outputs: int = 16, vcc: float = VCC) -> None:
        self.outputs = outputs
        self.vcc = vcc
        self.address = 0

    def set_address_bits(self, bits: list[int]) -> None:
        value = 0
        for index, bit in enumerate(bits[:4]):
            value |= (1 if bit else 0) << index
        self.address = max(0, min(self.outputs - 1, value))

    def set_selected_row(self, row: int) -> None:
        self.address = max(0, min(self.outputs - 1, row - 1))

    @property
    def selected_row(self) -> int:
        return self.address + 1

    @property
    def address_bits(self) -> list[int]:
        return [(self.address >> bit) & 1 for bit in range(4)]

    def row_voltage(self, row: int) -> float:
        return self.vcc if row == self.selected_row else 0.0

    def row_states(self) -> list[dict[str, int | float | bool | str]]:
        return [
            {
                "row": row,
                "selected": row == self.selected_row,
                "state": "Vcc" if row == self.selected_row else "GND",
                "voltage": self.row_voltage(row),
                "diode": True,
            }
            for row in range(1, self.outputs + 1)
        ]


class ADC:
    """16-channel ADC model with command, SAR conversion, FIFO, and active-low EOC."""

    def __init__(self, channels: int = 16, bits: int = ADC_BITS, vref: float = VCC) -> None:
        self.channels = channels
        self.bits = bits
        self.vref = vref
        self.max_code = (1 << bits) - 1
        self.fifo: list[dict[str, int | float | str]] = []
        self.eoc = 1

    def encode(self, voltage: float) -> int:
        clamped = max(0.0, min(self.vref, voltage))
        return round((clamped / self.vref) * self.max_code)

    def scan_command(self, start_channel: int = 0, scan_mode: int = 0b11, x_bit: int = 0) -> dict:
        channel = max(0, min(self.channels - 1, start_channel))
        mode = max(0, min(0b11, scan_mode))
        value = 0b10000000 | (channel << 3) | (mode << 1) | (1 if x_bit else 0)
        bits = {
            "bit7": 1,
            "CH3": (channel >> 3) & 1,
            "CH2": (channel >> 2) & 1,
            "CH1": (channel >> 1) & 1,
            "CH0": channel & 1,
            "SC1": (mode >> 1) & 1,
            "SC0": mode & 1,
            "X": 1 if x_bit else 0,
        }
        return {
            "value": value,
            "binary": format(value, "08b"),
            "hex": f"0x{value:02X}",
            "startChannel": channel,
            "scanMode": mode,
            "scanModeLabel": "AIN0-AIN15 sequence" if channel == 0 and mode == 0b11 else "channel sequence",
            "bits": bits,
            "format": "bit7 CH3 CH2 CH1 CH0 SC1 SC0 X",
        }

    def sar_convert(self, channel: int, voltage: float) -> dict[str, int | float | str]:
        return {
            "channel": channel,
            "ain": f"AIN{channel - 1}",
            "voltage": voltage,
            "code": self.encode(voltage),
            "stage": "sample -> SAR convert -> FIFO",
        }

    def start_scan(self, voltages: list[float], command: dict | None = None) -> dict:
        command = self.scan_command() if command is None else command
        self.eoc = 1
        self.fifo = []
        conversions = []
        for index, voltage in enumerate(voltages[: self.channels]):
            conversion = self.sar_convert(index + 1, voltage)
            self.fifo.append(conversion)
            conversions.append(conversion)
        self.eoc = 0
        return {
            "command": command,
            "channels": [f"AIN{index}" for index in range(len(conversions))],
            "conversions": conversions,
            "fifoDepth": len(self.fifo),
            "eoc": self.eoc,
            "eocState": "LOW_CONVERSION_COMPLETE",
        }

    def read_fifo(self) -> list[dict[str, int | float | str]]:
        return self.fifo.copy()


class SPIBus:
    """Four-wire SPI interface between the MCU and ADC."""

    def __init__(self) -> None:
        self.lines = {
            "SCK": {
                "direction": "MCU -> ADC",
                "carries": "serial clock pulses for each ADC data bit",
            },
            "MOSI": {
                "direction": "MCU -> ADC",
                "carries": "read command and channel-frame control",
            },
            "MISO": {
                "direction": "ADC -> MCU",
                "carries": "16 sequential 12-bit ADC conversion words",
            },
            "CS": {
                "direction": "MCU -> ADC",
                "carries": "active-low ADC chip select during the frame",
            },
        }

    def frame(self, row: int, command: dict, words: list[int]) -> dict:
        return {
            "summary": f"row {row}, ADC scan command then 16 FIFO words",
            "command": command,
            "words": words,
            "transactions": [
                {
                    "phase": "command",
                    "cs": "LOW -> HIGH",
                    "mosi": command["binary"],
                    "miso": "idle",
                    "description": "MCU selects ADC, sends the 8-bit scan command, then releases CS.",
                },
                {
                    "phase": "read_fifo",
                    "cs": "LOW -> HIGH",
                    "sckPulses": len(words) * ADC_BITS,
                    "mosi": "dummy clocks / no payload",
                    "miso": "16 sequential 12-bit ADC words from FIFO",
                    "description": "After EOC is low, MCU selects ADC again and clocks FIFO data out on MISO.",
                },
            ],
            "lines": [
                {
                    "name": name,
                    "direction": line["direction"],
                    "carries": line["carries"],
                }
                for name, line in self.lines.items()
            ],
        }


class FSRArray:
    """16 x 16 FSR matrix with column load resistors to ground."""

    def __init__(self, rows: int = 16, cols: int = 16, load_ohms: float = 10_000.0, vcc: float = VCC) -> None:
        self.rows = rows
        self.cols = cols
        self.vcc = vcc
        self.load = Resistor(load_ohms)
        self.fsr = FSR()

    def force_at(self, row: int, col: int, pressed_row: int, pressed_col: int, object_size: float, object_mass: float) -> float:
        peak_force = max(0.0, min(100.0, object_mass / 10.0))
        half_side = object_size / 2.0
        dx = abs(col - pressed_col) * 40.0
        dy = abs(row - pressed_row) * 23.0
        if dx > half_side or dy > half_side:
            return 0.0
        edge_falloff = max(dx, dy) / max(1.0, half_side)
        return peak_force * (1.0 - 0.28 * edge_falloff)

    def divider_voltage(self, row_voltage: float, fsr_ohms: float) -> float:
        if row_voltage <= 0:
            return 0.0
        return row_voltage * (self.load.ohms / (fsr_ohms + self.load.ohms))

    def read_row(self, dmux: DMUX, pressed_row: int, pressed_col: int, object_size: float, object_mass: float) -> list[dict[str, int | float | bool]]:
        row = dmux.selected_row
        row_voltage = dmux.row_voltage(row)
        readings: list[dict[str, int | float | bool]] = []
        for col in range(1, self.cols + 1):
            force = self.force_at(row, col, pressed_row, pressed_col, object_size, object_mass)
            resistance = self.fsr.resistance(force)
            voltage = self.divider_voltage(row_voltage, resistance)
            readings.append(
                {
                    "row": row,
                    "col": col,
                    "force": force,
                    "fsrOhms": resistance,
                    "loadOhms": self.load.ohms,
                    "nodeVoltage": voltage,
                    "active": force > 0,
                }
            )
        return readings
