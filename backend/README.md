# Backend Structure

The backend is split by hardware layer so each simulator page can grow without turning the server folder into one large mixed module.

```text
backend/
  server.py                  # HTTP API and static frontend serving
  fsr/
    hardware.py              # DMUX, FSR, resistor, MAX11632 ADC, SPI, data counters
    sampler.py               # STM32G474-style FSR scan sequence
    README.md                # FSR hardware model documentation
  accel/
    hardware.py              # LIS3DH, CS MUX, ngspice nCS drive, SPI, data counters
    sampler.py               # STM32G474-style accelerometer scan sequence
    README.md                # ACC hardware model documentation
  electrical/
    ngspice_backend.py       # shared ngspice adapter
    README.md                # electrical solver documentation
```

The public API paths are still defined in `backend/server.py`:

| Endpoint | Purpose |
|---|---|
| `POST /api/simulate` | Dashboard pressure and throughput simulation. |
| `POST /api/fsr-readout` | One FSR scan update from the programmable hardware model. |
| `POST /api/adc-mosi` | Manual MAX11632 MOSI command execution. |
| `POST /api/accel-readout` | One LIS3DH accelerometer scan update. |
| `POST /api/lis3dh-spi` | Manual LIS3DH SPI command execution. |
| `GET /api/ngspice-health` | ngspice discovery and smoke tests. |

The root `server.py` file remains as a launcher so the project can still be started with:

```powershell
python server.py
```

