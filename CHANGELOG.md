# Changelog

## 2026-05-12 - FSR Readout Circuit Correction

Changes are ordered from most important to least important.

1. Corrected the FSR column readout topology.
   - The column output is now drawn as a voltage-divider sampling node.
   - Each column node connects to a 10 kOhm load resistor to GND.
   - The ADC is shown as a high-impedance sampler of the node, rather than as part of the resistor current path.

2. Corrected DMUX row-drive behavior.
   - Only the selected row is marked as `Vcc`.
   - All non-selected rows are marked as `GND`.
   - A diode is shown on each row output to indicate reverse-current blocking.

3. Clarified parallel ADC sampling.
   - During each selected-row scan, C1-C16 are shown as simultaneous column signals into the 16-channel ADC.
   - The SPI frame now states that all 16 column words are returned to the MCU for the active row.

4. Added row-address logic visualization.
   - Four logic traces, A0-A3, were added below the circuit.
   - Auto scan now makes the address waveforms advance with the selected row.

5. Re-routed MCU address wiring.
   - The A0-A3 address bus now travels from the MCU to the DMUX select input in the left-side control area.
   - The address bus no longer overlaps the column load resistors or ADC area.
