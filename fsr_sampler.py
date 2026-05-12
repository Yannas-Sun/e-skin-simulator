from __future__ import annotations

from dataclasses import dataclass

from fsr_hardware import ADC, DMUX, FSRArray, SPIBus


@dataclass
class FSRReadoutProgram:
    """Small programmable scan controller, written like a hardware sequence."""

    dmux: DMUX
    array: FSRArray
    adc: ADC
    spi: SPIBus

    @classmethod
    def create(cls) -> "FSRReadoutProgram":
        return cls(dmux=DMUX(), array=FSRArray(), adc=ADC(), spi=SPIBus())

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

        # Conversion phase: the ADC samples all 16 column nodes in parallel.
        adc_samples = self.adc.sample_parallel([node["nodeVoltage"] for node in column_nodes])

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

        # Transfer phase: SPI uses SCK, MOSI, MISO, and CS to move the ADC frame.
        spi_frame = self.spi.frame(
            row=self.dmux.selected_row,
            words=[column["code"] for column in columns],
        )
        clock_trace = self.clock_trace(
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
                "parallel": True,
            },
            "spi": spi_frame,
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
            samples = self.adc.sample_parallel([node["nodeVoltage"] for node in nodes])
            words = [sample["code"] for sample in samples]
            active_word = words[pressed_col - 1]
            mosi_word = 0b10000000 | (row - 1)
            trace.append(
                {
                    "clk": row,
                    "row": row,
                    "address": "".join(str(bit) for bit in reversed(self.dmux.address_bits)),
                    "adcInput": f"C1-C16, C{pressed_col}={nodes[pressed_col - 1]['nodeVoltage']:.2f}V",
                    "mosi": format(mosi_word, "08b"),
                    "miso": format(active_word, "012b"),
                    "mosiLabel": f"read row {row}",
                    "misoLabel": f"C{pressed_col} code {active_word}",
                    "spiOut": f"MISO[{pressed_col}]={active_word}",
                }
            )
        self.dmux.set_selected_row(saved_row)
        return trace


def run_fsr_readout(row: int, col: int, force: float, object_row: int | None = None, object_size: float = 72.0, object_mass: float | None = None) -> dict:
    row = max(1, min(16, int(row)))
    object_row = row if object_row is None else max(1, min(16, int(object_row)))
    col = max(1, min(16, int(col)))
    object_size = max(20.0, min(240.0, float(object_size)))
    object_mass = max(0.0, min(1000.0, float(force) * 10.0 if object_mass is None else float(object_mass)))
    return FSRReadoutProgram.create().tick(row, object_row, col, object_size, object_mass)
