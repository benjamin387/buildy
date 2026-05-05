"use client";

import { useRef, useState, type PointerEvent } from "react";

type Point = { x: number; y: number };

export function SignaturePad(props: { onChange: (dataUrl: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const [hasInk, setHasInk] = useState(false);

  function ctx() {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.strokeStyle = "#0f172a";
    context.lineWidth = 2;
    return context;
  }

  function toPoint(event: PointerEvent<HTMLCanvasElement>): Point {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function begin(event: PointerEvent<HTMLCanvasElement>) {
    const context = ctx();
    if (!context) return;
    const p = toPoint(event);
    drawingRef.current = true;
    context.beginPath();
    context.moveTo(p.x, p.y);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function draw(event: PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    const context = ctx();
    if (!context) return;
    const p = toPoint(event);
    context.lineTo(p.x, p.y);
    context.stroke();
    if (!hasInk) setHasInk(true);
  }

  function end(event: PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    event.currentTarget.releasePointerCapture(event.pointerId);
    const canvas = canvasRef.current;
    if (canvas) {
      props.onChange(canvas.toDataURL("image/png"));
    }
  }

  function clear() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    setHasInk(false);
    props.onChange("");
  }

  return (
    <div className="space-y-3">
      <canvas
        ref={canvasRef}
        width={700}
        height={240}
        onPointerDown={begin}
        onPointerMove={draw}
        onPointerUp={end}
        onPointerLeave={end}
        className="h-52 w-full touch-none rounded-2xl border border-slate-300 bg-white"
      />
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">Draw your signature clearly in the box above.</p>
        <button
          type="button"
          onClick={clear}
          className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-900 hover:bg-slate-50"
        >
          Clear
        </button>
      </div>
    </div>
  );
}
