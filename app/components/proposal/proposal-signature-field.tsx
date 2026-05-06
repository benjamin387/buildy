"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";

type SignatureMode = "draw" | "type";
type Point = { x: number; y: number };

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function svgSignatureDataUrl(name: string): string {
  const safeName = escapeXml(name.trim());
  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" width="900" height="280" viewBox="0 0 900 280">',
    '<rect width="900" height="280" rx="28" fill="#ffffff" />',
    '<path d="M90 210 H810" stroke="#d6d3d1" stroke-width="3" stroke-linecap="round" />',
    `<text x="450" y="160" text-anchor="middle" font-family="'Brush Script MT','Segoe Script','Snell Roundhand',cursive" font-size="88" fill="#0f172a">${safeName}</text>`,
    "</svg>",
  ].join("");

  const bytes = new TextEncoder().encode(svg);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `data:image/svg+xml;base64,${window.btoa(binary)}`;
}

export function ProposalSignatureField(props: {
  typedName: string;
  onTypedNameChange: (value: string) => void;
  onChange: (dataUrl: string) => void;
  disabled?: boolean;
}) {
  const [mode, setMode] = useState<SignatureMode>("draw");
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const [hasInk, setHasInk] = useState(false);

  useEffect(() => {
    if (mode !== "type") return;
    const text = props.typedName.trim();
    props.onChange(text ? svgSignatureDataUrl(text) : "");
  }, [mode, props.onChange, props.typedName]);

  function context() {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 2.4;
    return ctx;
  }

  function toPoint(event: PointerEvent<HTMLCanvasElement>): Point {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function begin(event: PointerEvent<HTMLCanvasElement>) {
    if (props.disabled || mode !== "draw") return;
    const ctx = context();
    if (!ctx) return;
    const point = toPoint(event);
    drawingRef.current = true;
    ctx.beginPath();
    ctx.moveTo(point.x, point.y);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function draw(event: PointerEvent<HTMLCanvasElement>) {
    if (props.disabled || mode !== "draw" || !drawingRef.current) return;
    const ctx = context();
    if (!ctx) return;
    const point = toPoint(event);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
    if (!hasInk) setHasInk(true);
  }

  function end(event: PointerEvent<HTMLCanvasElement>) {
    if (props.disabled || mode !== "draw" || !drawingRef.current) return;
    drawingRef.current = false;
    event.currentTarget.releasePointerCapture(event.pointerId);
    const canvas = canvasRef.current;
    if (canvas) props.onChange(canvas.toDataURL("image/png"));
  }

  function clearDrawing() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasInk(false);
    props.onChange("");
  }

  function switchMode(nextMode: SignatureMode) {
    setMode(nextMode);
    if (nextMode === "draw") {
      props.onChange("");
      return;
    }

    const text = props.typedName.trim();
    props.onChange(text ? svgSignatureDataUrl(text) : "");
  }

  return (
    <div className="space-y-4">
      <div className="inline-flex rounded-full border border-slate-200 bg-white p-1 shadow-sm">
        <button
          type="button"
          disabled={props.disabled}
          onClick={() => switchMode("draw")}
          className={`inline-flex h-10 items-center justify-center rounded-full px-4 text-sm font-semibold transition ${
            mode === "draw" ? "bg-neutral-950 text-white" : "text-neutral-700 hover:bg-stone-50"
          } disabled:cursor-not-allowed disabled:opacity-60`}
        >
          Draw signature
        </button>
        <button
          type="button"
          disabled={props.disabled}
          onClick={() => switchMode("type")}
          className={`inline-flex h-10 items-center justify-center rounded-full px-4 text-sm font-semibold transition ${
            mode === "type" ? "bg-neutral-950 text-white" : "text-neutral-700 hover:bg-stone-50"
          } disabled:cursor-not-allowed disabled:opacity-60`}
        >
          Type signature
        </button>
      </div>

      {mode === "draw" ? (
        <div className="space-y-3">
          <canvas
            ref={canvasRef}
            width={900}
            height={280}
            onPointerDown={begin}
            onPointerMove={draw}
            onPointerUp={end}
            onPointerLeave={end}
            className="h-56 w-full touch-none rounded-[24px] border border-slate-300 bg-white"
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-neutral-500">Draw your signature clearly in the box above.</p>
            <button
              type="button"
              disabled={props.disabled}
              onClick={clearDrawing}
              className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-neutral-900 transition hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {hasInk ? "Clear" : "Reset"}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <label className="grid gap-2 text-sm">
            <span className="font-medium text-neutral-800">Typed signature</span>
            <input
              value={props.typedName}
              disabled={props.disabled}
              onChange={(event) => props.onTypedNameChange(event.target.value)}
              className="h-12 rounded-2xl border border-slate-300 bg-white px-4 text-neutral-950 outline-none ring-slate-400 transition focus:ring-2 disabled:cursor-not-allowed disabled:opacity-60"
              placeholder="Type your full legal name"
            />
          </label>
          <div className="rounded-[24px] border border-slate-300 bg-white px-6 py-8">
            <div className="border-b border-dashed border-stone-300 pb-3">
              <p
                className="min-h-24 text-center text-5xl text-neutral-950"
                style={{ fontFamily: "'Brush Script MT','Segoe Script','Snell Roundhand',cursive" }}
              >
                {props.typedName.trim() || "Your Signature"}
              </p>
            </div>
            <p className="mt-3 text-xs text-neutral-500">Typed signatures are stored as image evidence together with timestamp, IP address, and browser details.</p>
          </div>
        </div>
      )}
    </div>
  );
}
