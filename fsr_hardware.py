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
    """Parallel 16-channel ADC model."""

    def __init__(self, channels: int = 16, bits: int = ADC_BITS, vref: float = VCC) -> None:
        self.channels = channels
        self.bits = bits
        self.vref = vref
        self.max_code = (1 << bits) - 1

    def encode(self, voltage: float) -> int:
        clamped = max(0.0, min(self.vref, voltage))
        return round((clamped / self.vref) * self.max_code)

    def sample_parallel(self, voltages: list[float]) -> list[dict[str, int | float]]:
        return [
            {
                "channel": index + 1,
                "voltage": voltage,
                "code": self.encode(voltage),
            }
            for index, voltage in enumerate(voltages[: self.channels])
        ]


class FSRArray:
    """16 x 16 FSR matrix with column load resistors to ground."""

    def __init__(self, rows: int = 16, cols: int = 16, load_ohms: float = 10_000.0, vcc: float = VCC) -> None:
        self.rows = rows
        self.cols = cols
        self.vcc = vcc
        self.load = Resistor(load_ohms)
        self.fsr = FSR()

    def force_at(self, row: int, col: int, pressed_row: int, pressed_col: int, force_percent: float) -> float:
        if row != pressed_row:
            return 0.0
        distance = abs(col - pressed_col)
        if distance == 0:
            return force_percent
        return max(0.0, force_percent * 0.08 * (2.718281828 ** (-distance / 2.5)))

    def divider_voltage(self, row_voltage: float, fsr_ohms: float) -> float:
        if row_voltage <= 0:
            return 0.0
        return row_voltage * (self.load.ohms / (fsr_ohms + self.load.ohms))

    def read_row(self, dmux: DMUX, pressed_row: int, pressed_col: int, force_percent: float) -> list[dict[str, int | float | bool]]:
        row = dmux.selected_row
        row_voltage = dmux.row_voltage(row)
        readings: list[dict[str, int | float | bool]] = []
        for col in range(1, self.cols + 1):
            force = self.force_at(row, col, pressed_row, pressed_col, force_percent)
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
                    "active": row == pressed_row and col == pressed_col,
                }
            )
        return readings
