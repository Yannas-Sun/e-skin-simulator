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

    def tick(self, selected_row: int, pressed_col: int, force_percent: float) -> dict:
        # Address phase: MCU drives A1-A4, DMUX decodes exactly one row.
        self.dmux.set_selected_row(selected_row)
        address_bits = self.dmux.address_bits

        # Analog phase: the selected row is Vcc, all other rows are hard-GND.
        row_states = self.dmux.row_states()
        column_nodes = self.array.read_row(
            dmux=self.dmux,
            pressed_row=selected_row,
            pressed_col=pressed_col,
            force_percent=force_percent,
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

        return {
            "row": self.dmux.selected_row,
            "pressedCol": pressed_col,
            "force": force_percent,
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
        }


def run_fsr_readout(row: int, col: int, force: float) -> dict:
    row = max(1, min(16, int(row)))
    col = max(1, min(16, int(col)))
    force = max(0.0, min(100.0, float(force)))
    return FSRReadoutProgram.create().tick(row, col, force)
