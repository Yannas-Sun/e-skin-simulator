from __future__ import annotations

from dataclasses import dataclass


VCC = 3.3
ADC_BITS = 12
ADC_MAX_CODE = (1 << ADC_BITS) - 1
MODULE_FRAME_METADATA_BYTES = 20
MODULE_UPLINK_COMMAND_BITS = 32
MODULE_UPLINK_WORD_BITS = 16


@dataclass
class Clock:
    """Unified hardware clock derived from the selected refresh rate."""

    refresh_hz: float = 10.0
    rows_per_frame: int = 16
    adc_channels: int = 16
    adc_bits: int = ADC_BITS

    def __post_init__(self) -> None:
        self.refresh_hz = max(1.0, min(700.0, float(self.refresh_hz)))

    @property
    def frame_period_ms(self) -> float:
        return 1000.0 / self.refresh_hz

    @property
    def row_period_ms(self) -> float:
        return self.frame_period_ms / self.rows_per_frame

    @property
    def spi_bits_per_row(self) -> int:
        return 8 + self.adc_channels * self.adc_bits

    @property
    def spi_clock_hz(self) -> float:
        return self.spi_bits_per_row / max(0.001, self.row_period_ms / 1000.0)

    def snapshot(self) -> dict:
        row_ms = self.row_period_ms
        command_end = row_ms * 0.18
        conversion_end = row_ms * 0.58
        return {
            "refreshHz": self.refresh_hz,
            "framePeriodMs": self.frame_period_ms,
            "rowPeriodMs": row_ms,
            "spiBitsPerRow": self.spi_bits_per_row,
            "spiClockHz": self.spi_clock_hz,
            "framesPerSecond": self.refresh_hz,
            "rowsPerSecond": self.rows_per_frame * self.refresh_hz,
            "phases": [
                {"name": "command", "startMs": 0.0, "endMs": command_end, "activeLines": ["CS", "MOSI", "SCK"]},
                {"name": "conversion", "startMs": command_end, "endMs": conversion_end, "activeLines": ["EOC"]},
                {"name": "read_fifo", "startMs": conversion_end, "endMs": row_ms, "activeLines": ["CS", "MISO", "SCK"]},
            ],
        }


class MCUTransferCounter:
    """Counts line activity produced by the MCU while it scans one full frame."""

    def __init__(self, adc_bits: int = ADC_BITS) -> None:
        self.adc_bits = adc_bits
        self.counts = {
            "Address": {"perFrame": 0, "unit": "bit", "detail": "MCU wrote A1-A4 row address bits"},
            "SCK": {"perFrame": 0, "unit": "pulse", "detail": "MCU generated clocks for command and FIFO read"},
            "MOSI": {"perFrame": 0, "unit": "bit", "detail": "MCU transmitted ADC scan commands"},
            "MISO": {"perFrame": 0, "unit": "bit", "detail": "MCU received ADC FIFO words"},
            "CS": {"perFrame": 0, "unit": "assertion", "edgesPerFrame": 0, "detail": "MCU asserted ADC chip select"},
        }
        self.events: list[dict[str, int | str]] = []

    def record_row(self, row: int, address_bits: list[int], command: dict, fifo_words: list[int]) -> None:
        mosi_bits = len(command["binary"])
        miso_bits = len(fifo_words) * self.adc_bits
        sck_pulses = mosi_bits + miso_bits
        self.counts["Address"]["perFrame"] += len(address_bits)
        self.counts["MOSI"]["perFrame"] += mosi_bits
        self.counts["MISO"]["perFrame"] += miso_bits
        self.counts["SCK"]["perFrame"] += sck_pulses
        self.counts["CS"]["perFrame"] += 2
        self.counts["CS"]["edgesPerFrame"] += 4
        self.events.append(
            {
                "row": row,
                "addressBits": len(address_bits),
                "mosiBits": mosi_bits,
                "misoBits": miso_bits,
                "sckPulses": sck_pulses,
                "csAssertions": 2,
            }
        )

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
        return {
            "source": "MCU event counter",
            "framesPerSecond": refresh_hz,
            "rowsCounted": len(self.events),
            "lineRates": line_rates,
            "events": self.events,
        }


class ModuleUplinkSPI:
    """Patch-level SPI link between one STM32G474 module MCU and the upper FPGA/hub."""

    def __init__(self, rows: int = 16, cols: int = 16, sample_bits: int = MODULE_UPLINK_WORD_BITS) -> None:
        self.rows = rows
        self.cols = cols
        self.sample_bits = sample_bits
        self.command_bits = MODULE_UPLINK_COMMAND_BITS
        self.metadata_bytes = MODULE_FRAME_METADATA_BYTES

    @property
    def samples_per_frame(self) -> int:
        return self.rows * self.cols

    @property
    def payload_bits_per_frame(self) -> int:
        return self.samples_per_frame * self.sample_bits

    @property
    def metadata_bits_per_frame(self) -> int:
        return self.metadata_bytes * 8

    @property
    def miso_bits_per_frame(self) -> int:
        return self.payload_bits_per_frame + self.metadata_bits_per_frame

    @property
    def sck_pulses_per_frame(self) -> int:
        return self.command_bits + self.miso_bits_per_frame

    def snapshot(self, refresh_hz: float, module_id: int = 1) -> dict:
        refresh_hz = max(1.0, min(700.0, float(refresh_hz)))
        frame_period_s = 1.0 / refresh_hz
        required_sck_hz = self.sck_pulses_per_frame / frame_period_s
        line_rates = {
            "SCK": {
                "perFrame": float(self.sck_pulses_per_frame),
                "perSecond": self.sck_pulses_per_frame * refresh_hz,
                "unit": "pulse",
                "detail": "Upper FPGA/Hub clocks one command window and one raw-frame readback window.",
            },
            "MOSI": {
                "perFrame": float(self.command_bits),
                "perSecond": self.command_bits * refresh_hz,
                "unit": "bit",
                "detail": "Upper FPGA/Hub command to the STM32G474 module MCU.",
            },
            "MISO": {
                "perFrame": float(self.miso_bits_per_frame),
                "perSecond": self.miso_bits_per_frame * refresh_hz,
                "unit": "bit",
                "detail": "STM32G474 raw frame output: 16-bit samples plus frame metadata.",
            },
            "CS": {
                "perFrame": 2.0,
                "perSecond": 2.0 * refresh_hz,
                "unit": "assertion",
                "edgesPerFrame": 4.0,
                "edgesPerSecond": 4.0 * refresh_hz,
                "detail": "One command select window and one readback select window per full module frame.",
            },
        }
        return {
            "name": "Module MCU upstream SPI",
            "moduleId": module_id,
            "moduleMcu": "STM32G474",
            "upperLayer": "Patch FPGA/Hub",
            "mode": "initial raw scan transfer",
            "framesPerSecond": refresh_hz,
            "samplesPerFrame": self.samples_per_frame,
            "sampleBits": self.sample_bits,
            "metadataBytes": self.metadata_bytes,
            "command": {
                "direction": "FPGA/Hub -> STM32G474",
                "bits": self.command_bits,
                "fields": ["opcode", "module_id", "scan_mode", "frame_counter", "crc"],
                "label": "START_RAW_SCAN",
            },
            "result": {
                "direction": "STM32G474 -> FPGA/Hub",
                "payloadBits": self.payload_bits_per_frame,
                "metadataBits": self.metadata_bits_per_frame,
                "totalBits": self.miso_bits_per_frame,
                "encoding": "raw 16-bit ADC code per FSR taxel",
            },
            "clock": {
                "requiredSckHz": required_sck_hz,
                "note": "Minimum continuous SPI clock needed to move one command and one raw result frame inside the selected frame period.",
            },
            "lineRates": line_rates,
            "transactions": [
                {
                    "phase": "command",
                    "cs": "LOW",
                    "sckPulses": self.command_bits,
                    "mosi": "START_RAW_SCAN command",
                    "miso": "idle",
                },
                {
                    "phase": "readback",
                    "cs": "LOW",
                    "sckPulses": self.miso_bits_per_frame,
                    "mosi": "dummy clocks / optional flow-control bits",
                    "miso": "metadata + 256 raw 16-bit samples",
                },
            ],
        }


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

    def frame(self, row: int, command: dict, words: list[int], clock: Clock) -> dict:
        clock_state = clock.snapshot()
        line_state = {
            "SCK": {
                "active": True,
                "amount": 8 + len(words) * ADC_BITS,
                "unit": "pulse",
                "label": f"{8 + len(words) * ADC_BITS} pulses",
            },
            "MOSI": {
                "active": True,
                "amount": len(command["binary"]),
                "unit": "bit",
                "label": command["binary"],
            },
            "MISO": {
                "active": len(words) > 0,
                "amount": len(words) * ADC_BITS,
                "unit": "bit",
                "label": f"{len(words)} x {ADC_BITS}-bit",
            },
            "CS": {
                "active": True,
                "amount": 2,
                "unit": "assertion",
                "label": "2 CS windows",
            },
        }
        return {
            "summary": f"row {row}, ADC scan command then 16 FIFO words",
            "command": command,
            "words": words,
            "clock": clock_state,
            "lineState": line_state,
            "transactions": [
                {
                    "phase": "command",
                    "cs": "LOW -> HIGH",
                    "mosi": command["binary"],
                    "miso": "idle",
                    "activeLines": ["CS", "MOSI", "SCK"],
                    "description": "MCU selects ADC, sends the 8-bit scan command, then releases CS.",
                },
                {
                    "phase": "conversion",
                    "cs": "HIGH",
                    "eoc": "HIGH -> LOW",
                    "activeLines": ["EOC"],
                    "description": "ADC scans AIN0-AIN15, performs SAR conversion, fills FIFO, then pulls EOC low.",
                },
                {
                    "phase": "read_fifo",
                    "cs": "LOW -> HIGH",
                    "sckPulses": len(words) * ADC_BITS,
                    "mosi": "dummy clocks / no payload",
                    "miso": "16 sequential 12-bit ADC words from FIFO",
                    "activeLines": ["CS", "MISO", "SCK"],
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
        nx = dx / max(1.0, half_side)
        ny = dy / max(1.0, half_side)
        radial = min(1.0, (nx * nx + ny * ny) ** 0.5 / 1.414)
        return peak_force * (0.78 + 0.22 * (1.0 - radial))

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
