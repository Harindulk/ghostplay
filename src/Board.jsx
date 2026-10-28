import { useEffect, useRef, useState } from 'react';
import { drawBoard, ghostOffset } from './draw.js';

// Fits the level into its box, redraws on every change, and reports clicks as cells
// (the level editor paints with them).
export default function Board({ lv, turn, ghosts, heat, heatKind, highlight, showSpikes, onCell, label, canvasRef, maxHeight = 520 }) {
  const wrap = useRef(null);
  const own = useRef(null);
  const ref = canvasRef || own;
  const [cell, setCell] = useState(40);
  const painting = useRef(false);

  useEffect(() => {
    const el = wrap.current;
    const fit = () => setCell(Math.max(12, Math.floor(Math.min(el.clientWidth / lv.w, maxHeight / lv.h))));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [lv.w, lv.h, maxHeight]);

  useEffect(() => {
    const c = ref.current;
    const dpr = window.devicePixelRatio || 1;
    c.width = lv.w * cell * dpr; c.height = lv.h * cell * dpr;
    c.style.width = `${lv.w * cell}px`; c.style.height = `${lv.h * cell}px`;
    const ctx = c.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const placed = (ghosts || []).map((g, i) => ({ ...g, off: ghostOffset(i, cell) }));
    drawBoard(ctx, { lv, cell, turn, ghosts: placed, heat, heatKind, highlight, showSpikes });
  });

  const cellAt = (e) => {
    const r = ref.current.getBoundingClientRect();
    return [Math.floor((e.clientX - r.left) / cell), Math.floor((e.clientY - r.top) / cell)];
  };
  const pointer = onCell ? {
    onPointerDown: (e) => { painting.current = true; e.currentTarget.setPointerCapture(e.pointerId); onCell(...cellAt(e)); },
    onPointerMove: (e) => { if (painting.current) onCell(...cellAt(e)); },
    onPointerUp: () => { painting.current = false; },
  } : {};

  return (
    <div className="board-wrap" ref={wrap}>
      <canvas ref={ref} role="img" aria-label={label} className={onCell ? 'paintable' : ''} {...pointer} />
    </div>
  );
}
