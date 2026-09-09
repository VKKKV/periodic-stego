# periodic-stego Web UI migration plan

状态：Web-first 实现已落地；功能、测试和已知限制以 README.md 为准。本文保留原始迁移目标，最终验收记录见 docs/VERIFICATION.md。
目标：把当前 Python CLI 原型改造成一个浏览器内运行的、可交互调参的周期信号/隐写分析工作台。

## 1. 产品目标

用户在浏览器中选择或拖拽一张本地图片，调整分析参数后，界面实时更新：

- 原图 / 预处理后的灰度图
- 2D FFT log-power spectrum
- 2D autocorrelation map
- X/Y 频谱 profile
- X/Y autocorrelation profile
- 检测到的候选周期、频率、峰值强度和置信提示
- 参数与结果 JSON 导出
- FFT / autocorrelation 诊断图 PNG 导出

核心定位是“可视化实验与线索生成器”，不是自动宣称“图片中存在隐写文本”。UI 必须明确展示不确定性和误报来源。

## 2. 总体架构

推荐前端优先、完全本地处理：

```text
Browser
  ├─ Image input: File / drag & drop / clipboard paste
  ├─ Canvas preprocessing
  ├─ Web Worker: FFT + autocorrelation + peak detection
  ├─ State store: source image + parameters + result
  ├─ Canvas/WebGL renderers: original / spectrum / autocorrelation
  └─ Export: JSON / PNG / parameter preset
```

不要把图片上传到服务器。README 和界面中明确写：图片只在浏览器本地处理。

保留当前 Python CLI 作为 reference implementation 和离线 fixture generator，但不要让 Web UI 依赖 Python 后端才能工作。

推荐目录：

```text
periodic-stego/
  periodic_stego/              # 保留 Python reference CLI
  tests/                       # 保留 Python 数值回归测试
  web/
    package.json
    vite.config.ts
    index.html
    src/
      main.ts
      app.ts
      state.ts
      worker.ts
      core/
        luminance.ts
        fft.ts
        autocorrelation.ts
        peaks.ts
        pipeline.ts
      render/
        heatmap.ts
        profile.ts
        overlays.ts
      ui/
        controls.ts
        panels.ts
        export.ts
      styles/
        tokens.css
        app.css
    tests/
      pipeline.test.ts
      worker.test.ts
      fixtures/
  PLAN.md
  AGENT_PROMPT.md
```

实现时可以选择把 Web 工程放在仓库根目录，而不是强行把 TypeScript 代码混进 Python package。

## 3. 技术选型

推荐：

- Vite
- TypeScript
- 原生 DOM 或轻量组件层；不要为这个工具引入大型 UI framework，除非确有必要
- Web Worker：分析不能阻塞主线程
- Canvas 2D：第一版 heatmap 足够；不要一开始引入 WebGL
- `fft.js` 或经过验证的 TypeScript FFT 实现；必须锁版本并写测试
- Vitest：算法单元测试
- Playwright：浏览器 smoke test

如果使用第三方 FFT library：

- 检查 license
- 固定版本
- 在 README 记录 normalization convention（forward/inverse scaling）
- 写一个已知 sinusoid fixture，验证 period 与 Python reference 一致

不建议第一版使用后端 API：这会破坏“本地图片不上传”的隐私优势，也增加部署复杂度。

## 4. 分析参数设计

所有参数都必须是可见、可调、可恢复默认值的控件。每个控件显示当前值和简短 tooltip。

### 输入 / 预处理

- image channel：Luminance / R / G / B / Alpha（无 Alpha 时禁用）
- normalize：on/off
- remove mean：on/off，默认 on
- detrend：none / row mean / column mean / plane trend
- contrast/gamma：用于显示和可选分析预处理，必须区分“analysis data”和“display only”
- crop ROI：x、y、width、height；支持在原图上拖拽选择
- max dimension / downsample：防止超大图卡死
- padding：none / next power of two / explicit size
- window function：none / Hann / Hamming / Blackman；默认 Hann

### FFT

- spectrum view：magnitude / power / log-power
- display gamma
- frequency range / zoom
- DC suppression radius
- peak count
- minimum peak separation
- relative power threshold
- show conjugate peaks：on/off
- show grid / axes / period labels：on/off

### Autocorrelation

- method：FFT autocorrelation / direct small-image fallback
- normalize：none / center-normalized
- max lag X
- max lag Y
- minimum lag
- peak threshold
- peak separation
- wraparound warning：on/off

### 实验模式

提供 presets：

- Default detector
- Periodic stripe
- Subtle periodic noise
- CTF forensic
- JPEG artifact inspection
- Clean / conservative（降低误报）

Presets 只能修改参数，不能替用户下结论。

## 5. 实时交互规则

- 参数变化使用 100–200ms debounce
- 新分析开始时显示进度和 `worker job id`
- 新 job 开始后丢弃旧 job 的晚到结果，避免竞态覆盖新结果
- 分析期间保留上一帧结果，但明确标注 `updating`
- 图片变化时自动重置不适用的 ROI 和尺寸参数
- 超大图片先显示警告，并要求 downsample 或使用默认安全上限
- 页面不能因坏图片、超大图片、空文件或不支持格式崩溃
- Worker 发生异常时显示可读错误和“复制 debug info”按钮

## 6. 视觉与布局方向

工具类界面采用 Dark Swiss / forensic workstation，而不是普通 SaaS 卡片堆叠：

- 深色背景，低对比度细分隔线
- 近乎无圆角、无玻璃拟态、无紫色 AI 渐变
- 单一冷色 accent（cobalt / cyan），警告用 amber，错误用 red
- 左侧参数栏约 272px
- 中央分析画布为主要视觉焦点
- 右侧结果栏显示候选周期、统计量、警告和解释
- 所有图表有清晰的 X/Y 轴、频率/period 单位和 cursor readout
- 不使用 emoji 作为图标，统一使用 Lucide 或文字标签
- 图像渲染支持高 DPI，不允许 heatmap 模糊
- `prefers-reduced-motion` 下关闭动画
- 移动端：参数栏折叠到 drawer，分析画布优先保留

建议页面结构：

```text
┌─────────────────────────────────────────────────────────────┐
│ PERIODIC-STego / local image analysis       Open  Export    │
├───────────────┬─────────────────────────────┬───────────────┤
│ PARAMETERS    │ MAIN VIEW                   │ FINDINGS      │
│               │ [Original] [FFT] [AC]       │ status        │
│ preprocessing │ large interactive canvas    │ candidate #1  │
│ fft           │                             │ candidate #2  │
│ autocorr      │ X profile / Y profile       │ warnings      │
│ thresholds    │                             │ provenance    │
└───────────────┴─────────────────────────────┴───────────────┘
```

## 7. 核心算法要求

### Luminance / preprocess

必须与当前 Python reference 的权重一致，或在 report 中记录实现版本和权重：

```text
Y = 0.2126 R + 0.7152 G + 0.0722 B
```

统一：

- float32 或 float64
- mean removal
- normalization
- window function
- padding convention

### FFT

输出：

- complex spectrum（内部）
- magnitude / power / log-power（显示）
- centered frequency coordinates
- period = 1 / spatial_frequency
- 对接近 DC 或 Nyquist 的峰做边界标记

避免把 conjugate pair 算成两个独立发现；UI 可显示两个峰，但 findings 应合并为一个候选。

### Autocorrelation

优先用 FFT 方式：

```text
AC = IFFT(FFT(x) * conjugate(FFT(x)))
```

明确 circular autocorrelation 的边界含义。UI 中显示提示：边缘周期可能受到 wraparound 影响。

### Peak detection

峰值检测至少包含：

- local maxima
- minimum separation
- relative-to-background score
- DC suppression
- conjugate pair merge
- X/Y/2D 来源
- confidence 只表示“信号检测置信度”，不表示“存在隐写内容”

Finding 数据结构建议：

```ts
interface PeriodCandidate {
  axis: 'x' | 'y' | '2d';
  frequencyX?: number;
  frequencyY?: number;
  periodX?: number;
  periodY?: number;
  power: number;
  relativePower: number;
  source: 'fft-profile' | 'fft-2d' | 'autocorrelation';
  confidence: number;
  caveats: string[];
}
```

## 8. 可视化要求

### Original view

- fit / 100% / nearest-neighbor / bilinear
- ROI rectangle
- pixel coordinate readout
- optional channel toggle

### FFT view

- log-power heatmap
- center crosshair
- hover 显示 `(fx, fy)`, `(periodX, periodY)`, power
- peak marker和 label
- 可调 display gamma，不改变底层分析结果

### Autocorrelation view

- center marker
- lag X/Y readout
- peak marker
- 明确标注 circular autocorrelation

### Profile view

- X / Y tabs 或 stacked chart
- frequency ↔ period toggle
- threshold line
- peak labels
- zoom / pan

不要只显示一张“彩色噪声图”；用户必须能看懂峰值对应的空间周期。

## 9. 导出与可复现性

导出 JSON 必须包括：

- tool version
- timestamp
- image metadata（不包含图片内容）
- all parameter values
- preprocessing config
- FFT convention
- candidates
- warnings

导出 PNG：

- original / preprocessed
- FFT
- autocorrelation
- profiles
- optional composite report

支持 Save/Load preset JSON，使相同参数可以复现实验。

## 10. 测试与验收

### 算法测试

至少覆盖：

- vertical period 8/16/32
- horizontal period
- both-axis period
- noise-only image：不应强行报告强周期
- constant image：不崩溃，报告 no useful signal
- RGB 与 grayscale
- odd dimensions
- non-power-of-two dimensions
- large image downsample
- crop changes result
- padding does not invent a strong false candidate

### 浏览器测试

Playwright smoke：

1. 打开页面
2. 拖入 fixture image
3. 确认原图显示
4. 修改 window function / threshold / channel
5. 等待 worker result
6. 确认 FFT、autocorrelation、profile 都更新
7. 导出 JSON，验证参数在 JSON 中
8. 导出 PNG，验证下载触发
9. 输入坏文件，确认显示错误而非崩溃
10. 使用 reduced-motion / 小屏 viewport

### 性能验收

- 512×512 图片交互调参保持流畅
- 1024×1024 图片不阻塞主线程
- 连续快速修改 slider 不产生旧结果覆盖新结果
- 取消或 supersede 旧 worker job
- 页面内存不会因重复加载图片持续泄漏

## 11. README 更新要求

README 必须重写为 Web-first：

- screenshot / 页面说明
- `npm install` / `npm run dev` / `npm run build`
- 本地隐私说明
- 参数说明
- 算法局限
- Python CLI 作为 reference / batch fallback
- 测试命令
- 浏览器兼容性

不要继续把 Python CLI demo 放在 README 的首要位置。

## 12. 明确不做的事

第一版不要：

- 上传图片到服务端
- 自动声称“发现了隐藏文本”
- 暴力猜测未知 payload encoding
- 对外部 URL 做扫描
- 引入数据库、账号系统或云端 API
- 一开始就做复杂 WebGL
- 一开始支持所有图片格式和 RAW 相机格式

## 13. 完成定义

只有以下全部满足才算完成：

- `npm run build` 成功
- `npm test` 成功
- Playwright smoke 成功
- 真实 PNG/JPEG 能在浏览器加载
- slider 调整后结果实时更新
- FFT、autocorrelation、profiles 可视化不是占位图
- JSON/PNG export 可用
- 至少一个 synthetic fixture 能检出已知周期
- noise-only fixture 不会被报告为强周期
- README 已按 Web-first 更新
- 页面无明显控制台错误
- 所有分析发生在浏览器本地
