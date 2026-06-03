from __future__ import annotations

from dataclasses import dataclass

from ..electrical.ngspice_backend import NgSpiceBackend, NgSpiceError


VCC = 3.3
ADC_BITS = 12
ADC_MAX_CODE = (1 << ADC_BITS) - 1
MAX11632_OUTPUT_WORD_BITS = 16
MODULE_FRAME_METADATA_BYTES = 20
MODULE_UPLINK_COMMAND_BITS = 32
MODULE_UPLINK_WORD_BITS = 16
MAX11632_INPUT_DATA_BYTE_TABLE = [
    {
        "register": "Conversion",
        "bits": ["1", "CHSEL3", "CHSEL2", "CHSEL1", "CHSEL0", "SCAN1", "SCAN0", "X"],
        "description": "Selects the conversion channel and scan mode.",
    },
    {
        "register": "Setup",
        "bits": ["0", "1", "CKSEL1", "CKSEL0", "REFSEL1", "REFSEL0", "X", "X"],
        "description": "Configures ADC clock source and reference behavior.",
    },
    {
        "register": "Averaging",
        "bits": ["0", "0", "1", "AVGON", "NAVG1", "NAVG0", "NSCAN1", "NSCAN0"],
        "description": "Configures internal averaging and repeated scan count.",
    },
    {
        "register": "Reset",
        "bits": ["0", "0", "0", "1", "RESET", "X", "X", "X"],
        "description": "Controls FIFO clear or full register reset.",
    },
]


@dataclass
class Clock:
    """Unified hardware clock derived from the selected refresh rate."""

    refresh_hz: float = 10.0
    rows_per_frame: int = 16
    adc_channels: int = 16
    adc_bits: int = ADC_BITS
    adc_output_word_bits: int = MAX11632_OUTPUT_WORD_BITS

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
        return 8 + self.adc_channels * self.adc_output_word_bits

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

    def __init__(self, adc_bits: int = ADC_BITS, adc_output_word_bits: int = MAX11632_OUTPUT_WORD_BITS) -> None:
        self.adc_bits = adc_bits
        self.adc_output_word_bits = adc_output_word_bits
        self.counts = {
            "Address": {"perFrame": 0, "unit": "bit", "detail": "MCU wrote A1-A4 row address bits"},
            "SCK": {"perFrame": 0, "unit": "pulse", "detail": "MCU generated clocks for MAX11632 command and FIFO read"},
            "MOSI": {"perFrame": 0, "unit": "bit", "detail": "MCU transmitted MAX11632 conversion-register commands"},
            "MISO": {"perFrame": 0, "unit": "bit", "detail": "MCU received MAX11632 16-bit FIFO words"},
            "CS": {"perFrame": 0, "unit": "assertion", "edgesPerFrame": 0, "detail": "MCU asserted ADC chip select"},
        }
        self.events: list[dict[str, int | str]] = []

    def record_row(self, row: int, address_bits: list[int], command: dict, fifo_words: list[int]) -> None:
        mosi_bits = len(command["binary"])
        miso_bits = len(fifo_words) * self.adc_output_word_bits
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

    def input_data_byte_table(self) -> list[dict]:
        return [
            {
                "register": row["register"],
                "bits": row["bits"].copy(),
                "description": row["description"],
            }
            for row in MAX11632_INPUT_DATA_BYTE_TABLE
        ]

    def encode(self, voltage: float) -> int:
        clamped = max(0.0, min(self.vref, voltage))
        return round((clamped / self.vref) * self.max_code)

    def describe_input_byte(self, value: int) -> dict:
        byte = value & 0xFF
        if byte & 0b10000000:
            register = "conversion"
            table_row = "Conversion"
            fields = {
                "CHSEL": (byte >> 3) & 0b1111,
                "SCAN": (byte >> 1) & 0b11,
                "X": byte & 1,
            }
        elif byte & 0b01000000:
            register = "setup"
            table_row = "Setup"
            fields = {
                "CKSEL": (byte >> 4) & 0b11,
                "REFSEL": (byte >> 2) & 0b11,
                "X1": (byte >> 1) & 1,
                "X0": byte & 1,
            }
        elif byte & 0b00100000:
            register = "averaging"
            table_row = "Averaging"
            fields = {
                "AVGON": (byte >> 4) & 1,
                "NAVG": (byte >> 2) & 0b11,
                "NSCAN": byte & 0b11,
            }
        elif byte & 0b00010000:
            register = "reset"
            table_row = "Reset"
            fields = {
                "RESET": (byte >> 3) & 1,
                "X2": (byte >> 2) & 1,
                "X1": (byte >> 1) & 1,
                "X0": byte & 1,
            }
        else:
            register = "reserved"
            table_row = "Reserved"
            fields = {}
        return {
            "register": register,
            "tableRow": table_row,
            "value": byte,
            "binary": format(byte, "08b"),
            "hex": f"0x{byte:02X}",
            "fields": fields,
        }

    def setup_command(self, clock_mode: int = 0b10, reference_mode: int = 0b10) -> dict:
        clock = max(0, min(0b11, clock_mode))
        reference = max(0, min(0b11, reference_mode))
        value = 0b01000000 | (clock << 4) | (reference << 2)
        decoded = self.describe_input_byte(value)
        return {
            "register": "setup",
            "value": value,
            "binary": format(value, "08b"),
            "hex": f"0x{value:02X}",
            "format": "0 1 CKSEL1 CKSEL0 REFSEL1 REFSEL0 X X",
            "tableRow": decoded["tableRow"],
            "fields": decoded["fields"],
            "clockMode": clock,
            "referenceMode": reference,
            "label": "clock mode 10, internal reference always on" if clock == 0b10 and reference == 0b10 else "custom setup",
        }

    def averaging_command(self, avg_on: bool = False, navg: int = 0, nscan: int = 0) -> dict:
        navg_value = max(0, min(0b11, navg))
        nscan_value = max(0, min(0b11, nscan))
        value = 0b00100000 | ((1 if avg_on else 0) << 4) | (navg_value << 2) | nscan_value
        decoded = self.describe_input_byte(value)
        return {
            "register": "averaging",
            "value": value,
            "binary": format(value, "08b"),
            "hex": f"0x{value:02X}",
            "format": "0 0 1 AVGON NAVG1 NAVG0 NSCAN1 NSCAN0",
            "tableRow": decoded["tableRow"],
            "fields": decoded["fields"],
            "avgOn": avg_on,
            "navg": navg_value,
            "nscan": nscan_value,
            "label": "averaging disabled" if not avg_on else "averaging enabled",
        }

    def reset_command(self, reset_bit: int = 1) -> dict:
        reset_value = 1 if reset_bit else 0
        value = 0b00010000 | (reset_value << 3)
        decoded = self.describe_input_byte(value)
        return {
            "register": "reset",
            "value": value,
            "binary": format(value, "08b"),
            "hex": f"0x{value:02X}",
            "format": "0 0 0 1 RESET X X X",
            "tableRow": decoded["tableRow"],
            "fields": decoded["fields"],
            "reset": reset_value,
            "label": "clear FIFO" if reset_value else "reset all registers to power-up defaults",
        }

    def scan_command(self, start_channel: int = 15, scan_mode: int = 0b00, x_bit: int = 0) -> dict:
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
        decoded = self.describe_input_byte(value)
        return {
            "value": value,
            "binary": format(value, "08b"),
            "hex": f"0x{value:02X}",
            "startChannel": channel,
            "scanMode": mode,
            "scanModeLabel": self.scan_mode_label(channel, mode),
            "bits": bits,
            "format": "bit7 CH3 CH2 CH1 CH0 SC1 SC0 X",
            "tableRow": decoded["tableRow"],
            "fields": decoded["fields"],
            "register": "conversion",
        }

    def scan_mode_label(self, channel: int, mode: int) -> str:
        if mode == 0b00:
            return f"scan AIN0-AIN{channel}"
        if mode == 0b01:
            return f"scan AIN{channel}-AIN{self.channels - 1}"
        if mode == 0b10:
            return f"scan AIN{channel} repeatedly"
        return f"single conversion AIN{channel}"

    def sar_convert(self, channel: int, voltage: float) -> dict[str, int | float | str | list[int]]:
        code = self.encode(voltage)
        word = code & ADC_MAX_CODE
        return {
            "channel": channel,
            "ain": f"AIN{channel - 1}",
            "voltage": voltage,
            "code": code,
            "doutWord": word,
            "doutBinary": format(word, "016b"),
            "doutBytes": [(word >> 8) & 0xFF, word & 0xFF],
            "outputWordBits": MAX11632_OUTPUT_WORD_BITS,
            "outputFormat": "MSB first, 0000 + 12-bit binary code",
            "stage": "sample -> SAR convert -> FIFO",
        }

    def channels_for_command(self, command: dict, nscan: int = 0) -> list[int]:
        channel = int(command.get("startChannel", 15))
        mode = int(command.get("scanMode", 0))
        if mode == 0b00:
            return list(range(1, channel + 2))
        if mode == 0b01:
            return list(range(channel + 1, self.channels + 1))
        if mode == 0b10:
            count = [4, 8, 12, 16][max(0, min(3, nscan))]
            return [channel + 1 for _ in range(count)]
        return [channel + 1]

    def start_scan(self, voltages: list[float], command: dict | None = None, nscan: int = 0) -> dict:
        command = self.scan_command() if command is None else command
        self.eoc = 1
        self.fifo = []
        conversions = []
        for channel in self.channels_for_command(command, nscan=nscan):
            if not 1 <= channel <= min(self.channels, len(voltages)):
                continue
            conversion = self.sar_convert(channel, voltages[channel - 1])
            self.fifo.append(conversion)
            conversions.append(conversion)
        self.eoc = 0
        return {
            "command": command,
            "channels": [conversion["ain"] for conversion in conversions],
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
                "carries": "serial clock pulses for MAX11632 command and FIFO readout",
            },
            "MOSI": {
                "direction": "MCU -> ADC",
                "carries": "MAX11632 setup/conversion register bytes",
            },
            "MISO": {
                "direction": "ADC -> MCU",
                "carries": "16 sequential 16-bit FIFO words, each 0000 + 12-bit code",
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
                "amount": 8 + len(words) * MAX11632_OUTPUT_WORD_BITS,
                "unit": "pulse",
                "label": f"{8 + len(words) * MAX11632_OUTPUT_WORD_BITS} pulses",
            },
            "MOSI": {
                "active": True,
                "amount": len(command["binary"]),
                "unit": "bit",
                "label": command["binary"],
            },
            "MISO": {
                "active": len(words) > 0,
                "amount": len(words) * MAX11632_OUTPUT_WORD_BITS,
                "unit": "bit",
                "label": f"{len(words)} x {MAX11632_OUTPUT_WORD_BITS}-bit",
            },
            "CS": {
                "active": True,
                "amount": 2,
                "unit": "assertion",
                "label": "2 CS windows",
            },
        }
        return {
            "summary": f"row {row}, MAX11632 conversion command then 16 FIFO words",
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
                    "description": "MCU selects MAX11632, sends the 8-bit conversion-register command, then releases CS.",
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
                    "sckPulses": len(words) * MAX11632_OUTPUT_WORD_BITS,
                    "mosi": "dummy clocks / no payload",
                    "miso": "16 sequential 16-bit words from FIFO; each word is 0000 + 12-bit ADC code",
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

    def __init__(
        self,
        rows: int = 16,
        cols: int = 16,
        load_ohms: float = 10_000.0,
        vcc: float = VCC,
        use_ngspice: bool = True,
        mux_on_ohms: float = 70.0,
    ) -> None:
        self.rows = rows
        self.cols = cols
        self.vcc = vcc
        self.load = Resistor(load_ohms)
        self.fsr = FSR()
        self.use_ngspice = use_ngspice
        self.mux_on_ohms = mux_on_ohms
        self.last_solver = "python"
        self.last_solver_detail = "closed-form voltage divider"

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

    def solve_row_voltages(self, row_voltage: float, fsr_values: list[float]) -> tuple[list[float], str, str]:
        if row_voltage <= 0:
            return [0.0 for _ in fsr_values], "python", "unselected row tied to GND"
        if self.use_ngspice:
            backend = NgSpiceBackend.discover()
            if backend is not None:
                try:
                    result = backend.simulate_fsr_row(
                        row_voltage=row_voltage,
                        fsr_ohms=fsr_values,
                        load_ohms=self.load.ohms,
                        mux_on_ohms=self.mux_on_ohms,
                    )
                    return list(result["nodeVoltages"]), "ngspice", "selected row network solved by ngspice"
                except (NgSpiceError, OSError, ValueError):
                    pass
        return [self.divider_voltage(row_voltage, resistance) for resistance in fsr_values], "python", "closed-form voltage divider fallback"

    def read_row(self, dmux: DMUX, pressed_row: int, pressed_col: int, object_size: float, object_mass: float) -> list[dict[str, int | float | bool]]:
        row = dmux.selected_row
        row_voltage = dmux.row_voltage(row)
        readings: list[dict[str, int | float | bool]] = []
        forces: list[float] = []
        resistances: list[float] = []
        for col in range(1, self.cols + 1):
            force = self.force_at(row, col, pressed_row, pressed_col, object_size, object_mass)
            forces.append(force)
            resistances.append(self.fsr.resistance(force))
        voltages, solver, solver_detail = self.solve_row_voltages(row_voltage, resistances)
        self.last_solver = solver
        self.last_solver_detail = solver_detail
        for col, force, resistance, voltage in zip(range(1, self.cols + 1), forces, resistances, voltages):
            readings.append(
                {
                    "row": row,
                    "col": col,
                    "force": force,
                    "fsrOhms": resistance,
                    "loadOhms": self.load.ohms,
                    "muxOnOhms": self.mux_on_ohms,
                    "nodeVoltage": voltage,
                    "active": force > 0,
                    "solver": solver,
                }
            )
        return readings
