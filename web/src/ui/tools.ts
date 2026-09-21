import { extractBytes, type ExtractionOptions } from "../extraction";
import { decodeRawPNG } from "../raw-png";
import { bitplane, extractPixelBits } from "../bitplanes";
import { downloadBlob, downloadPNG } from "../export";
import { bindStaticText, t } from "../i18n";

export function mountTools(root: HTMLElement) {
  root.innerHTML = `<div class="section-title"><span>EXTRACTION TOOLS</span><button id="tools-close" type="button">Close</button></div>
  <p class="hint">Work on original file bytes. Choose a method and parameters; no automatic payload guessing.</p>
  <label>Operation <select id="tool-operation"><option value="trailer">Container / sentinel extraction</option><option value="bitplane">Raw PNG bitplane</option><option value="pixel-bits">Raw PNG bitstream</option></select></label>
  <div id="byte-controls" class="tool-controls">
  <label>Byte source <select id="byte-source"><option value="png-trailer">After PNG IEND</option><option value="gif-trailer">After GIF trailer</option><option value="bmp-sentinels">BMP zero-pair sentinels</option></select></label>
  <label id="encoding-control">Decode as <select id="byte-encoding"><option value="raw">Raw bytes</option><option value="ascii-bits">ASCII bits</option><option value="base64">Base64</option></select></label>
  <div id="symbol-controls"><label>Zero symbol (decimal) <input id="symbol-zero" type="number" min="0" max="255" value="22"></label><label>One symbol (decimal) <input id="symbol-one" type="number" min="0" max="255" value="23"></label></div>
  <div id="insert-controls"><label>Insert bit at (-1 disables) <input id="insert-at" type="number" min="-1" value="-1"></label><label>Inserted bit <select id="insert-bit"><option value="0">0</option><option value="1">1</option></select></label></div>
  </div>
  <div id="pixel-controls" class="tool-controls" hidden><p class="hint">Native 8-bit non-interlaced PNG only. No Canvas fallback; hidden RGB is preserved.</p><label id="plane-channel-control">Plane channel <select id="plane-channel"><option value="r">R</option><option value="g">G</option><option value="b">B</option><option value="a">Alpha</option></select></label>
  <label>Bit index (0 = LSB) <input id="pixel-bit" type="number" min="0" max="7" value="0"></label>
  <div id="stream-controls"><label>Channel order <input id="pixel-channels" value="rgb" maxlength="4"></label><label>Pixel traversal <select id="pixel-order"><option value="row">Row-major</option><option value="column">Column-major</option></select></label><label>Bit offset <input id="pixel-offset" type="number" min="0" value="0"></label><label>Output bytes <input id="pixel-length" type="number" min="1" max="1048576" value="1"></label></div></div>
  <label id="packing-control">Byte bit order <select id="bit-order"><option value="msb">MSB first</option><option value="lsb">LSB first</option></select></label>
  <div class="tool-actions"><button id="tool-run" type="button" disabled>Run tool</button><button id="tool-export" type="button" disabled>Download result</button></div><p id="tool-status" role="status"></p><canvas id="tool-canvas" hidden aria-label="Raw bitplane"></canvas><pre id="tool-preview"></pre>`;
  const $ = <T extends HTMLElement = HTMLElement>(s: string) =>
    root.querySelector<T>(s)!;
  const val = (s: string) => $<HTMLInputElement>(s).value;
  const num = (s: string) => {
    const value = val(s);
    if (!value.trim() || !Number.isSafeInteger(Number(value)))
      throw new Error("Expected an integer parameter.");
    return Number(value);
  };
  const localizeStatic = bindStaticText(root);
  let source: Uint8Array | null = null;
  let generation = 0;
  let raw: Awaited<ReturnType<typeof decodeRawPNG>> | null = null;
  let output: { bytes: Uint8Array; filename: string } | null = null;
  let plane: HTMLCanvasElement | null = null;
  let status = "Load a local image before extracting.";
  let detail = "";
  const render = () => {
    $("#tool-status").textContent = t(status) + (detail ? ` · ${detail}` : "");
  };
  const invalidate = () => {
    generation++;
    output = null;
    plane = null;
    $<HTMLButtonElement>("#tool-export").disabled = true;
    const c = $<HTMLCanvasElement>("#tool-canvas");
    c.hidden = true;
    c.width = c.height = 1;
    $("#tool-preview").textContent = "";
    $<HTMLButtonElement>("#tool-run").disabled = !source;
    root.setAttribute("aria-busy", "false");
    status = source
      ? "Ready to extract."
      : "Load a local image before extracting.";
    detail = "";
    render();
  };
  function controls() {
    const operation = val("#tool-operation"),
      bmp = val("#byte-source") === "bmp-sentinels";
    $("#byte-controls").hidden = operation !== "trailer";
    $("#pixel-controls").hidden = operation === "trailer";
    $("#encoding-control").hidden = bmp;
    $("#symbol-controls").hidden = !bmp;
    $("#insert-controls").hidden =
      !bmp && val("#byte-encoding") !== "ascii-bits";
    $("#stream-controls").hidden = operation !== "pixel-bits";
    $("#plane-channel-control").hidden = operation !== "bitplane";
    $("#packing-control").hidden =
      operation === "bitplane" ||
      (operation === "trailer" &&
        !bmp &&
        val("#byte-encoding") !== "ascii-bits");
  }
  root.addEventListener("input", () => {
    invalidate();
    controls();
  });
  root.addEventListener("change", () => {
    invalidate();
    controls();
  });
  $("#tools-close").onclick = () => {
    root.hidden = true;
    document.querySelector<HTMLButtonElement>("#tools-button")?.focus();
  };
  $("#tool-run").onclick = async () => {
    if (!source) return;
    invalidate();
    const input = source;
    const token = generation;
    const current = () => token === generation && source === input;
    status = "Extracting…";
    render();
    root.setAttribute("aria-busy", "true");
    $<HTMLButtonElement>("#tool-run").disabled = true;
    try {
      await new Promise((r) => setTimeout(r, 0));
      if (!current()) return;
      const operation = val("#tool-operation");
      if (operation === "trailer") {
        const opts: ExtractionOptions = {
          source: val("#byte-source") as ExtractionOptions["source"],
          encoding: val("#byte-encoding") as ExtractionOptions["encoding"],
          bitOrder: val("#bit-order") as "msb" | "lsb",
        };
        if (opts.source === "bmp-sentinels") {
          opts.zero = num("#symbol-zero");
          opts.one = num("#symbol-one");
        }
        if (opts.source === "bmp-sentinels" || opts.encoding === "ascii-bits") {
          opts.insertAt = num("#insert-at");
          opts.insertBit = num("#insert-bit") as 0 | 1;
        }
        output = extractBytes(input, opts);
      } else {
        const pixels = raw ?? (await decodeRawPNG(input, current));
        if (!current()) return;
        raw = pixels;
        if (operation === "bitplane") {
          const gray = bitplane(
            pixels.rgba,
            pixels.width,
            pixels.height,
            val("#plane-channel") as "r" | "g" | "b" | "a",
            num("#pixel-bit"),
          );
          plane = $<HTMLCanvasElement>("#tool-canvas");
          plane.width = pixels.width;
          plane.height = pixels.height;
          const image = new ImageData(pixels.width, pixels.height);
          for (let i = 0; i < gray.length; i++) {
            image.data[i * 4] =
              image.data[i * 4 + 1] =
              image.data[i * 4 + 2] =
                gray[i];
            image.data[i * 4 + 3] = 255;
          }
          plane.getContext("2d")!.putImageData(image, 0, 0);
          plane.hidden = false;
          detail = `${pixels.width} × ${pixels.height} px`;
        } else
          output = {
            bytes: extractPixelBits(pixels.rgba, pixels.width, pixels.height, {
              channels: val("#pixel-channels"),
              bit: num("#pixel-bit"),
              order: val("#pixel-order") as "row" | "column",
              bitOrder: val("#bit-order") as "msb" | "lsb",
              offset: num("#pixel-offset"),
              length: num("#pixel-length"),
            }),
            filename: "pixel-bits.bin",
          };
      }
      if (!current()) return;
      if (output) {
        detail = `${output.bytes.length} bytes`;
        $("#tool-preview").textContent = new TextDecoder().decode(
          output.bytes.subarray(0, 4096),
        );
      }
      status = plane
        ? "Bitplane ready. Black is 0; white is 1. Export preserves native dimensions."
        : "Extraction ready. Preview is limited to 4096 bytes; download preserves the full result.";
      $<HTMLButtonElement>("#tool-export").disabled = false;
    } catch (error) {
      if (current()) {
        output = null;
        plane = null;
        status = `Error · ${error instanceof Error ? error.message : String(error)}`;
      }
    } finally {
      if (current()) {
        root.setAttribute("aria-busy", "false");
        $<HTMLButtonElement>("#tool-run").disabled = false;
        render();
      }
    }
  };
  $("#tool-export").onclick = () => {
    if (output)
      downloadBlob(
        new Blob([output.bytes.slice()], { type: "application/octet-stream" }),
        output.filename,
      );
    else if (plane)
      void downloadPNG(plane, "raw-bitplane.png").catch((error) => {
        status = `Error · ${error.message}`;
        render();
      });
  };
  controls();
  localizeStatic();
  render();
  return {
    setSource(bytes: Uint8Array | null) {
      source = bytes;
      raw = null;
      invalidate();
    },
    localize() {
      localizeStatic();
      render();
    },
    open() {
      root.hidden = false;
      $("#tool-operation").focus();
    },
  };
}
