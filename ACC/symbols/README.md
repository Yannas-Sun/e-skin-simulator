# ACC FPC Connector Symbols

This folder contains local KiCad schematic symbols for the small FPC connectors used by the ACC layer.

## Symbols

- `HC-FPC-05-09-6RLTAG`
  - Pins `1-6`: signal pins on the left side.
  - Pins `7-8`: mechanical/shield pads shown on the bottom and top, matching the existing schematic style.
  - Default footprint: `ACC:HC-FPC-05-09-6RLTAG`.

- `HC-FPC-05-09-8RLTAG`
  - Pins `1-8`: signal pins on the left side.
  - Pins `9-10`: mechanical/shield pads shown on the bottom and top.
  - Default footprint: `ACC:HC-FPC-05-09-8RLTAG`.

If the mechanical pads are intended to be grounded, connect the corresponding bottom/top pins to `GND` in the schematic.
