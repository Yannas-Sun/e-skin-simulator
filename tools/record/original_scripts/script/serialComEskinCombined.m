%% Real-time FSR + ACC view for src/Eskin/Eskin.ino
% Protocol:
%   command = 0xD0 = mode 3 + size 16
%   reply   = ts_acc uint32 + ts_fsr uint32
%             + 16 sensors * 3 axes * int16
%             + 2 FSR layers * 16 * 16 * uint16

port = "COM5";
baud = 500000;
n = 16;
cmd = uint8(bitor(bitshift(uint8(3), 6), uint8(n)));
tare_frames = 100;
tare_count = 0;
tare_sum1 = zeros(n, n);
tare_sum2 = zeros(n, n);
tare_base1 = [];
tare_base2 = [];
display_limit = 300;
layer1_gain = 1.0;
layer2_gain = 1;
layer1_deadband = 8;
layer2_deadband = 35;
prev_ts_fsr = [];
fps_display_timer = tic;
frame_count = 0;
display_fps = 0;
hardware_fps = 0;

device = serialport(port, baud, "Timeout", 3);
pause(1);
flush(device);

global running;
running = 1;
figure('CloseRequestFcn', @my_closereq);

while running
    write(device, cmd, "uint8");

    ts_acc = read(device, 1, "uint32");
    ts_fsr = read(device, 1, "uint32");

    acc_vec = read(device, 16 * 3, "int16");
    fsr_vec = read(device, 2 * n * n, "uint16");

    if numel(fsr_vec) ~= 2 * n * n || numel(acc_vec) ~= 16 * 3
        fprintf("Short read: ACC %d/48, FSR %d/512\n", numel(acc_vec), numel(fsr_vec));
        flush(device);
        continue;
    end

    acc = reshape(acc_vec, 3, 16)';
    fsr = reshape(fsr_vec, 2 * n, n);
    raw1 = double(fsr(1:16, :));
    raw2 = double(fsr(17:32, :));

    if isempty(tare_base1)
        tare_count = tare_count + 1;
        tare_sum1 = tare_sum1 + raw1;
        tare_sum2 = tare_sum2 + raw2;
        fprintf("Tare frame %d/%d\n", tare_count, tare_frames);

        if tare_count == tare_frames
            tare_base1 = tare_sum1 / tare_frames;
            tare_base2 = tare_sum2 / tare_frames;
            fprintf("Tare complete. Layer1 baseline %.1f..%.1f, Layer2 baseline %.1f..%.1f\n", ...
                min(tare_base1, [], "all"), max(tare_base1, [], "all"), ...
                min(tare_base2, [], "all"), max(tare_base2, [], "all"));
        end
        continue;
    end

    layer1 = raw1 - tare_base1;
    layer2 = raw2 - tare_base2;
    layer1(layer1 < 0) = 0;
    layer2(layer2 < 0) = 0;
    layer1(layer1 < layer1_deadband) = 0;
    layer2(layer2 < layer2_deadband) = 0;
    layer1 = layer1 * layer1_gain;
    layer2 = layer2 * layer2_gain;

    if ~isempty(prev_ts_fsr)
        dt_us = double(ts_fsr) - double(prev_ts_fsr);
        if dt_us < 0
            dt_us = dt_us + 2^32;
        end
        if dt_us > 0
            hardware_fps = 1e6 / dt_us;
        end
    end
    prev_ts_fsr = ts_fsr;

    frame_count = frame_count + 1;
    elapsed = toc(fps_display_timer);
    if elapsed >= 1.0
        display_fps = frame_count / elapsed;
        frame_count = 0;
        fps_display_timer = tic;
    end

    subplot(1, 3, 1);
    surf(layer1);
    title(sprintf("FSR layer 1 delta | HW %.1f FPS | UI %.1f FPS", hardware_fps, display_fps));
    caxis([0, display_limit]);
    zlim([0, display_limit]);
    colorbar;
    view([135 20]);

    subplot(1, 3, 2);
    surf(layer2);
    title(sprintf("FSR layer 2 delta | gain %.2f | deadband %d", layer2_gain, layer2_deadband));
    caxis([0, display_limit]);
    zlim([0, display_limit]);
    colorbar;
    view([135 20]);

    subplot(1, 3, 3);
    plot(acc);
    title(sprintf("ACC raw XYZ, ts=%u | L1 max %.1f | L2 max %.1f", ...
        ts_acc, max(layer1, [], "all"), max(layer2, [], "all")));
    legend("X", "Y", "Z");
    ylim([-20000, 20000]);

    drawnow;
end

clear device;

function my_closereq(src, event)
    global running;
    running = 0;
    delete(gcf);
end
