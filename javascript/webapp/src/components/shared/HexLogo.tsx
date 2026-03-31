import { useEffect, useRef } from "react";

const CLR = "#181714";
const LW = 2.8;
const R = 74;
const S = 220;
const CX = S / 2;
const CY = S / 2;

function cornerOffset(i: number): [number, number] {
  const a = (Math.PI / 3) * i - Math.PI / 2;
  return [Math.cos(a) * R, Math.sin(a) * R];
}

const HEX_OFF = Array.from({ length: 6 }, (_, i) => cornerOffset(i));
const INNER = [0, 2, 4];
const K = (4 / 3) * Math.tan(Math.PI / 12);

function cubicCPs(i: number) {
  const a0 = (Math.PI / 3) * i - Math.PI / 2;
  const a1 = (Math.PI / 3) * (i + 1) - Math.PI / 2;
  return {
    cp0: [
      Math.cos(a0) * R + -Math.sin(a0) * K * R,
      Math.sin(a0) * R + Math.cos(a0) * K * R,
    ] as [number, number],
    cp1: [
      Math.cos(a1) * R + Math.sin(a1) * K * R,
      Math.sin(a1) * R + -Math.cos(a1) * K * R,
    ] as [number, number],
  };
}

const CP_OFF = Array.from({ length: 6 }, (_, i) => cubicCPs(i));

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

const eio = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

interface State {
  edgeM: number;
  innerT: number;
  angle: number;
}

const TOTAL = 6200;

function getState(ms: number): State {
  if (ms < 600) return { edgeM: 0, innerT: 0, angle: 0 };
  if (ms < 1200) return { edgeM: 0, innerT: eio((ms - 600) / 600), angle: 0 };
  if (ms < 1900) return { edgeM: 0, innerT: 1, angle: 0 };
  if (ms < 3300)
    return { edgeM: 0, innerT: 1, angle: eio((ms - 1900) / 1400) * Math.PI };
  if (ms < 3600) return { edgeM: 0, innerT: 1, angle: Math.PI };
  if (ms < 4300) {
    const p = eio((ms - 3600) / 700);
    return { edgeM: p, innerT: 1 - p, angle: lerp(Math.PI, 0, p) };
  }
  if (ms < 5000) return { edgeM: 1, innerT: 0, angle: 0 };
  if (ms < 5700)
    return { edgeM: 1 - eio((ms - 5000) / 700), innerT: 0, angle: 0 };
  return { edgeM: 0, innerT: 0, angle: 0 };
}

function drawScene(
  ctx: CanvasRenderingContext2D,
  edgeM: number,
  innerT: number,
  spinX: number,
) {
  ctx.clearRect(0, 0, S, S);
  ctx.strokeStyle = CLR;
  ctx.lineWidth = LW;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.globalAlpha = 1;

  const proj = ([ox, oy]: [number, number]): [number, number] => [
    CX + ox * spinX,
    CY + oy,
  ];
  const pts = HEX_OFF.map(proj);

  for (let i = 0; i < 6; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % 6];
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    if (edgeM < 0.001) {
      ctx.lineTo(b[0], b[1]);
    } else {
      const { cp0, cp1 } = CP_OFF[i];
      const a0 = (Math.PI / 3) * i - Math.PI / 2;
      const a1 = (Math.PI / 3) * (i + 1) - Math.PI / 2;
      ctx.bezierCurveTo(
        CX + lerp(Math.cos(a0) * R, cp0[0], edgeM) * spinX,
        CY + lerp(Math.sin(a0) * R, cp0[1], edgeM),
        CX + lerp(Math.cos(a1) * R, cp1[0], edgeM) * spinX,
        CY + lerp(Math.sin(a1) * R, cp1[1], edgeM),
        b[0],
        b[1],
      );
    }
    ctx.stroke();
  }

  if (innerT > 0.001) {
    for (let k = 0; k < 3; k++) {
      const tgt = pts[INNER[k]];
      const lt = Math.max(0, Math.min(1, (innerT - k * 0.05) / (1 - k * 0.05)));
      ctx.beginPath();
      ctx.moveTo(CX, CY);
      ctx.lineTo(CX + (tgt[0] - CX) * lt, CY + (tgt[1] - CY) * lt);
      ctx.stroke();
    }
  }
}

interface HexLogoProps {
  size?: number;
  className?: string;
}

export function HexLogo({ size = 32, className }: HexLogoProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const scale = size / S;
    canvas.width = size;
    canvas.height = size;
    ctx.scale(scale, scale);

    let t0: number | null = null;

    function frame(now: number) {
      if (!t0) t0 = now;
      const ms = Math.min(now - t0, TOTAL);
      const { edgeM, innerT, angle } = getState(ms);

      ctx!.setTransform(scale, 0, 0, scale, 0, 0);
      drawScene(ctx!, edgeM, innerT, Math.cos(angle));

      if (ms < TOTAL) {
        rafRef.current = requestAnimationFrame(frame);
      } else {
        setTimeout(() => {
          t0 = null;
          rafRef.current = requestAnimationFrame(frame);
        }, 800);
      }
    }

    drawScene(ctx, 0, 0, 1);
    rafRef.current = requestAnimationFrame(frame);

    return () => cancelAnimationFrame(rafRef.current);
  }, [size]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ width: size, height: size }}
    />
  );
}
