# ACC SPI Array Test

This test reuses the production Teensy `ESKIN_SPI_USB_BRIDGE` unchanged. The
STM32 selects the nine installed accelerometers through the CD74HC154 decoder, checks
`WHO_AM_I`, configures 100 Hz high-resolution +/-2 g mode, and packs X/Y/Z
data into the established 515-byte binary frame.

Run:

```powershell
python .\read_acc_array.py --port COM9 --frames 100
```

Use `--summary-only` for a compact pass/fail overview or `--sensor 1` to
monitor one physical accelerometer.

## 3D GUI

Test the interface without hardware:

```powershell
python .\live_acc_3d.py --demo
```

Read the live STM32/Teensy stream:

```powershell
python .\live_acc_3d.py --port COM9
```

The nine accelerometers are displayed in the physical mirrored 3 x 3 layout. A valid sensor
is drawn as a three-dimensional acceleration vector; vector direction is
X/Y/Z and vector length is acceleration in g. Click a sensor marker to inspect
its identity, status, axis values, and magnitude. An invalid sensor is marked
with a red cross and its XYZ values must not be interpreted as acceleration.

Useful options:

```text
--interval-ms 40       GUI refresh interval
--vector-scale 0.9     displayed grid units per g
--self-test            test decoding and signed 12-bit conversion
```

Status codes:

- `0`: OK
- `1`: wrong `WHO_AM_I`
- `2`: SPI failure while reading `WHO_AM_I`
- `3`: SPI failure while configuring the sensor
- `4`: SPI failure while reading XYZ
