export const messages: Record<string, string> = {
  "Browser-decoded pixels are not byte-exact source pixels. Canvas can discard hidden RGB under full transparency and round semi-transparent RGB; use a raw decoder for pixel-bit steganography.":
    "浏览器解码结果不等同于源文件的逐字节像素。Canvas 可能丢弃全透明像素下的隐藏 RGB，并舍入半透明 RGB；像素位隐写请使用原始解码器。",
  "No payload found.": "未发现载荷。",
  "Payload exceeds the 1 MiB output limit.": "载荷超过 1 MiB 输出限制。",
  "Expected a PNG file.": "需要 PNG 文件。",
  "Expected a GIF file.": "需要 GIF 文件。",
  "Expected a BMP file.": "需要 BMP 文件。",
  "Invalid PNG signature": "无效的 PNG 签名",
  "Unsupported PNG bit depth: only 8-bit supported":
    "不支持此 PNG 位深，目前仅支持 8 位",
  "Unsupported PNG interlace (Adam7)": "暂不支持 Adam7 交错 PNG",
  "Unsupported animated PNG": "暂不支持动画 PNG",
  "Trailing data after PNG IEND":
    "PNG IEND 后存在附加数据；请先使用尾载提取工具",
  "Native DecompressionStream is unavailable":
    "当前浏览器不支持原生 DecompressionStream",
  "Not enough selected pixel bits for the complete requested output":
    "所选像素位不足以生成完整的请求输出",
  "Channels must be unique ordered letters from rgba":
    "通道需按顺序填写 rgba 中的不重复字母",
  "Bit must be an integer in 0..7": "位索引必须是 0..7 的整数",
  "Offset must be a nonnegative bit count": "位偏移必须是非负整数",
  "Length must be 1..1048576 bytes": "输出长度必须为 1..1048576 字节",
  "PNG decompression exceeds expected scanline length":
    "PNG 解压数据超出预期扫描行长度",
  "PNG input exceeds 32 MiB limit": "PNG 输入超过 32 MiB 上限",
  "PNG dimensions exceed 16384 per side / 16777216 pixel limit":
    "PNG 尺寸超过单边 16384 / 总计 16777216 像素上限",
  "Invalid 8-bit PNG tRNS sample": "8 位 PNG 的 tRNS 样本无效",
  "Bitplane ready. Black is 0; white is 1. Export preserves native dimensions.":
    "位平面就绪。黑色为 0，白色为 1；导出保留原始尺寸。",

  "Extraction tools": "提取工具",
  "EXTRACTION TOOLS": "提取工具",
  "Work on original file bytes. Choose a method and parameters; no automatic payload guessing.":
    "使用原始文件字节。请选择方法与参数，不自动猜测载荷。",
  Operation: "操作",
  "Container / sentinel extraction": "容器尾载 / 哨兵提取",
  "Raw PNG bitplane": "原始 PNG 位平面",
  "Raw PNG bitstream": "原始 PNG 位流",
  "Byte source": "字节来源",
  "After PNG IEND": "PNG IEND 之后",
  "After GIF trailer": "GIF 结束标记之后",
  "BMP zero-pair sentinels": "BMP 双零哨兵之间",
  "Decode as": "解码方式",
  "Raw bytes": "原始字节",
  "ASCII bits": "ASCII 位流",
  "Zero symbol (decimal)": "零位符号（十进制）",
  "One symbol (decimal)": "一位符号（十进制）",
  "Insert bit at (-1 disables)": "插入位位置（-1 禁用）",
  "Inserted bit": "插入位值",
  "Native 8-bit non-interlaced PNG only. No Canvas fallback; hidden RGB is preserved.":
    "仅支持原生 8 位非交错 PNG。不回退 Canvas，保留隐藏 RGB。",
  "Plane channel": "位平面通道",
  "Bit index (0 = LSB)": "位索引（0 为最低位）",
  "Channel order": "通道顺序",
  "Pixel traversal": "像素遍历",
  "Row-major": "逐行",
  "Column-major": "逐列",
  "Bit offset": "位偏移",
  "Output bytes": "输出字节数",
  "Byte bit order": "字节内位序",
  "MSB first": "高位优先",
  "LSB first": "低位优先",
  "Run tool": "运行工具",
  "Download result": "下载结果",
  "Raw bitplane": "原始位平面",
  "Load a local image before extracting.": "请先加载本地图像再提取。",
  "Ready to extract.": "可开始提取。",
  "Extracting…": "正在提取…",
  "Extraction ready. Preview is limited to 4096 bytes; download preserves the full result.":
    "提取完成。仅预览前 4096 字节；下载保留完整结果。",
  "Expected an integer parameter.": "参数必须为整数。",
  "Channel difference mask": "通道差异掩码",
  "Local anomaly mask": "局部异常掩码",
  "Prime-value mask": "素数值掩码",
  "Pixel coordinates / Morse": "像素坐标 / Morse",
  "Invert / XOR bytes": "字节反转 / XOR",
  "JPEG trailer / carving inspection": "JPEG 尾数据 / carving 检查",
  "Barcode recognition": "条码识别",
  "Compare with": "比较通道",
  Threshold: "阈值",
  "Coordinate order": "坐标顺序",
  "Invert threshold": "反转阈值",
  "Morse conversion": "Morse 转换",
  "XOR value": "XOR 值",
  "Invert bytes": "反转字节",
  "Run an explicitly selected operation; results are bounded and do not infer a payload.":
    "运行明确选择的操作；结果有上限，不自动推断载荷。",
  "BarcodeDetector is unavailable in this browser":
    "当前浏览器不提供 BarcodeDetector。",

  "Decoded ASCII bits after the structurally parsed GIF trailer.":
    "按 GIF 结构定位结束标记，解码其后附加的 ASCII 位流。",
  "Decoded strict Base64 after the structurally parsed PNG IEND; chunk CRCs verified.":
    "按 PNG 结构定位 IEND，解码其后附加的规范 Base64；数据块 CRC 已校验。",
  "PCA uses the decoded, white-matted working RGB image (at most 2048 pixels per side), not raw source pixels or the signal-analysis ROI.":
    "PCA 使用解码、白底合成后的工作 RGB 图（每边最多 2048 像素），并非原始文件像素，也不使用信号分析 ROI。",

  "Truncated BMP header.": "BMP 文件头被截断。",
  "Invalid BMP DIB header.": "BMP DIB 文件头无效。",
  "Expected an uncompressed 8-bit indexed BMP.": "需要未压缩的 8 位索引 BMP。",
  "Invalid BMP dimensions.": "BMP 尺寸无效。",
  "Invalid BMP pixel offset or range.": "BMP 像素偏移或范围无效。",
  "Truncated GIF header.": "GIF 文件头被截断。",
  "Invalid GIF dimensions.": "GIF 尺寸无效。",
  "Truncated GIF block.": "GIF 数据块被截断。",
  "Unterminated GIF subblocks.": "GIF 子块缺少终止符。",
  "GIF trailer appears before image data.": "GIF 结束标记出现在图像数据之前。",
  "Truncated GIF extension.": "GIF 扩展被截断。",
  "Invalid GIF graphic control extension.": "GIF 图形控制扩展无效。",
  "Invalid GIF graphic control terminator.": "GIF 图形控制终止符无效。",
  "Invalid GIF extension header.": "GIF 扩展头无效。",
  "Unknown GIF extension.": "未知 GIF 扩展。",
  "Invalid GIF image dimensions.": "GIF 图像尺寸无效。",
  "Invalid GIF LZW minimum code size.": "GIF LZW 最小码长无效。",
  "Empty GIF image data.": "GIF 图像数据为空。",
  "Unknown GIF block.": "未知 GIF 数据块。",
  "Missing GIF trailer.": "缺少 GIF 结束标记。",
  "GIF trailer payload must contain complete 8-bit groups.":
    "GIF 尾部载荷必须为完整的 8 位组。",
  "GIF trailer payload must contain only ASCII 0 and 1.":
    "GIF 尾部载荷只能包含 ASCII 0 和 1。",
  "Truncated PNG chunk.": "PNG 数据块被截断。",
  "Invalid PNG chunk bounds.": "PNG 数据块边界无效。",
  "Invalid PNG chunk type.": "PNG 数据块类型无效。",
  "Invalid PNG chunk CRC.": "PNG 数据块 CRC 无效。",
  "PNG must begin with IHDR.": "PNG 必须以 IHDR 开始。",
  "Invalid PNG IHDR.": "PNG IHDR 无效。",
  "Invalid PNG IEND.": "PNG IEND 无效。",
  "Missing PNG IEND.": "缺少 PNG IEND。",
  "PNG trailer must be canonical Base64.": "PNG 尾部必须为规范 Base64。",
  found: "已找到",
  absent: "未找到",
  unsupported: "不支持",
  malformed: "格式损坏",
  "decode-error": "解码失败",
  "Truncated TIFF header": "TIFF 文件头被截断",
  "Invalid TIFF byte order": "TIFF 字节序无效",
  "BigTIFF is not supported": "不支持 BigTIFF",
  "Invalid TIFF magic": "TIFF 魔数无效",
  "Missing IFD0": "缺少 IFD0",
  "Cyclic TIFF directory chain": "TIFF 目录链存在循环",
  "Too many TIFF directories": "TIFF 目录数量过多",
  "IFD offset outside APP1": "IFD 偏移超出 APP1",
  "Too many TIFF entries": "TIFF 条目数量过多",
  "Truncated TIFF directory": "TIFF 目录被截断",
  "Overlapping TIFF directories": "TIFF 目录重叠",
  "Duplicate TIFF tag": "TIFF 标签重复",
  "Unsupported TIFF field type": "不支持此 TIFF 字段类型",
  "TIFF field data outside APP1": "TIFF 字段数据超出 APP1",
  "TIFF field data overlaps a directory": "TIFF 字段数据与目录重叠",
  "No IFD1 thumbnail directory": "没有 IFD1 缩略图目录",
  "IFD1 has no JPEG thumbnail tags": "IFD1 没有 JPEG 缩略图标签",
  "Missing thumbnail Compression tag": "缺少缩略图 Compression 标签",
  "Compression must be one SHORT": "Compression 必须为单个 SHORT",
  "Thumbnail compression is not JPEG (6)": "缩略图不是 JPEG（6）压缩",
  "Missing JPEG thumbnail offset or length": "缺少 JPEG 缩略图偏移或长度",
  "JPEG thumbnail offset and length must each be one LONG":
    "JPEG 缩略图偏移和长度均须为单个 LONG",
  "JPEG thumbnail range outside APP1 or too short":
    "JPEG 缩略图范围超出 APP1 或长度不足",
  "JPEG thumbnail overlaps TIFF metadata": "JPEG 缩略图与 TIFF 元数据重叠",
  "JPEG thumbnail is missing SOI or EOI": "JPEG 缩略图缺少 SOI 或 EOI",
  "Input is not a JPEG": "输入不是 JPEG",
  "No EXIF APP1 segment": "没有 EXIF APP1 段",
  "Expected JPEG marker": "应为 JPEG 标记",
  "Truncated JPEG marker": "JPEG 标记被截断",
  "Invalid marker before JPEG scan": "JPEG 扫描前出现无效标记",
  "Truncated JPEG segment length": "JPEG 段长度被截断",
  "Invalid or truncated JPEG segment": "JPEG 段无效或被截断",
  "Invalid JPEG SOS header": "JPEG SOS 头无效",
  "Multiple EXIF APP1 segments are ambiguous":
    "存在多个 EXIF APP1 段，无法唯一确定",
  "JPEG header ended before SOS or EOI": "JPEG 文件头在 SOS 或 EOI 前结束",
  "BMP 0x16/0x17 sentinel bits; restored the documented zero after the first seven bits.":
    "提取 BMP 哨兵间的 0x16/0x17 位流；按题目记录在前七位后补回零位。",

  "RGB PCA · PC1": "RGB PCA · 第一主成分",
  "RGB PCA · PC2": "RGB PCA · 第二主成分",
  "RGB PCA · PC3": "RGB PCA · 第三主成分",
  "EXIF thumbnail": "EXIF 缩略图",
  "Centered RGB PCA; each component is independently scaled. Not an authenticity verdict.":
    "中心化 RGB PCA；各分量独立缩放显示，不代表真实性判定。",
  "Embedded EXIF JPEG thumbnail; export preserves its original bytes.":
    "内嵌 EXIF JPEG 缩略图；导出保留原始字节。",
  "No supported EXIF JPEG thumbnail is available.":
    "没有可用的受支持 EXIF JPEG 缩略图。",
  "Embedded thumbnail could not be decoded safely.": "无法安全解码内嵌缩略图。",
  verified: "已验证题解",
  partial: "部分解法",
  unsolved: "未解",
  "LOCAL IMAGE FORENSICS WORKBENCH": "本地图像取证工作台",
  Workflow: "工作流程",
  "Limits and interpretation": "限制与解读",
  "C2PA marker scanning does not parse manifests or validate signatures. A match is not proof of provenance.":
    "C2PA 标记扫描不解析清单或验证签名；匹配不等于来源可信。",
  "Load an image": "加载图像",
  "Automatic analysis": "自动分析",
  "Signal · image forensics": "信号 · 图像取证",
  "Inspect the evidence": "检查结果",
  "Compare · inspect · export": "对比 · 检查 · 导出",
  "CURRENT INPUT": "当前图像",
  Sample: "示例",
  "Try sample": "运行示例",
  "Try a sample": "试用示例",
  "Choose image": "选择图像",
  "SIGNAL ANALYSIS": "信号分析",
  Controls: "参数",
  "Start with the defaults. Open a section only when you need to change how the image is measured.":
    "先使用默认参数；需要调整测量方式时再展开对应选项。",
  WORKSPACE: "工作区",
  "Inspect the image": "查看图像",
  "STEP 01 · LOAD A LOCAL IMAGE": "第一步 · 加载本地图像",
  "Find the rhythm.": "寻找重复规律。",
  "Question the signal.": "审视图像信号。",
  "Drop an image here, choose": "拖入图像，选择",
  "or try a sample.": "或运行示例。",
  "Private by design.": "本地处理，保护隐私。",
  "Pixels stay in this browser. No account, upload, or cloud analysis.":
    "像素保留在浏览器内，无需账号，不上传、不使用云端分析。",
  "STEP 03 · EVIDENCE": "第三步 · 检查结果",
  "What did we find?": "检测到了什么？",
  "Results are signals to inspect, not automatic proof of hidden content.":
    "结果是供检查的线索，并不自动证明存在隐藏内容。",
  "Forensic results": "取证结果",
  "IMAGE FORENSICS": "图像取证",
  "LOCAL / SCREENING ONLY": "本地处理 / 仅用于筛查",
  Method: "方法",
  Close: "关闭",
  "Export view": "导出当前图",
  "Retry forensic analysis": "重试取证分析",
  "Running local forensic analysis…": "正在运行本地图像取证…",
  "Forensic screening ready": "图像取证筛查完成",
  "ELA · JPEG quality 90": "ELA · JPEG 质量 90",
  "ELA · JPEG quality 75": "ELA · JPEG 质量 75",
  "ELA · JPEG quality 50": "ELA · JPEG 质量 50",
  "ELA · JPEG quality 95": "ELA · JPEG 质量 95",
  "Noise residual": "噪声残差",
  "Luminance gradient": "亮度梯度",
  "Luminance bands": "亮度分段伪彩色",
  "Weighted RGB grayscale": "加权 RGB 灰度",
  "Clone candidates": "重复块候选",
  "Decoded working image": "解码后的工作图像",
  "Metadata / JPEG structure": "元数据 / JPEG 结构",
  "String extraction": "字符串提取",
  "Forensic tool": "取证工具",
  "Forensic diagnostic": "取证诊断图",
  "No printable strings found.": "未发现可打印字符串。",
  "Use as a screening signal only.": "仅用于筛查，不能据此判定真实性。",
  "Red regions are coarse repeated-block candidates.":
    "红色区域为粗略重复块候选。",
  "ELA, noise and clone maps are screening signals, not authenticity verdicts.":
    "ELA、噪声及重复块图仅提供筛查线索，不是真实性结论。",
  "Re-encoding, resizing, platform compression and ordinary texture can create highlights.":
    "重新编码、缩放、平台压缩和普通纹理都可能产生高亮。",
  "Clone detection uses coarse block similarity and can produce false positives on repeated texture.":
    "重复块检测采用粗略块相似度，重复纹理可能导致误报。",
  "Asset URL": "资源链接",
  "JPEG re-encoding failed.": "JPEG 重新编码失败。",
  Source: "源码",
  License: "许可证",
  "ELA uses a white matte for transparency and a working image capped at 2048 pixels per side.":
    "ELA 将透明区域合成到白底，工作图像每边不超过 2048 像素。",
  "Noise and clone screening use a working image capped at 512 pixels per side, then scale the maps back up.":
    "噪声和重复块筛查使用每边不超过 512 像素的工作图像，再放大诊断图。",
  "Clone screening verifies RGB block differences but uses bounded candidate sampling; repeated texture can match and small or transformed copies can be missed.":
    "重复块筛查会核验 RGB 块差异，但候选采样有上限；重复纹理可能匹配，细小或变换后的复制可能漏检。",
  "Printable strings are limited to 100 runs of at most 512 characters each.":
    "可打印字符串最多显示 100 段，每段最多 512 字符。",
  "Source code": "源代码",
  "No warranty. Redistribution permitted under AGPLv3.":
    "不提供担保。可按 AGPLv3 条款再分发。",
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
  "Native ROI/channel pass, independent of FFT controls. This is a conservative heuristic, not a decoder. Horizontal repetition may be a stereogram or tiled texture; disparity is not decoded text or metric depth.":
    "按原始 ROI / 通道独立检测，不受 FFT 控件影响。这是保守启发式检测，不是解码器。水平重复可能来自立体图或平铺纹理；视差不是解码文本，也不是物理深度。",
  "Horizontal repetition also occurs in ordinary tiled texture. Disparity is a diagnostic, not proof of a stereogram or decoded text.":
    "普通平铺纹理也有水平重复。视差是诊断结果，不能证明存在立体图或解码文本。",
  "This detector is a conservative heuristic, not a decoder. Horizontal repetition also occurs in ordinary tiled texture. Disparity is diagnostic evidence, not proof of a stereogram or decoded text.":
    "该检测器是保守启发式方法，不是解码器。普通平铺纹理也可能产生水平重复；视差仅是诊断线索，不能证明存在立体图或解码文本。",
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
  "Invalid stereogram period range: minimum must not exceed maximum.":
    "立体图周期范围无效：最小值不能大于最大值。",
  "Invalid stereogram separation range: minimum must not exceed maximum.":
    "立体图局部分离范围无效：最小值不能大于最大值。",
  "Malformed JPEG marker.": "JPEG 标记损坏。",
  "Unsupported or corrupt image. Choose a valid PNG, JPEG, BMP, or GIF.":
    "不支持的图像或文件已损坏，请选择有效的 PNG、JPEG、BMP 或 GIF。",
  "Image request superseded.": "图像请求已被新请求取代。",
  "The image file is empty.": "图像文件为空。",
  "File exceeds 32 MiB. Resize it locally before opening.":
    "文件超过 32 MiB，请在本地缩小后再打开。",
  "Image exceeds the safe decode limit (16 megapixels / 16384 px per side). Resize it locally first.":
    "图像超过安全解码上限（16 兆像素 / 每边 16384 px），请先在本地缩小。",
  "The browser could not decode this image. It may be corrupt or unsupported.":
    "浏览器无法解码此图像，文件可能损坏或不受支持。",
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
