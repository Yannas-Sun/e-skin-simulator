# E-SKIN 命令脚本说明

本目录是 Windows 下构建、烧录、上传和启动监视器的统一入口。

当前完整模块由 FSR1、FSR2 和 9 个 ACC 组成。组合 Teensy bridge 的
Host SPI 实际配置为 `100 kHz`，IRQ/CS/hold 等待为 `1000/1000/100 us`。

目录结构：

```text
tools/commands/
|-- flash_teensy_self_test.cmd    Teensy 单板一键测试
|-- flash_spi_pattern_test.cmd    STM32 + Teensy SPI 一键联调
|-- flash_fsr1_pair.cmd           FSR1 完整 16x16 一键测试和热图
|-- flash_fsr2_pair.cmd           FSR2 完整 16x16 一键测试和热图
|-- flash_combined_pair.cmd       STM32 + Teensy 完整系统一键烧录
|-- upload_teensy_sketch.cmd      通用 Teensy 编译/上传器
|-- monitor_teensy_serial.cmd     通用 Teensy 串口监视器
|-- original/                     原有底层和单项测试脚本主体
`-- 其他同名 .cmd                 指向 original/ 的兼容入口
```

所有命令都可以从任意 PowerShell 工作目录执行。下面给出的“完整指令”
使用绝对路径，复制后即可运行。Teensy 端口未指定时默认为 `COM9`。

## 一键流程

### `flash_teensy_self_test.cmd`

编译并上传 Teensy 4.1 单板自检程序，然后自动打开 115200 波特率串口
监视器。STM32 不参与。测试期间应断开 STM32 SPI 接线，因为板载 LED
与 SPI SCK 共用 GPIO13。按 `Ctrl+C` 退出监视器。

完整指令：

```powershell
& "D:\study\programming\ESKIN\firmware\tools\commands\flash_teensy_self_test.cmd" COM9
```

### `flash_spi_pattern_test.cmd`

完整执行 STM32--Teensy `0x55` SPI 链路测试：

1. 构建 `ESKIN_STM32_PATTERN`；
2. 通过 DAPLink 烧录 STM32；
3. 编译 Teensy SPI Pattern Receiver；
4. 通过指定 COM 端口上传 Teensy。
5. 自动打开 115200 波特率串口监视器，直接显示 `0x55 PASS/FAIL`。

完整指令：

```powershell
& "D:\study\programming\ESKIN\firmware\tools\commands\flash_spi_pattern_test.cmd" COM9
```

### `flash_fsr1_pair.cmd` / `flash_fsr2_pair.cmd`

复用 `teensy/applications/ESKIN_SPI_USB_BRIDGE` 中已有的完整 FSR 方案。
脚本烧录对应 STM32 FSR 固件，上传通用 Teensy bridge，然后自动打开
PCB 形状的 16x16 热图。GUI 直接显示 STM32 原始 `0..4095` ADC 数据，
不加载校准文件、不做归一化，并保留方向映射和原始帧保存。

完整指令：

```powershell
& "D:\study\programming\ESKIN\firmware\tools\commands\flash_fsr1_pair.cmd" COM9
& "D:\study\programming\ESKIN\firmware\tools\commands\flash_fsr2_pair.cmd" COM9
```

### `flash_combined_pair.cmd`

完整执行生产组合固件部署：先构建/烧录 STM32 的 FSR1 + FSR2 + 9 ACC
固件，再编译/上传 Teensy `ESKIN_COMBINED_BRIDGE`，最后自动打开 Combined
GUI 的 `all` 视图。关闭 GUI 窗口即可结束脚本。

完整指令：

```powershell
& "D:\study\programming\ESKIN\firmware\tools\commands\flash_combined_pair.cmd" COM9
```

完整固件已经烧录后，可单独打开 GUI，不重新编译或烧录：

```powershell
& "D:\study\programming\ESKIN\firmware\tools\commands\start_combined_monitor.cmd" COM9 all
```

### `upload_teensy_sketch.cmd`

通用 Teensy 4.1 编译和上传器。参数依次为：sketch 文件夹、COM 端口、
构建目录名称。使用 `teensy:avr:teensy41`，优先调用
`D:\study\programming\ArduinoCLI\arduino-cli.exe`。

完整指令示例：

```powershell
& "D:\study\programming\ESKIN\firmware\tools\commands\upload_teensy_sketch.cmd" "D:\study\programming\ESKIN\firmware\teensy\tests\TEENSY_SELF_TEST" COM9 TEENSY_SELF_TEST
```

### `monitor_teensy_serial.cmd`

等待 USB 串口重新连接两秒，然后通过 Arduino CLI 打开串口监视器。参数
依次为 COM 端口和波特率；默认值为 `COM9` 和 `115200`。按 `Ctrl+C`
退出。

完整指令：

```powershell
& "D:\study\programming\ESKIN\firmware\tools\commands\monitor_teensy_serial.cmd" COM9 115200
```

## 原有底层脚本

脚本主体保存在：

```text
D:\study\programming\ESKIN\firmware\tools\commands\original
```

顶层保留同名兼容入口，因此旧命令仍然有效。以下完整指令直接调用
`original` 中的脚本主体。

### `flash_combined.cmd`

只构建并烧录 STM32 完整采集固件，不改变 Teensy。

```powershell
& "D:\study\programming\ESKIN\firmware\tools\commands\original\flash_combined.cmd"
```

### `flash_stm32_project.cmd`

构建并烧录一个指定的 STM32 工程。支持：`fsr1`、`fsr2`、
`fsr1-adc`、`acc-whoami`、`spi-pattern`。

```powershell
& "D:\study\programming\ESKIN\firmware\tools\commands\original\flash_stm32_project.cmd" fsr1
& "D:\study\programming\ESKIN\firmware\tools\commands\original\flash_stm32_project.cmd" fsr2
& "D:\study\programming\ESKIN\firmware\tools\commands\original\flash_stm32_project.cmd" fsr1-adc
& "D:\study\programming\ESKIN\firmware\tools\commands\original\flash_stm32_project.cmd" acc-whoami
& "D:\study\programming\ESKIN\firmware\tools\commands\original\flash_stm32_project.cmd" spi-pattern
```

### `flash_acc_array.cmd`

烧录 ACC 正常采集固件。`0` 表示全部 ACC，`1..9` 表示只启用指定 ACC；
不带参数时脚本会交互询问。

```powershell
& "D:\study\programming\ESKIN\firmware\tools\commands\original\flash_acc_array.cmd" 0
& "D:\study\programming\ESKIN\firmware\tools\commands\original\flash_acc_array.cmd" 5
```

### `flash_acc_spi_test.cmd`

烧录 ACC SPI 诊断固件，输出 WHO_AM_I、状态、XYZ 和 SPI 诊断信息。
`0` 测试全部，`1..9` 选择单颗。

```powershell
& "D:\study\programming\ESKIN\firmware\tools\commands\original\flash_acc_spi_test.cmd" 0
& "D:\study\programming\ESKIN\firmware\tools\commands\original\flash_acc_spi_test.cmd" 3
```

### `flash_acc_sck_slow.cmd`

烧录慢 SCK 连续性测试：PB13/SCK 低 1 秒、高 1 秒，循环执行。

```powershell
& "D:\study\programming\ESKIN\firmware\tools\commands\original\flash_acc_sck_slow.cmd"
```

### `flash_acc_mosi_slow.cmd`

选中指定 ACC，使 MOSI 慢速高低翻转；默认 ACC3。

```powershell
& "D:\study\programming\ESKIN\firmware\tools\commands\original\flash_acc_mosi_slow.cmd" 3
```

### `flash_acc_ncs_slow.cmd`

让指定 ACC 的 nCS 慢速高低翻转；默认 ACC3。

```powershell
& "D:\study\programming\ESKIN\firmware\tools\commands\original\flash_acc_ncs_slow.cmd" 3
```

### `flash_acc_or_gate_static.cmd`

静态 OR 门线路测试。第一个参数为 ACC `1..9`，第二个参数为 MOSI
固定电平 `0` 或 `1`；只给 ACC 时 MOSI 默认为 `1`。

```powershell
& "D:\study\programming\ESKIN\firmware\tools\commands\original\flash_acc_or_gate_static.cmd" 5 0
& "D:\study\programming\ESKIN\firmware\tools\commands\original\flash_acc_or_gate_static.cmd" 5 1
```

### `start_combined_monitor.cmd`

启动完整系统 Python GUI。第一个参数是 COM 端口，第二个参数是初始视图：
`all`、`fsr1`、`fsr2` 或 `acc`。

```powershell
& "D:\study\programming\ESKIN\firmware\tools\commands\original\start_combined_monitor.cmd" COM9 all
& "D:\study\programming\ESKIN\firmware\tools\commands\original\start_combined_monitor.cmd" COM9 fsr1
& "D:\study\programming\ESKIN\firmware\tools\commands\original\start_combined_monitor.cmd" COM9 fsr2
& "D:\study\programming\ESKIN\firmware\tools\commands\original\start_combined_monitor.cmd" COM9 acc
```

## 固定环境与注意事项

- STM32 型号：`stm32g474cetx`。
- DAPLink UID：`LU_2022_8888`。
- SWD：10 kHz、under-reset、hardware reset、sector erase。
- Teensy FQBN：`teensy:avr:teensy41`。
- Arduino CLI：`D:\study\programming\ArduinoCLI\arduino-cli.exe`。
- STM32 构建输出：`D:\study\programming\builds\...`。
- Teensy 构建输出：`firmware\.arduino-build\...`。
- Arduino Serial Monitor 与 Python reader 不可同时占用同一个 COM 端口。
- 执行任何 Teensy 上传前，先关闭旧 GUI、串口监视器和其他占用 COM9
  的 Python 进程；否则 Arduino CLI 会报告 `PermissionError(13)` 或
  `拒绝访问`。
- 若 Teensy 上传器等待设备，按一次 Teensy Program 按钮，不要长按。
