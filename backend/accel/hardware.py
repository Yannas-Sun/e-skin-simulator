from __future__ import annotations

from dataclasses import dataclass, field
import math

from ..electrical.ngspice_backend import NgSpiceBackend, NgSpiceError


LIS3DH_WHO_AM_I = 0x0F
LIS3DH_WHO_AM_I_VALUE = 0x33
LIS3DH_TEMP_CFG_REG = 0x1F
LIS3DH_CTRL_REG1 = 0x20
LIS3DH_CTRL_REG4 = 0x23
LIS3DH_STATUS_REG = 0x27
LIS3DH_OUT_X_L = 0x28
LIS3DH_OUT_X_H = 0x29
LIS3DH_OUT_Y_L = 0x2A
LIS3DH_OUT_Y_H = 0x2B
LIS3DH_OUT_Z_L = 0x2C
LIS3DH_OUT_Z_H = 0x2D

LIS3DH_SPI_READ = 0x80
LIS3DH_SPI_AUTO_INCREMENT = 0x40

LIS3DH_REGISTER_TABLE = [
    {
        "name": "SPI command",
        "bits": ["R/W", "MS", "AD5", "AD4", "AD3", "AD2", "AD1", "AD0"],
        "description": "R/W=1 reads, R/W=0 writes. MS=1 auto-increments the 6-bit register address.",
    },
    {
        "name": "CTRL_REG1",
        "address": "0x20",
        "bits": ["ODR3", "ODR2", "ODR1", "ODR0", "LPen", "Zen", "Yen", "Xen"],
        "description": "Output data rate, low-power bit, and axis enables.",
    },
    {
        "name": "CTRL_REG4",
        "address": "0x23",
        "bits": ["BDU", "BLE", "FS1", "FS0", "HR", "ST1", "ST0", "SIM"],
        "description": "Block update, endian, full-scale range, high-resolution, self-test, and SPI mode.",
    },
    {
        "name": "OUT_X/Y/Z",
        "address": "0x28-0x2D",
        "bits": ["XL", "XH", "YL", "YH", "ZL", "ZH"],
        "description": "Six auto-incremented data bytes, little-endian signed 16-bit samples in this initial model.",
    },
]

ACCEL_VCC = 3.3
ACCEL_CS_PULLUP_OHMS = 10_000.0
ACCEL_CS_DECODER_SINK_OHMS = 70.0
ACCEL_CS_INPUT_LEAK_OHMS = 1_000_000_000.0
ACCEL_CS_LOW_THRESHOLD = 0.8
ACCEL_CS_HIGH_THRESHOLD = 2.0


def clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def signed16(value: int) -> int:
    value &= 0xFFFF
    return value - 0x10000 if value & 0x8000 else value


def int16_to_bytes(value: int) -> tuple[int, int]:
    value &= 0xFFFF
    return value & 0xFF, (value >> 8) & 0xFF


@dataclass
class AccelerometerElectricalDrive:
    """Electrical nCS-line model for the LIS3DH chip-select decoder."""

    vcc: float = ACCEL_VCC
    pullup_ohms: float = ACCEL_CS_PULLUP_OHMS
    decoder_sink_ohms: float = ACCEL_CS_DECODER_SINK_OHMS
    input_leak_ohms: float = ACCEL_CS_INPUT_LEAK_OHMS
    low_threshold: float = ACCEL_CS_LOW_THRESHOLD
    high_threshold: float = ACCEL_CS_HIGH_THRESHOLD
    use_ngspice: bool = True
    last_solver: str = "python"
    last_solver_detail: str = "active-low chip-select pull-up fallback"
    last_voltages: list[float] = field(default_factory=list)

    def solve_chip_select_voltages(self, selected_sensor: int, sensor_count: int) -> tuple[list[float], str, str]:
        selected_sensor = max(1, min(sensor_count, int(selected_sensor)))
        if self.use_ngspice:
            backend = NgSpiceBackend.discover()
            if backend is not None:
                try:
                    result = backend.simulate_accel_cs_mux(
                        selected_sensor=selected_sensor,
                        sensor_count=sensor_count,
                        vcc=self.vcc,
                        pullup_ohms=self.pullup_ohms,
                        decoder_sink_ohms=self.decoder_sink_ohms,
                        input_leak_ohms=self.input_leak_ohms,
                    )
                    return list(result["ncsVoltages"]), "ngspice", "active-low nCS decoder network solved by ngspice"
                except (NgSpiceError, OSError, ValueError):
                    pass

        unselected_voltage = self.vcc * self.input_leak_ohms / (self.pullup_ohms + self.input_leak_ohms)
        selected_sink = 1.0 / ((1.0 / self.decoder_sink_ohms) + (1.0 / self.input_leak_ohms))
        selected_voltage = self.vcc * selected_sink / (self.pullup_ohms + selected_sink)
        voltages = [unselected_voltage for _ in range(sensor_count)]
        voltages[selected_sensor - 1] = selected_voltage
        return voltages, "python", "active-low chip-select pull-up fallback"

    def chip_select_states(self, selected_sensor: int, sensor_count: int) -> list[dict]:
        voltages, solver, detail = self.solve_chip_select_voltages(selected_sensor, sensor_count)
        self.last_solver = solver
        self.last_solver_detail = detail
        self.last_voltages = voltages
        states = []
        for index, voltage in enumerate(voltages, start=1):
            cs_level = 0 if voltage <= self.low_threshold else 1
            states.append(
                {
                    "sensor": index,
                    "commanded": index == selected_sensor,
                    "selected": cs_level == 0,
                    "cs": cs_level,
                    "logic": "LOW_SELECTED" if cs_level == 0 else "HIGH_IDLE",
                    "ncsVoltage": voltage,
                    "solver": solver,
                }
            )
        return states

    def snapshot(self) -> dict:
        return {
            "engine": self.last_solver,
            "detail": self.last_solver_detail,
            "vcc": self.vcc,
            "pullupOhms": self.pullup_ohms,
            "decoderSinkOhms": self.decoder_sink_ohms,
            "inputLeakOhms": self.input_leak_ohms,
            "lowThreshold": self.low_threshold,
            "highThreshold": self.high_threshold,
            "ncsVoltages": self.last_voltages,
        }


@dataclass
class AccelerometerMux:
    outputs: int = 16
    selected: int = 1
    electrical: AccelerometerElectricalDrive = field(default_factory=AccelerometerElectricalDrive)

    def select(self, index: int) -> None:
        self.selected = max(1, min(self.outputs, int(index)))

    @property
    def address(self) -> int:
        return self.selected - 1

    @property
    def address_bits(self) -> list[int]:
        return [(self.address >> bit) & 1 for bit in range(4)]

    def chip_select_states(self) -> list[dict]:
        return self.electrical.chip_select_states(self.selected, self.outputs)

    def electrical_snapshot(self) -> dict:
        if not self.electrical.last_voltages:
            self.chip_select_states()
        return self.electrical.snapshot()


@dataclass
class LIS3DH:
    sensor_id: int
    full_scale_g: int = 8
    registers: dict[int, int] = field(default_factory=dict)
    last_raw: dict[str, int] = field(default_factory=lambda: {"x": 0, "y": 0, "z": 0})

    def __post_init__(self) -> None:
        self.reset()

    def reset(self) -> None:
        self.registers = {
            LIS3DH_WHO_AM_I: LIS3DH_WHO_AM_I_VALUE,
            LIS3DH_TEMP_CFG_REG: 0x80,
            LIS3DH_CTRL_REG1: 0x57,
            LIS3DH_CTRL_REG4: 0x28,
            LIS3DH_STATUS_REG: 0x08,
        }
        self.write_sample(0, 0, 0)

    def write_sample(self, x_raw: int, y_raw: int, z_raw: int) -> None:
        self.last_raw = {"x": signed16(x_raw), "y": signed16(y_raw), "z": signed16(z_raw)}
        for address, value in zip(
            [LIS3DH_OUT_X_L, LIS3DH_OUT_X_H, LIS3DH_OUT_Y_L, LIS3DH_OUT_Y_H, LIS3DH_OUT_Z_L, LIS3DH_OUT_Z_H],
            [*int16_to_bytes(x_raw), *int16_to_bytes(y_raw), *int16_to_bytes(z_raw)],
        ):
            self.registers[address] = value
        self.registers[LIS3DH_STATUS_REG] = 0x08

    def transfer(self, mosi: list[int]) -> dict:
        if not mosi:
            return {"command": None, "miso": [], "operation": "idle"}

        command = mosi[0] & 0xFF
        is_read = bool(command & LIS3DH_SPI_READ)
        auto_increment = bool(command & LIS3DH_SPI_AUTO_INCREMENT)
        address = command & 0x3F
        miso: list[int] = [0x00]
        operation = "read" if is_read else "write"

        if is_read:
            read_length = max(1, len(mosi) - 1)
            for offset in range(read_length):
                register = (address + offset) & 0x3F if auto_increment else address
                miso.append(self.registers.get(register, 0x00))
        else:
            for offset, value in enumerate(mosi[1:]):
                register = (address + offset) & 0x3F if auto_increment else address
                self.registers[register] = value & 0xFF
                miso.append(0x00)

        return {
            "command": {
                "value": command,
                "hex": f"0x{command:02X}",
                "binary": format(command, "08b"),
                "read": is_read,
                "autoIncrement": auto_increment,
                "address": address,
                "addressHex": f"0x{address:02X}",
            },
            "miso": miso,
            "operation": operation,
        }


class AccelerometerArray:
    def __init__(self, rows: int = 4, cols: int = 4) -> None:
        self.rows = rows
        self.cols = cols
        self.sensors = [LIS3DH(sensor_id=index) for index in range(1, rows * cols + 1)]

    def sensor_position(self, sensor_id: int) -> tuple[int, int]:
        row = (sensor_id - 1) // self.cols + 1
        col = (sensor_id - 1) % self.cols + 1
        return row, col

    def vibration_at(self, sensor_id: int, object_row: float, object_col: float, object_size: float, vibration_g: float) -> dict:
        row, col = self.sensor_position(sensor_id)
        sigma = max(0.45, object_size / 48.0)
        distance = math.hypot(row - object_row, col - object_col)
        envelope = math.exp(-(distance * distance) / (2 * sigma * sigma))
        local_g = vibration_g * envelope
        phase = sensor_id * 0.73
        x_g = local_g * math.sin(phase) * 0.72
        y_g = local_g * math.cos(phase * 0.81) * 0.64
        z_g = 1.0 + local_g * (0.50 + 0.28 * math.sin(phase * 1.3))
        return {
            "row": row,
            "col": col,
            "distance": distance,
            "envelope": envelope,
            "localG": local_g,
            "xG": x_g,
            "yG": y_g,
            "zG": z_g,
            "magnitudeG": math.sqrt(x_g * x_g + y_g * y_g + max(0.0, z_g - 1.0) ** 2),
        }

    def update_samples(self, object_row: float, object_col: float, object_size: float, vibration_g: float, full_scale_g: int = 8) -> list[dict]:
        samples = []
        counts_per_g = 32768 / full_scale_g
        for sensor in self.sensors:
            vibration = self.vibration_at(sensor.sensor_id, object_row, object_col, object_size, vibration_g)
            x_raw = int(clamp(vibration["xG"], -full_scale_g, full_scale_g) * counts_per_g)
            y_raw = int(clamp(vibration["yG"], -full_scale_g, full_scale_g) * counts_per_g)
            z_raw = int(clamp(vibration["zG"], -full_scale_g, full_scale_g) * counts_per_g)
            sensor.write_sample(x_raw, y_raw, z_raw)
            samples.append({"sensor": sensor.sensor_id, **vibration, "raw": sensor.last_raw})
        return samples

    def get(self, sensor_id: int) -> LIS3DH:
        return self.sensors[max(1, min(len(self.sensors), sensor_id)) - 1]


class LIS3DHTransferCounter:
    def __init__(self) -> None:
        self.counts = {
            "Address": {"perFrame": 0, "unit": "bit", "detail": "MCU wrote A1-A4 accelerometer MUX address bits"},
            "SCK": {"perFrame": 0, "unit": "pulse", "detail": "MCU generated SPI clocks for LIS3DH register reads"},
            "MOSI": {"perFrame": 0, "unit": "bit", "detail": "MCU sent LIS3DH register read commands and dummy bytes"},
            "MISO": {"perFrame": 0, "unit": "bit", "detail": "LIS3DH returned WHO_AM_I or X/Y/Z register bytes"},
            "CS": {"perFrame": 0, "unit": "assertion", "edgesPerFrame": 0, "detail": "MUX selected one LIS3DH CS line"},
        }
        self.events: list[dict] = []

    def record(self, sensor: int, address_bits: list[int], mosi: list[int], miso: list[int]) -> None:
        bits = len(mosi) * 8
        self.counts["Address"]["perFrame"] += len(address_bits)
        self.counts["SCK"]["perFrame"] += bits
        self.counts["MOSI"]["perFrame"] += bits
        self.counts["MISO"]["perFrame"] += max(0, len(miso) - 1) * 8
        self.counts["CS"]["perFrame"] += 1
        self.counts["CS"]["edgesPerFrame"] += 2
        self.events.append({"sensor": sensor, "mosiBytes": len(mosi), "misoDataBytes": max(0, len(miso) - 1), "sckPulses": bits})

    def snapshot(self, refresh_hz: float) -> dict:
        line_rates = {}
        for name, data in self.counts.items():
            per_frame = float(data["perFrame"])
            line_rates[name] = {
                "perFrame": per_frame,
                "perSecond": per_frame * refresh_hz,
                "unit": data["unit"],
                "detail": data["detail"],
            }
            if name == "CS":
                edges = float(data["edgesPerFrame"])
                line_rates[name]["edgesPerFrame"] = edges
                line_rates[name]["edgesPerSecond"] = edges * refresh_hz
        return {"source": "MCU event counter", "framesPerSecond": refresh_hz, "sensorsCounted": len(self.events), "lineRates": line_rates, "events": self.events}
