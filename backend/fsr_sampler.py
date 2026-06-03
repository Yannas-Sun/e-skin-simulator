from __future__ import annotations

from dataclasses import dataclass
import re

from .fsr_hardware import ADC, Clock, DMUX, FSRArray, MCUTransferCounter, ModuleUplinkSPI, SPIBus


@dataclass
class FSRReadoutProgram:
    """Small programmable scan controller, written like a hardware sequence."""

    dmux: DMUX
    array: FSRArray
    adc: ADC
    spi: SPIBus
    uplink: ModuleUplinkSPI
    clock: Clock

    @classmethod
    def create(cls, refresh_rate: float = 10.0) -> "FSRReadoutProgram":
        return cls(
            dmux=DMUX(),
            array=FSRArray(),
            adc=ADC(),
            spi=SPIBus(),
            uplink=ModuleUplinkSPI(),
            clock=Clock(refresh_rate),
        )

    def tick(self, selected_row: int, pressed_row: int, pressed_col: int, object_size: float, object_mass: float) -> dict:
        # Address phase: MCU drives A1-A4, DMUX decodes exactly one row.
        self.dmux.set_selected_row(selected_row)
        address_bits = self.dmux.address_bits

        # Analog phase: the selected row is Vcc, all other rows are hard-GND.
        row_states = self.dmux.row_states()
        column_nodes = self.array.read_row(
            dmux=self.dmux,
            pressed_row=pressed_row,
            pressed_col=pressed_col,
            object_size=object_size,
            object_mass=object_mass,
        )

        # ADC phase: MCU commands MAX11632 to scan AIN0-AIN15 into its FIFO.
        setup_command = self.adc.setup_command(clock_mode=0b10, reference_mode=0b10)
        averaging_command = self.adc.averaging_command(avg_on=False, navg=0, nscan=0)
        reset_command = self.adc.reset_command(reset_bit=1)
        scan_command = self.adc.scan_command(start_channel=15, scan_mode=0b00, x_bit=0)
        adc_scan = self.adc.start_scan([node["nodeVoltage"] for node in column_nodes], command=scan_command)
        adc_samples = self.adc.read_fifo()

        columns = []
        for node, sample in zip(column_nodes, adc_samples):
            columns.append(
                {
                    "col": node["col"],
                    "force": node["force"],
                    "fsrOhms": node["fsrOhms"],
                    "loadOhms": node["loadOhms"],
                    "muxOnOhms": node["muxOnOhms"],
                    "nodeVoltage": node["nodeVoltage"],
                    "code": sample["code"],
                    "doutWord": sample["doutWord"],
                    "doutBinary": sample["doutBinary"],
                    "doutBytes": sample["doutBytes"],
                    "active": node["active"],
                    "solver": node["solver"],
                }
            )
        idle_voltage = self.array.divider_voltage(self.array.vcc, self.array.fsr.resistance(0.0))
        idle_code = self.adc.encode(idle_voltage)

        # Transfer phase: after EOC is low, MCU clocks FIFO words out on MISO.
        spi_frame = self.spi.frame(
            row=self.dmux.selected_row,
            command=scan_command,
            words=[column["doutWord"] for column in columns],
            clock=self.clock,
        )
        clock_trace = self.clock_trace(
            pressed_row=pressed_row,
            pressed_col=pressed_col,
            object_size=object_size,
            object_mass=object_mass,
        )
        mcu_stats = self.mcu_statistics(
            pressed_row=pressed_row,
            pressed_col=pressed_col,
            object_size=object_size,
            object_mass=object_mass,
        )
        return {
            "row": self.dmux.selected_row,
            "objectRow": pressed_row,
            "pressedCol": pressed_col,
            "objectSize": object_size,
            "objectMass": object_mass,
            "address": {
                "value": self.dmux.address,
                "bits": [
                    {"name": f"A{bit + 1}", "index": bit, "level": level}
                    for bit, level in enumerate(address_bits)
                ],
            },
            "dmuxRows": row_states,
            "columns": columns,
            "electricalSolver": {
                "engine": self.array.last_solver,
                "detail": self.array.last_solver_detail,
                "muxOnOhms": self.array.mux_on_ohms,
                "loadOhms": self.array.load.ohms,
            },
            "adc": {
                "channels": self.adc.channels,
                "bits": self.adc.bits,
                "vref": self.adc.vref,
                "idleCode": idle_code,
                "idleVoltage": idle_voltage,
                "fifoDepth": len(self.adc.fifo),
                "eoc": self.adc.eoc,
                "eocState": "LOW_CONVERSION_COMPLETE" if self.adc.eoc == 0 else "HIGH_BUSY",
                "inputDataByteTable": self.adc.input_data_byte_table(),
                "setupCommand": setup_command,
                "averagingCommand": averaging_command,
                "resetCommand": reset_command,
                "scan": adc_scan,
            },
            "spi": spi_frame,
            "moduleUplink": self.uplink.snapshot(self.clock.refresh_hz, module_id=1),
            "mcu": mcu_stats,
            "clock": self.clock.snapshot(),
            "clockTrace": clock_trace,
        }

    def clock_trace(self, pressed_row: int, pressed_col: int, object_size: float, object_mass: float) -> list[dict]:
        trace = []
        saved_row = self.dmux.selected_row
        for row in range(1, self.dmux.outputs + 1):
            self.dmux.set_selected_row(row)
            nodes = self.array.read_row(
                dmux=self.dmux,
                pressed_row=pressed_row,
                pressed_col=pressed_col,
                object_size=object_size,
                object_mass=object_mass,
            )
            scan_command = self.adc.scan_command(start_channel=15, scan_mode=0b00, x_bit=0)
            self.adc.start_scan([node["nodeVoltage"] for node in nodes], command=scan_command)
            words = [sample["code"] for sample in self.adc.read_fifo()]
            fifo_words = [sample["doutWord"] for sample in self.adc.read_fifo()]
            active_code = words[pressed_col - 1]
            active_word = fifo_words[pressed_col - 1]
            trace.append(
                {
                    "clk": row,
                    "row": row,
                    "address": "".join(str(bit) for bit in reversed(self.dmux.address_bits)),
                    "adcInput": f"C1-C16, C{pressed_col}={nodes[pressed_col - 1]['nodeVoltage']:.2f}V",
                    "mosi": scan_command["binary"],
                    "miso": format(active_word, "016b"),
                    "mosiLabel": f"{scan_command['hex']} scan AIN0-AIN15",
                    "misoLabel": f"C{pressed_col} word 0000 + code {active_code}",
                    "eoc": 0,
                    "spiOut": f"MISO[{pressed_col}]={active_word}",
                }
            )
        self.dmux.set_selected_row(saved_row)
        return trace

    def mcu_statistics(self, pressed_row: int, pressed_col: int, object_size: float, object_mass: float) -> dict:
        counter = MCUTransferCounter(adc_bits=self.adc.bits)
        saved_row = self.dmux.selected_row
        command = self.adc.scan_command(start_channel=15, scan_mode=0b00, x_bit=0)
        fifo_words = [0 for _ in range(self.adc.channels)]
        for row in range(1, self.dmux.outputs + 1):
            self.dmux.set_selected_row(row)
            counter.record_row(
                row=row,
                address_bits=self.dmux.address_bits,
                command=command,
                fifo_words=fifo_words,
            )
        self.dmux.set_selected_row(saved_row)
        return counter.snapshot(self.clock.refresh_hz)


def run_fsr_readout(row: int, col: int, force: float, object_row: int | None = None, object_size: float = 72.0, object_mass: float | None = None, refresh_rate: float = 10.0) -> dict:
    row = max(1, min(16, int(row)))
    object_row = row if object_row is None else max(1, min(16, int(object_row)))
    col = max(1, min(16, int(col)))
    object_size = max(20.0, min(240.0, float(object_size)))
    object_mass = max(0.0, min(1000.0, float(force) * 10.0 if object_mass is None else float(object_mass)))
    refresh_rate = max(1.0, min(700.0, float(refresh_rate)))
    return FSRReadoutProgram.create(refresh_rate).tick(row, object_row, col, object_size, object_mass)


def parse_mosi_bytes(text: str) -> list[int]:
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
            raise ValueError(f"MOSI byte out of range: {token}")
        values.append(value)
    return values


def command_from_input_byte(adc: ADC, value: int) -> dict:
    decoded = adc.describe_input_byte(value)
    if decoded["register"] == "conversion":
        fields = decoded["fields"]
        return adc.scan_command(
            start_channel=int(fields["CHSEL"]),
            scan_mode=int(fields["SCAN"]),
            x_bit=int(fields["X"]),
        )
    return decoded


def run_adc_mosi_program(
    mosi_text: str,
    row: int,
    col: int,
    object_row: int | None = None,
    object_size: float = 72.0,
    object_mass: float = 620.0,
) -> dict:
    row = max(1, min(16, int(row)))
    object_row = row if object_row is None else max(1, min(16, int(object_row)))
    col = max(1, min(16, int(col)))
    object_size = max(20.0, min(240.0, float(object_size)))
    object_mass = max(0.0, min(1000.0, float(object_mass)))

    adc = ADC()
    dmux = DMUX()
    array = FSRArray()
    dmux.set_selected_row(row)
    column_nodes = array.read_row(
        dmux=dmux,
        pressed_row=object_row,
        pressed_col=col,
        object_size=object_size,
        object_mass=object_mass,
    )
    voltages = [node["nodeVoltage"] for node in column_nodes]

    setup = adc.setup_command(clock_mode=0b10, reference_mode=0b10)
    averaging = adc.averaging_command(avg_on=False, navg=0, nscan=0)
    mosi_values = parse_mosi_bytes(mosi_text)
    transactions = []
    all_miso_words: list[int] = []

    for index, value in enumerate(mosi_values, start=1):
        decoded = adc.describe_input_byte(value)
        miso_words: list[int] = []
        effect = "decoded only"
        fifo_depth = len(adc.fifo)

        if decoded["register"] == "setup":
            fields = decoded["fields"]
            setup = adc.setup_command(clock_mode=int(fields["CKSEL"]), reference_mode=int(fields["REFSEL"]))
            effect = setup["label"]
        elif decoded["register"] == "averaging":
            fields = decoded["fields"]
            averaging = adc.averaging_command(
                avg_on=bool(fields["AVGON"]),
                navg=int(fields["NAVG"]),
                nscan=int(fields["NSCAN"]),
            )
            effect = averaging["label"]
        elif decoded["register"] == "reset":
            reset_bit = int(decoded["fields"]["RESET"])
            if reset_bit == 1:
                adc.fifo = []
                adc.eoc = 1
                effect = "FIFO cleared"
            else:
                adc = ADC()
                setup = adc.setup_command(clock_mode=0b10, reference_mode=0b10)
                averaging = adc.averaging_command(avg_on=False, navg=0, nscan=0)
                effect = "registers reset to power-up defaults"
            fifo_depth = len(adc.fifo)
        elif decoded["register"] == "conversion":
            command = command_from_input_byte(adc, value)
            scan = adc.start_scan(voltages, command=command, nscan=int(averaging["nscan"]))
            miso_words = [int(sample["doutWord"]) for sample in adc.read_fifo()]
            all_miso_words.extend(miso_words)
            fifo_depth = int(scan["fifoDepth"])
            effect = scan["command"]["scanModeLabel"]
        else:
            effect = "reserved input byte; no conversion"

        transactions.append(
            {
                "index": index,
                "mosi": {
                    "value": value,
                    "hex": f"0x{value:02X}",
                    "binary": format(value, "08b"),
                },
                "decoded": decoded,
                "effect": effect,
                "fifoDepth": fifo_depth,
                "misoWords": [
                    {
                        "value": word,
                        "hex": f"0x{word:04X}",
                        "binary": format(word, "016b"),
                        "bytes": [(word >> 8) & 0xFF, word & 0xFF],
                    }
                    for word in miso_words
                ],
            }
        )

    return {
        "row": row,
        "objectRow": object_row,
        "pressedCol": col,
        "mosiBytes": [f"0x{value:02X}" for value in mosi_values],
        "setupState": setup,
        "averagingState": averaging,
        "transactions": transactions,
        "misoWords": [
            {
                "value": word,
                "hex": f"0x{word:04X}",
                "binary": format(word, "016b"),
                "bytes": [(word >> 8) & 0xFF, word & 0xFF],
            }
            for word in all_miso_words
        ],
    }
