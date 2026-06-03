# Electrical Solver Backend

This folder contains circuit-level adapters used by the virtual hardware models.

## `ngspice_backend.py`

`ngspice_backend.py` discovers a local ngspice executable, generates temporary SPICE decks, runs operating-point solves, and parses node voltages back into Python hardware models.

Discovery order:

1. `NGSPICE_EXECUTABLE`
2. `tools/ngspice/Spice64/bin/ngspice_con.exe`
3. `ngspice_con` or `ngspice` on `PATH`

Current circuit solves:

| Method | Used by | Circuit |
|---|---|---|
| `simulate_voltage_divider()` | Health check | One FSR plus one load resistor. |
| `simulate_fsr_row()` | `backend/fsr/hardware.py` | Selected FSR row with MUX on-resistance, 16 FSRs, and 16 load resistors. |
| `simulate_accel_cs_mux()` | `backend/accel/hardware.py` | 16 active-low LIS3DH nCS lines with pull-ups and one selected decoder sink. |

The adapter intentionally keeps digital protocol behavior in Python. ngspice is used where the simulated hardware needs electrical node voltages before the digital/ADC models continue.

Standalone reference decks live under `circuits/ngspice/`:

| Deck | Purpose |
|---|---|
| `fsr-divider.cir` | Single FSR voltage-divider smoke test. |
| `fsr-selected-row.cir` | Selected FSR row with 16 column load dividers. |
| `accel-cs-mux.cir` | LIS3DH active-low nCS pull-up/decoder-sink network. |
