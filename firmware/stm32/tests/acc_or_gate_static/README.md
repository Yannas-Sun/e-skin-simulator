# STM32 ACC OR-Gate Static Test

This isolated hardware test selects exactly one ACC branch and creates DC
levels that can be measured with a multimeter. It does not initialise an
accelerometer, generate SPI traffic, or transmit Host SPI/USB frames.

For the selected ACC:

- decoder address: ACC1..ACC9 maps to Y0..Y8;
- selected nCS: held low continuously;
- SCK: held low continuously;
- MOSI: held at the selected static level, default high;
- all other nCS outputs: high.

Because each local gate implements `SDI = nCS OR MOSI`, the selected gate
should produce the same level as MOSI:

| nCS | MOSI | Expected OR-gate output |
|---:|---:|---:|
| 0 | 1 | approximately 3.3 V |
| 0 | 0 | approximately 0 V |

## Build and flash

Use the CMD launcher from this directory. The first number is the physical ACC
and the optional second number is the static MOSI level.

```powershell
# Requested test: select ACC5, hold nCS5=0 and MOSI=1.
& "D:\study\programming\ESKIN\firmware\tools\commands\flash_acc_or_gate_static.cmd" 5

# Complementary low-level check for the same gate.
& "D:\study\programming\ESKIN\firmware\tools\commands\flash_acc_or_gate_static.cmd" 5 0

# Explicit high-level check.
& "D:\study\programming\ESKIN\firmware\tools\commands\flash_acc_or_gate_static.cmd" 5 1

# Prompt for ACC1..ACC9; MOSI defaults to 1.
& "D:\study\programming\ESKIN\firmware\tools\commands\flash_acc_or_gate_static.cmd"
```

The PowerShell equivalent is:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .\flash_or_gate_static.ps1 -Acc 5 -Mosi 1
```

## Measurement procedure

1. Keep the mainboard powered normally.
2. Measure the selected decoder nCS output: it must remain near 0 V.
3. Measure the corresponding OR-gate MOSI input.
4. Measure the corresponding OR-gate output, preferably at the nearest
   accessible pad or via.
5. Repeat with `-Mosi 0`.

A gate passes only if its output follows both static input tests. Testing only
MOSI=1 cannot distinguish a working gate from an output stuck high.

## Restore normal operation

This test intentionally produces no ACC serial frames. Restore the maintained
application after testing:

```powershell
& "D:\study\programming\ESKIN\firmware\tools\commands\flash_acc_array.cmd" 0
```
