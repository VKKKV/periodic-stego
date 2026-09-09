import { zh } from "./catalog";
import { messages } from "./messages";
export type Locale = "en" | "zh-CN";
export const LOCALE_KEY = "periodic-stego-locale";
let locale: Locale = "en";
const catalog: Readonly<Record<string, string>> = { ...zh, ...messages };
export function resolveLocale(saved: string | null, language: string): Locale {
  if (saved === "en" || saved === "zh-CN") return saved;
  return /^zh(?:-|$)/i.test(language) ? "zh-CN" : "en";
}
export function getLocale() {
  return locale;
}
export function initLocale() {
  let saved: string | null = null;
  try {
    saved = localStorage.getItem(LOCALE_KEY);
  } catch {
    /* Storage is optional. */
  }
  locale = resolveLocale(saved, navigator.language);
  document.documentElement.lang = locale;
  return locale;
}
export function setLocale(value: string) {
  if (value !== "en" && value !== "zh-CN") return;
  locale = value;
  document.documentElement.lang = locale;
  try {
    localStorage.setItem(LOCALE_KEY, locale);
  } catch {
    /* Keep the in-memory choice. */
  }
}
// Only canonical app-generated messages enter this function, never filenames or HTML.
export function t(text: string): string {
  if (locale === "en") return text;
  if (Object.hasOwn(catalog, text)) return catalog[text];
  let m: RegExpMatchArray | null;
  if (
    (m = text.match(/^Updating · job (\d+) queued · previous result retained$/))
  )
    return `更新中 · 任务 ${m[1]} 已排队 · 保留上一结果`;
  if ((m = text.match(/^Updating · job (\d+) · preparing analysis$/)))
    return `更新中 · 任务 ${m[1]} · 准备分析`;
  if ((m = text.match(/^Updating · job (\d+) · (.+) · (\d+)%$/)))
    return `更新中 · 任务 ${m[1]} · ${t(m[2])} · ${m[3]}%`;
  if ((m = text.match(/^Ready · job (\d+) · (.+) analyzed px · (.+) ms$/)))
    return `就绪 · 任务 ${m[1]} · ${m[2]} 分析像素 · ${m[3]} ms`;
  if (text.startsWith("Error · ")) return `错误 · ${t(text.slice(8))}`;
  if (
    (m = text.match(
      /^(.+)\. (Display only; does not change analysis\.|Changes numerical analysis\.)$/,
    ))
  )
    return `${t(m[1])}。${t(m[2])}`;
  if ((m = text.match(/^Missing parameter: (.+)$/))) return `缺少参数：${m[1]}`;
  if ((m = text.match(/^Invalid (.+): expected (.+)\.$/)))
    return `无效的 ${m[1]}：要求 ${m[2]}。`;
  if ((m = text.match(/^Invalid (.+)\.$/))) return `无效的 ${m[1]}。`;
  if ((m = text.match(/^No (.+) diagnostic is available\.$/)))
    return `没有可用的 ${t(m[1])} 诊断图。`;
  if (
    (m = text.match(
      /^Downsampled (.+) ROI to (.+)\. Periods use analyzed pixels; multiply by scale X (.+) \/ Y (.+) for original pixels\. Anti-alias averaging can weaken high-frequency structure\.$/,
    ))
  )
    return `ROI 从 ${m[1]} 降采样为 ${m[2]}。周期以分析像素计；乘以 X 比例 ${m[3]} / Y 比例 ${m[4]} 可换算为原图像素。抗混叠平均可能削弱高频结构。`;
  // Structured numerical readouts keep symbols, units and numeric values unchanged.
  if (
    /^(?:x -?\d+ · y |fx -?[\d.]+ · fy |lag X -?\d+|(?:FFT|AC) [XY] (?:lag |f ))/.test(
      text,
    )
  )
    return text
      .replaceAll("original px", "原图像素")
      .replaceAll("analyzed px", "分析像素")
      .replaceAll("relative power", "相对功率")
      .replaceAll("power", "功率")
      .replaceAll("period", "周期")
      .replaceAll("correlation", "相关值")
      .replaceAll("lag", "滞后")
      .replaceAll("value", "数值");
  if (/^\d+ × \d+ analyzed px · FFT /.test(text))
    return text
      .replace("analyzed px", "分析像素")
      .replace("Original scale", "原图比例");
  if (/^(fft-profile|fft-2d|autocorrelation)\nfx /.test(text))
    return text
      .replace(/^[^\n]+/, (s) => t(s))
      .replace("Power", "功率")
      .replace("relative", "相对值")
      .replace("Signal score", "信号分数")
      .replace("(uncalibrated)", "（未经校准）");
  return text;
}
// Capture static nodes once, before dynamic/user content exists. Updating text nodes
// preserves focus, controls, listeners, open details and the source image.
export function bindStaticText(root: HTMLElement) {
  const texts: { node: Text; source: string }[] = [];
  const attrs: { node: Element; name: string; source: string }[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const source = node.textContent ?? "";
    if (source.trim()) texts.push({ node: node as Text, source });
  }
  for (const node of root.querySelectorAll("[title], [aria-label]"))
    for (const name of ["title", "aria-label"])
      if (node.hasAttribute(name))
        attrs.push({ node, name, source: node.getAttribute(name)! });
  return () => {
    for (const { node, source } of texts) {
      if (node.isConnected)
        node.textContent = source.replace(/\S[\s\S]*\S|\S/, (s) => t(s));
    }
    for (const { node, name, source } of attrs)
      node.setAttribute(name, t(source));
    document.title = t("Periodic Stego — Local Image Analysis");
  };
}
