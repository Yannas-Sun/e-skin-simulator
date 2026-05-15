from __future__ import annotations

from dataclasses import dataclass

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
        reset_command = self.adc.reset_command(reset_n=1)
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
                    "nodeVoltage": node["nodeVoltage"],
                    "code": sample["code"],
                    "active": node["active"],
                }
            )
        idle_voltage = self.array.divider_voltage(self.array.vcc, self.array.fsr.resistance(0.0))
        idle_code = self.adc.encode(idle_voltage)

        # Transfer phase: after EOC is low, MCU clocks FIFO words out on MISO.
        spi_frame = self.spi.frame(
            row=self.dmux.selected_row,
            command=scan_command,
            words=[column["code"] for column in columns],
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
            active_word = words[pressed_col - 1]
            trace.append(
                {
                    "clk": row,
                    "row": row,
                    "address": "".join(str(bit) for bit in reversed(self.dmux.address_bits)),
                    "adcInput": f"C1-C16, C{pressed_col}={nodes[pressed_col - 1]['nodeVoltage']:.2f}V",
                    "mosi": scan_command["binary"],
                    "miso": format(active_word, "016b"),
                    "mosiLabel": f"{scan_command['hex']} scan AIN0-AIN15",
                    "misoLabel": f"C{pressed_col} word 0000 + code {active_word}",
                    "eoc": 0,
                    "spiOut": f"MISO[{pressed_col}]={active_word}",
                }
            )
        self.dmux.set_selected_row(saved_row)
        return trace

    def mcu_statistics(self, pressed_row: int, pressed_col: int, object_size: float, object_mass: float) -> dict:
        counter = MCUTransferCounter(adc_bits=self.adc.bits)
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
            command = self.adc.scan_command(start_channel=15, scan_mode=0b00, x_bit=0)
            self.adc.start_scan([node["nodeVoltage"] for node in nodes], command=command)
            words = [sample["code"] for sample in self.adc.read_fifo()]
            counter.record_row(
                row=row,
                address_bits=self.dmux.address_bits,
                command=command,
                fifo_words=words,
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
