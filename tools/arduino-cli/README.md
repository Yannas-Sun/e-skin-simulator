# Local Arduino CLI

The firmware uploader first looks for:

```text
tools/arduino-cli/arduino-cli.exe
```

It falls back to `arduino-cli` on `PATH` only when the local executable is not
present. The executable is a third-party binary and is intentionally ignored by
Git; `LICENSE.txt` is retained beside a local copy.

The Teensy compiler core is managed by Arduino CLI in its user data directory.
It is not copied into this repository because the installed packages and cache
are close to 1 GB. Verify the local setup with:

```powershell
.\tools\arduino-cli\arduino-cli.exe core list
.\tools\arduino-cli\arduino-cli.exe board listall teensy:avr:teensy41
```

The required board package is `teensy:avr`, and the uploader uses the default
FQBN `teensy:avr:teensy41`.
