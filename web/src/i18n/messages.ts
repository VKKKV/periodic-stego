export const messages: Record<string, string> = {
  "Native row matching": "原始扫描行匹配",
  "Stereogram disparity": "立体图视差",
  "Stereogram disparity PNG": "立体图视差 PNG",
  stereogram: "立体图视差",
  "Horizontal repeat": "水平重复",
  "original px": "原图像素",
  "Original period": "原图周期",
  "X · original pixels": "X · 原图像素",
  Correlation: "相关值",
  "Row support": "扫描行支持率",
  "Matched pixels": "匹配像素",
  Disparity: "视差",
  Unmatched: "未匹配",
  "disparity · original px · blue = unmatched":
    "视差 · 原图像素 · 蓝色为未匹配",
  "Native ROI/channel pass, independent of FFT controls. Horizontal repetition may be a stereogram or tiled texture. View disparity; it is not decoded text or metric depth.":
    "按原始 ROI / 通道独立检测，不受 FFT 控件影响。水平重复可能来自立体图或平铺纹理。可查看视差；它不是解码文本，也不是物理深度。",
  "Horizontal repetition also occurs in ordinary tiled texture. Disparity is a diagnostic, not proof of a stereogram or decoded text.":
    "普通平铺纹理也有水平重复。视差是诊断结果，不能证明存在立体图或解码文本。",
  "Repeated structure is not proof of hidden text.":
    "重复结构不是隐藏文本的证据。",
  "JPEG blocks, resizing, scanlines, moire and ordinary textures may produce peaks.":
    "JPEG 块效应、缩放、扫描线、摩尔纹和普通纹理可能产生峰值。",
  "Confidence is an uncalibrated signal-strength heuristic, not a probability of steganography.":
    "置信分数是未经校准的信号强度启发式指标，不是隐写概率。",
  "Previous result · not current; wait for a successful analysis.":
    "上一分析结果 · 已过期，请等待分析成功。",
  "This image has no transparency. Select another channel.":
    "此图像没有透明像素，请选择其他通道。",
  "Wait for a successful analysis before exporting; stale results are not exported.":
    "请等待分析成功后再导出；不会导出过期结果。",
  "Preset exceeds 64 KiB.": "预设文件超过 64 KiB。",
  "PNG export failed.": "PNG 导出失败。",
  "Unknown preset.": "未知预设。",
  "Invalid parameter object.": "无效的参数对象。",
  "Invalid ROI.": "无效的 ROI。",
  "Unsupported preset schema.": "不支持的预设格式。",
  "Invalid preset JSON.": "预设不是有效的 JSON。",
  "Malformed JPEG marker.": "JPEG 标记损坏。",
  "Unsupported or corrupt image. Choose a valid PNG or JPEG.":
    "不支持的图像或文件已损坏，请选择有效的 PNG 或 JPEG。",
  "Image request superseded.": "图像请求已被新请求取代。",
  "The image file is empty.": "图像文件为空。",
  "File exceeds 32 MiB. Resize it locally before opening.":
    "文件超过 32 MiB，请在本地缩小后再打开。",
  "Image exceeds the safe decode limit (16 megapixels / 16384 px per side). Resize it locally first.":
    "图像超过安全解码上限（16 兆像素 / 每边 16384 px），请先在本地缩小。",
  "The browser could not decode this PNG/JPEG. It may be corrupt or unsupported.":
    "浏览器无法解码此 PNG/JPEG，文件可能损坏或不受支持。",
  "Canvas 2D is not supported by this browser.": "当前浏览器不支持 Canvas 2D。",
  "Unknown demo.": "未知演示。",
  "Demo PNG generation failed.": "演示 PNG 生成失败。",
  "Worker failed to start. Reload the page to retry.":
    "Worker 启动失败，请重新加载页面重试。",
  "Invalid image dimensions or RGBA buffer; maximum 16 megapixels.":
    "图像尺寸或 RGBA 缓冲区无效；最大为 16 兆像素。",
  "ROI extends beyond the original image.": "ROI 超出原图范围。",
  "Explicit padding size must fit both processed dimensions; it cannot crop the image.":
    "指定补零尺寸必须容纳预处理图像的两条边，不能用于裁剪。",
  "Padded FFT dimensions exceed 2048.": "补零后的 FFT 尺寸超过 2048。",
  "Direct autocorrelation is limited to 32 × 32 padded pixels. Use FFT or reduce max dimension.":
    "直接自相关仅限补零后不超过 32 × 32 像素，请使用 FFT 或缩小最大边长。",
  "Zero padding interpolates the frequency grid; it does not improve true frequency resolution. AC wraps on the padded dimensions.":
    "补零仅对频率网格插值，不提高真实频率分辨率。自相关在补零后的尺寸上循环回绕。",
  "Very short dimensions may be suppressed by the selected window.":
    "所选窗函数可能抑制极短维度上的信号。",
  "Circular autocorrelation wraps across the padded grid; edge lags can be misleading.":
    "循环自相关会跨越补零网格边界回绕；边缘滞后可能造成误判。",
  "Periodicity is repeated structure, not proof of hidden text. JPEG blocks, resampling, moire and normal textures also create peaks.":
    "周期性代表重复结构，不是隐藏文本的证据。JPEG 块效应、重采样、摩尔纹和普通纹理也会产生峰值。",
  "Confidence is an uncalibrated signal-strength heuristic, not a probability.":
    "置信分数是未经校准的信号强度启发式指标，不是概率。",
  "No useful signal: the processed image is constant or has negligible variance.":
    "无有效信号：预处理图像为常量或方差极小。",
  "Mean removal is disabled: DC/window leakage may dominate.":
    "去均值已禁用：DC / 窗泄漏可能占据主导。",
  "Signal-strength heuristic, not evidence of a hidden message.":
    "信号强度启发式指标，不是隐藏消息的证据。",
  "Near the excluded DC region; sensitive to trends/windowing.":
    "靠近排除的 DC 区域，对趋势和窗函数敏感。",
  "Near Nyquist; undersampling or aliasing may affect interpretation.":
    "接近 Nyquist 频率，欠采样或混叠可能影响解读。",
  "Conjugate peaks are one candidate; ordinary texture can produce the same evidence.":
    "共轭峰合并为一个候选；普通纹理也可能产生相同证据。",
  "Near Nyquist; aliasing is possible.": "接近 Nyquist 频率，可能发生混叠。",
  "Near DC; inspect trends and window leakage.":
    "接近 DC，请检查趋势和窗泄漏。",
  "Circular lag, not inverse-frequency bin. Multiples/harmonics may not be the fundamental period.":
    "此值为循环滞后，不是频率 bin 的倒数。倍数或谐波不一定是基周期。",
  "Autocorrelation alone does not establish periodicity or hidden content.":
    "仅凭自相关不能确定周期性或隐藏内容。",
};
