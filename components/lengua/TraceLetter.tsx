"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";

const CANVAS_HEIGHT = 300;
const INK_WIDTH = 22;
const SAMPLE_STEP = 4;
/** Parte de la letra que hay que cubrir y parte del trazo que debe caer sobre la letra. */
const MIN_COVERAGE = 0.55;
const MIN_PRECISION = 0.7;

type Point = { x: number; y: number };

function canvasWidthFor(target: string) {
  return Math.max(300, Math.min(640, 170 * target.length + 80));
}

function guideFont(target: string, width: number) {
  const size = Math.min(230, (width - 40) / Math.max(1, target.length * 0.62));
  return `700 ${Math.round(size)}px "Comic Sans MS", "Chalkboard SE", "Nunito", system-ui, sans-serif`;
}

/** Píxeles opacos del lienzo, muestreados en una rejilla para que la comprobación sea rápida. */
function sampleMask(canvas: HTMLCanvasElement): boolean[] {
  const context = canvas.getContext("2d");
  if (!context) return [];
  const { data, width, height } = context.getImageData(0, 0, canvas.width, canvas.height);
  const mask: boolean[] = [];
  for (let y = 0; y < height; y += SAMPLE_STEP) for (let x = 0; x < width; x += SAMPLE_STEP) mask.push(data[(y * width + x) * 4 + 3] > 40);
  return mask;
}

function drawGuide(context: CanvasRenderingContext2D, target: string, width: number, style: "guide" | "core" | "wide") {
  context.save();
  context.font = guideFont(target, width);
  context.textAlign = "center";
  context.textBaseline = "middle";
  const x = width / 2;
  const y = CANVAS_HEIGHT / 2 + 10;
  if (style === "guide") {
    context.fillStyle = "#EDE7DC";
    context.fillText(target, x, y);
    context.setLineDash([6, 8]);
    context.lineWidth = 2;
    context.strokeStyle = "#B9A58A";
    context.strokeText(target, x, y);
  } else {
    context.fillStyle = "#000";
    context.fillText(target, x, y);
    if (style === "wide") {
      // Margen de tolerancia alrededor de la letra para no penalizar trazos algo torcidos.
      context.lineWidth = INK_WIDTH * 1.6;
      context.lineJoin = "round";
      context.strokeStyle = "#000";
      context.strokeText(target, x, y);
    }
  }
  context.restore();
}

export default function TraceLetter({ target, onResult }: { target: string; onResult: (ok: boolean) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokesRef = useRef<Point[][]>([]);
  const drawingRef = useRef(false);
  const [feedback, setFeedback] = useState<"" | "ok" | "fail" | "empty">("");
  const width = canvasWidthFor(target);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    // Pauta de escritura: línea base y línea media, como en un cuaderno.
    context.strokeStyle = "#E7E3DC";
    context.lineWidth = 2;
    [CANVAS_HEIGHT * 0.3, CANVAS_HEIGHT * 0.5, CANVAS_HEIGHT * 0.78].forEach((lineY) => {
      context.beginPath();
      context.moveTo(16, lineY);
      context.lineTo(canvas.width - 16, lineY);
      context.stroke();
    });
    drawGuide(context, target, canvas.width, "guide");
    context.strokeStyle = "#8A9870";
    context.lineWidth = INK_WIDTH;
    context.lineCap = "round";
    context.lineJoin = "round";
    strokesRef.current.forEach((stroke) => {
      context.beginPath();
      stroke.forEach((point, index) => (index ? context.lineTo(point.x, point.y) : context.moveTo(point.x, point.y)));
      if (stroke.length === 1) context.lineTo(stroke[0].x + 0.1, stroke[0].y);
      context.stroke();
    });
  }, [target]);

  useEffect(() => {
    strokesRef.current = [];
    redraw();
  }, [redraw]);

  const toCanvasPoint = (event: React.PointerEvent<HTMLCanvasElement>): Point => {
    const canvas = event.currentTarget;
    const rect = canvas.getBoundingClientRect();
    return { x: ((event.clientX - rect.left) * canvas.width) / rect.width, y: ((event.clientY - rect.top) * canvas.height) / rect.height };
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drawingRef.current = true;
    strokesRef.current.push([toCanvasPoint(event)]);
    setFeedback("");
    redraw();
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    strokesRef.current[strokesRef.current.length - 1]?.push(toCanvasPoint(event));
    redraw();
  };

  const handlePointerUp = () => {
    drawingRef.current = false;
  };

  const clear = () => {
    strokesRef.current = [];
    setFeedback("");
    redraw();
  };

  const check = () => {
    if (!strokesRef.current.length) { setFeedback("empty"); return; }
    const make = () => Object.assign(document.createElement("canvas"), { width, height: CANVAS_HEIGHT });
    const core = make();
    const wide = make();
    const ink = make();
    const coreContext = core.getContext("2d");
    const wideContext = wide.getContext("2d");
    const inkContext = ink.getContext("2d");
    if (!coreContext || !wideContext || !inkContext) return;
    drawGuide(coreContext, target, width, "core");
    drawGuide(wideContext, target, width, "wide");
    inkContext.lineWidth = INK_WIDTH;
    inkContext.lineCap = "round";
    inkContext.lineJoin = "round";
    strokesRef.current.forEach((stroke) => {
      inkContext.beginPath();
      stroke.forEach((point, index) => (index ? inkContext.lineTo(point.x, point.y) : inkContext.moveTo(point.x, point.y)));
      if (stroke.length === 1) inkContext.lineTo(stroke[0].x + 0.1, stroke[0].y);
      inkContext.stroke();
    });
    const coreMask = sampleMask(core);
    const wideMask = sampleMask(wide);
    const inkMask = sampleMask(ink);
    let corePixels = 0, coveredPixels = 0, inkPixels = 0, insidePixels = 0;
    coreMask.forEach((isLetter, index) => {
      if (isLetter) { corePixels++; if (inkMask[index]) coveredPixels++; }
      if (inkMask[index]) { inkPixels++; if (wideMask[index]) insidePixels++; }
    });
    const coverage = corePixels ? coveredPixels / corePixels : 0;
    const precision = inkPixels ? insidePixels / inkPixels : 0;
    const ok = coverage >= MIN_COVERAGE && precision >= MIN_PRECISION;
    setFeedback(ok ? "ok" : "fail");
    onResult(ok);
  };

  return (
    <div className="space-y-3">
      <canvas
        ref={canvasRef}
        width={width}
        height={CANVAS_HEIGHT}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        aria-label={`Zona para trazar ${target} con el dedo`}
        className="w-full max-w-xl mx-auto block rounded-3xl border-2 border-dashed border-[#D9CFBF] bg-white touch-none cursor-crosshair"
      />
      <div className="flex flex-wrap items-center justify-center gap-2">
        <button type="button" onClick={clear} className="px-4 py-2.5 rounded-xl border border-[#E7E3DC] bg-white text-sm font-semibold text-[#555149] hover:bg-[#FAF8F5]">Borrar</button>
        <button type="button" onClick={check} className="px-5 py-2.5 rounded-xl bg-[#242321] text-white text-sm font-semibold hover:bg-[#3A3835]">¡Ya está!</button>
      </div>
      {feedback === "ok" && <p className="text-center text-base font-semibold text-[#5E7A3A]">¡Muy bien trazado!</p>}
      {feedback === "fail" && <p className="text-center text-base font-semibold text-[#9A5B3C]">Casi… intenta seguir mejor la letra. Pulsa «Borrar» y prueba otra vez.</p>}
      {feedback === "empty" && <p className="text-center text-sm text-[#77736B]">Primero repasa la letra con el dedo.</p>}
    </div>
  );
}
