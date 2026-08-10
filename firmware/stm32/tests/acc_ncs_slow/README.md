# ACC Slow-nCS Test

This isolated diagnostic makes one decoder chip-select output easy to measure
with a multimeter. The default target is ACC3.

- PB13 / SCK remains at 0 V continuously.
- PB15 / MOSI remains at 0 V continuously.
- the selected nCS is high for 1 second and low for 1 second;
- all other nCS outputs remain high;
- no SCK edge is generated, so no SPI command is transferred;
- no Host SPI or USB frame is produced.

Build and flash the default ACC3 test:

```powershell
& "D:\study\programming\ESKIN\firmware\tools\commands\flash_acc_ncs_slow.cmd"
```

An explicit sensor number from 1 through 9 can also be supplied:

```powershell
& "D:\study\programming\ESKIN\firmware\tools\commands\flash_acc_ncs_slow.cmd" 3
```

For ACC3 the decoder address is `A3 A2 A1 A0 = 0 0 1 0`. Expected meter
readings are:

- SCK: 0 V continuously;
- MOSI: 0 V continuously;
- nCS3: approximately 3.3 V for 1 second, then 0 V for 1 second;
- every other nCS: approximately 3.3 V continuously;
- ACC3 SDI after its OR gate: approximately 3.3 V while nCS3 is high and
  approximately 0 V while nCS3 is low because `SDI = nCS OR MOSI` and MOSI
  remains low.

This does not electrically damage the LIS2DH12: all driven levels remain in
the 0-3.3 V I/O range, and there is no clock edge. It is only a decoder/nCS
continuity test and does not validate WHO_AM_I communication.

After the measurement, restore the normal ACC3 application:

```powershell
& "D:\study\programming\ESKIN\firmware\tools\commands\flash_acc_array.cmd" 0
```
