import { useEffect, useRef, useCallback, useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import type { Annotation, ArrowAnnotation, TextAnnotation, RegionAnnotation } from '../store/types';
import { ANNOTATION_COLORS } from '../store/types';

let _annId = 1;
function genAnnId() { return `ann_${_annId++}_${Date.now()}`; }

function getAnnotationPosition(ann: Annotation, currentTime: number): { x: number; y: number } {
  const state = useAppStore.getState();
  const akfs = state.annotationKeyframes.filter((k) => k.annotationId === ann.id).sort((a, b) => a.time - b.time);
  if (akfs.length === 0) {
    if (ann.type === 'arrow') return { x: (ann.startX + ann.endX) / 2, y: (ann.startY + ann.endY) / 2 };
    if (ann.type === 'region') return { x: ann.x + ann.width / 2, y: ann.y + ann.height / 2 };
    return { x: ann.x, y: ann.y };
  }

  if (currentTime <= akfs[0].time) return { x: akfs[0].x, y: akfs[0].y };
  if (currentTime >= akfs[akfs.length - 1].time) return { x: akfs[akfs.length - 1].x, y: akfs[akfs.length - 1].y };

  for (let i = 0; i < akfs.length - 1; i++) {
    if (currentTime >= akfs[i].time && currentTime <= akfs[i + 1].time) {
      const span = akfs[i + 1].time - akfs[i].time;
      const t = span > 0 ? (currentTime - akfs[i].time) / span : 0;
      return {
        x: akfs[i].x + (akfs[i + 1].x - akfs[i].x) * t,
        y: akfs[i].y + (akfs[i + 1].y - akfs[i].y) * t,
      };
    }
  }
  return { x: akfs[0].x, y: akfs[0].y };
}

function isAnnotationVisible(ann: Annotation, currentTime: number): boolean {
  if (ann.timeStart === null || ann.timeEnd === null) return true;
  return currentTime >= ann.timeStart && currentTime <= ann.timeEnd;
}

export function AnnotationLayer() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const drawRef = useRef<{
    type: 'arrow' | 'region';
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
  } | null>(null);
  const dragRef = useRef<{ annId: string; offsetX: number; offsetY: number } | null>(null);
  const [textInput, setTextInput] = useState<{ x: number; y: number; visible: boolean; canvasX: number; canvasY: number }>({
    x: 0, y: 0, visible: false, canvasX: 0, canvasY: 0,
  });
  const textInputRef = useRef<HTMLInputElement>(null);

  const annotations = useAppStore((s) => s.annotations);
  const annotationMode = useAppStore((s) => s.annotationMode);
  const selectedAnnotationId = useAppStore((s) => s.selectedAnnotationId);
  const currentTime = useAppStore((s) => s.timelineCurrentTime);
  const addAnnotation = useAppStore((s) => s.addAnnotation);
  const selectAnnotation = useAppStore((s) => s.selectAnnotation);
  const updateAnnotation = useAppStore((s) => s.updateAnnotation);
  const removeAnnotation = useAppStore((s) => s.removeAnnotation);
  const setAnnotationMode = useAppStore((s) => s.setAnnotationMode);

  const screenToCanvas = useCallback((clientX: number, clientY: number): [number, number] => {
    const canvas = canvasRef.current;
    if (!canvas) return [0, 0];
    const rect = canvas.getBoundingClientRect();
    return [clientX - rect.left, clientY - rect.top];
  }, []);

  const drawAnnotations = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const container = containerRef.current;
    if (!container) return;

    const w = container.clientWidth;
    const h = container.clientHeight;
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    ctx.clearRect(0, 0, w, h);

    const visibleAnnotations = annotations.filter((ann) => isAnnotationVisible(ann, currentTime));

    for (const ann of visibleAnnotations) {
      const pos = getAnnotationPosition(ann, currentTime);
      const isSelected = ann.id === selectedAnnotationId;

      if (ann.type === 'arrow') {
        const basePos = getAnnotationPosition(ann, -1);
        const dx = pos.x - basePos.x;
        const dy = pos.y - basePos.y;
        const sx = ann.startX + dx;
        const sy = ann.startY + dy;
        const ex = ann.endX + dx;
        const ey = ann.endY + dy;

        ctx.save();
        ctx.strokeStyle = ann.color;
        ctx.lineWidth = ann.lineWidth;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(ex, ey);
        ctx.stroke();

        const angle = Math.atan2(ey - sy, ex - sx);
        const headLen = 10 + ann.lineWidth * 2;
        ctx.beginPath();
        ctx.moveTo(ex, ey);
        ctx.lineTo(ex - headLen * Math.cos(angle - Math.PI / 6), ey - headLen * Math.sin(angle - Math.PI / 6));
        ctx.moveTo(ex, ey);
        ctx.lineTo(ex - headLen * Math.cos(angle + Math.PI / 6), ey - headLen * Math.sin(angle + Math.PI / 6));
        ctx.stroke();
        ctx.restore();

        if (isSelected) {
          ctx.save();
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 1;
          ctx.setLineDash([4, 4]);
          ctx.strokeRect(Math.min(sx, ex) - 4, Math.min(sy, ey) - 4, Math.abs(ex - sx) + 8, Math.abs(ey - sy) + 8);
          ctx.restore();
        }
      } else if (ann.type === 'text') {
        ctx.save();
        ctx.fillStyle = ann.color;
        ctx.font = `${ann.fontSize}px sans-serif`;
        ctx.textBaseline = 'top';

        const basePos = getAnnotationPosition(ann, -1);
        const dx2 = pos.x - basePos.x;
        const dy2 = pos.y - basePos.y;
        const tx = ann.x + dx2;
        const ty = ann.y + dy2;
        ctx.fillText(ann.text, tx, ty);

        if (isSelected) {
          const metrics = ctx.measureText(ann.text);
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 1;
          ctx.setLineDash([4, 4]);
          ctx.strokeRect(tx - 2, ty - 2, metrics.width + 4, ann.fontSize + 4);
        }
        ctx.restore();
      } else if (ann.type === 'region') {
        const basePos = getAnnotationPosition(ann, -1);
        const dx3 = pos.x - basePos.x;
        const dy3 = pos.y - basePos.y;
        const rx = ann.x + dx3;
        const ry = ann.y + dy3;

        ctx.save();
        ctx.strokeStyle = ann.color;
        ctx.lineWidth = ann.lineWidth;
        ctx.setLineDash([6, 4]);
        ctx.strokeRect(rx, ry, ann.width, ann.height);

        if (ann.label) {
          ctx.setLineDash([]);
          ctx.fillStyle = ann.color;
          ctx.font = '11px sans-serif';
          ctx.textBaseline = 'top';
          ctx.fillText(ann.label, rx + 4, ry + 4);
        }

        if (isSelected) {
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 1;
          ctx.setLineDash([2, 2]);
          ctx.strokeRect(rx - 2, ry - 2, ann.width + 4, ann.height + 4);
        }
        ctx.restore();
      }
    }

    if (drawRef.current) {
      const d = drawRef.current;
      ctx.save();
      ctx.strokeStyle = '#ff6b6b';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      if (d.type === 'arrow') {
        ctx.beginPath();
        ctx.moveTo(d.startX, d.startY);
        ctx.lineTo(d.currentX, d.currentY);
        ctx.stroke();
        const angle = Math.atan2(d.currentY - d.startY, d.currentX - d.startX);
        const headLen = 12;
        ctx.beginPath();
        ctx.moveTo(d.currentX, d.currentY);
        ctx.lineTo(d.currentX - headLen * Math.cos(angle - Math.PI / 6), d.currentY - headLen * Math.sin(angle - Math.PI / 6));
        ctx.moveTo(d.currentX, d.currentY);
        ctx.lineTo(d.currentX - headLen * Math.cos(angle + Math.PI / 6), d.currentY - headLen * Math.sin(angle + Math.PI / 6));
        ctx.stroke();
      } else if (d.type === 'region') {
        const rx = Math.min(d.startX, d.currentX);
        const ry = Math.min(d.startY, d.currentY);
        const rw = Math.abs(d.currentX - d.startX);
        const rh = Math.abs(d.currentY - d.startY);
        ctx.strokeRect(rx, ry, rw, rh);
      }
      ctx.restore();
    }
  }, [annotations, selectedAnnotationId, currentTime]);

  useEffect(() => {
    drawAnnotations();
  }, [drawAnnotations]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(() => drawAnnotations());
    observer.observe(container);
    return () => observer.disconnect();
  }, [drawAnnotations]);

  const findAnnotationAt = useCallback((cx: number, cy: number): Annotation | null => {
    const visible = annotations.filter((ann) => isAnnotationVisible(ann, currentTime));
    for (let i = visible.length - 1; i >= 0; i--) {
      const ann = visible[i];
      const pos = getAnnotationPosition(ann, currentTime);
      const basePos = getAnnotationPosition(ann, -1);
      const dx = pos.x - basePos.x;
      const dy = pos.y - basePos.y;

      if (ann.type === 'arrow') {
        const sx = ann.startX + dx;
        const sy = ann.startY + dy;
        const ex = ann.endX + dx;
        const ey = ann.endY + dy;
        const dist = distToSegment(cx, cy, sx, sy, ex, ey);
        if (dist < 8) return ann;
      } else if (ann.type === 'text') {
        const tx = ann.x + dx;
        const ty = ann.y + dy;
        if (cx >= tx - 4 && cx <= tx + 80 && cy >= ty - 4 && cy <= ty + ann.fontSize + 4) return ann;
      } else if (ann.type === 'region') {
        const rx = ann.x + dx;
        const ry = ann.y + dy;
        if (cx >= rx - 4 && cx <= rx + ann.width + 4 && cy >= ry - 4 && cy <= ry + ann.height + 4) return ann;
      }
    }
    return null;
  }, [annotations, currentTime]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const [cx, cy] = screenToCanvas(e.clientX, e.clientY);

    if (annotationMode === 'arrow') {
      drawRef.current = { type: 'arrow', startX: cx, startY: cy, currentX: cx, currentY: cy };
      return;
    }

    if (annotationMode === 'region') {
      drawRef.current = { type: 'region', startX: cx, startY: cy, currentX: cx, currentY: cy };
      return;
    }

    if (annotationMode === 'select') {
      const hit = findAnnotationAt(cx, cy);
      if (hit) {
        selectAnnotation(hit.id);
        let ox: number, oy: number;
        if (hit.type === 'arrow') {
          const pos = getAnnotationPosition(hit, currentTime, []);
          const basePos = getAnnotationPosition(hit, -1, []);
          const dx = pos.x - basePos.x;
          const dy = pos.y - basePos.y;
          ox = cx - ((hit.startX + hit.endX) / 2 + dx);
          oy = cy - ((hit.startY + hit.endY) / 2 + dy);
        } else if (hit.type === 'region') {
          const pos = getAnnotationPosition(hit, currentTime, []);
          const basePos = getAnnotationPosition(hit, -1, []);
          const dx = pos.x - basePos.x;
          const dy = pos.y - basePos.y;
          ox = cx - (hit.x + hit.width / 2 + dx);
          oy = cy - (hit.y + hit.height / 2 + dy);
        } else {
          const pos = getAnnotationPosition(hit, currentTime, []);
          const basePos = getAnnotationPosition(hit, -1, []);
          const dx = pos.x - basePos.x;
          const dy = pos.y - basePos.y;
          ox = cx - (hit.x + dx);
          oy = cy - (hit.y + dy);
        }
        dragRef.current = { annId: hit.id, offsetX: ox, offsetY: oy };
      } else {
        selectAnnotation(null);
      }
    }
  }, [annotationMode, screenToCanvas, findAnnotationAt, selectAnnotation, currentTime]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const [cx, cy] = screenToCanvas(e.clientX, e.clientY);

    if (drawRef.current) {
      drawRef.current.currentX = cx;
      drawRef.current.currentY = cy;
      drawAnnotations();
      return;
    }

    if (dragRef.current) {
      const ann = annotations.find((a) => a.id === dragRef.current!.annId);
      if (!ann) return;
      const newX = cx - dragRef.current.offsetX;
      const newY = cy - dragRef.current.offsetY;

      if (ann.type === 'arrow') {
        const midX = (ann.startX + ann.endX) / 2;
        const midY = (ann.startY + ann.endY) / 2;
        const dx = newX - midX;
        const dy = newY - midY;
        updateAnnotation(ann.id, { startX: ann.startX + dx, startY: ann.startY + dy, endX: ann.endX + dx, endY: ann.endY + dy } as Partial<ArrowAnnotation>);
      } else if (ann.type === 'text') {
        updateAnnotation(ann.id, { x: newX, y: newY } as Partial<TextAnnotation>);
      } else if (ann.type === 'region') {
        updateAnnotation(ann.id, { x: newX - ann.width / 2, y: newY - ann.height / 2 } as Partial<RegionAnnotation>);
      }
    }
  }, [screenToCanvas, drawAnnotations, annotations, updateAnnotation]);

  const handleMouseUp = useCallback(() => {
    if (drawRef.current) {
      const d = drawRef.current;
      if (d.type === 'arrow') {
        const dist = Math.sqrt((d.currentX - d.startX) ** 2 + (d.currentY - d.startY) ** 2);
        if (dist > 5) {
          const ann: ArrowAnnotation = {
            id: genAnnId(),
            type: 'arrow',
            startX: d.startX,
            startY: d.startY,
            endX: d.currentX,
            endY: d.currentY,
            color: ANNOTATION_COLORS[0],
            lineWidth: 2,
            timeStart: null,
            timeEnd: null,
          };
          addAnnotation(ann);
          selectAnnotation(ann.id);
        }
      } else if (d.type === 'region') {
        const rw = Math.abs(d.currentX - d.startX);
        const rh = Math.abs(d.currentY - d.startY);
        if (rw > 5 && rh > 5) {
          const ann: RegionAnnotation = {
            id: genAnnId(),
            type: 'region',
            x: Math.min(d.startX, d.currentX),
            y: Math.min(d.startY, d.currentY),
            width: rw,
            height: rh,
            color: ANNOTATION_COLORS[0],
            lineWidth: 2,
            label: '',
            timeStart: null,
            timeEnd: null,
          };
          addAnnotation(ann);
          selectAnnotation(ann.id);
        }
      }
      drawRef.current = null;
      drawAnnotations();
      setAnnotationMode('select');
    }
    dragRef.current = null;
  }, [addAnnotation, selectAnnotation, setAnnotationMode, drawAnnotations]);

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    const [cx, cy] = screenToCanvas(e.clientX, e.clientY);
    const rect = canvasRef.current?.getBoundingClientRect();
    setTextInput({
      x: e.clientX - (rect?.left ?? 0),
      y: e.clientY - (rect?.top ?? 0),
      visible: true,
      canvasX: cx,
      canvasY: cy,
    });
    setTimeout(() => textInputRef.current?.focus(), 50);
  }, [screenToCanvas]);

  const handleTextSubmit = useCallback(() => {
    if (textInput.visible && textInputRef.current?.value.trim()) {
      const ann: TextAnnotation = {
        id: genAnnId(),
        type: 'text',
        x: textInput.canvasX,
        y: textInput.canvasY,
        text: textInputRef.current.value.trim(),
        fontSize: 16,
        color: ANNOTATION_COLORS[0],
        timeStart: null,
        timeEnd: null,
      };
      addAnnotation(ann);
      selectAnnotation(ann.id);
      setAnnotationMode('select');
    }
    setTextInput((p) => ({ ...p, visible: false }));
    textInputRef.current = null;
  }, [textInput, addAnnotation, selectAnnotation, setAnnotationMode]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedAnnotationId && !textInput.visible) {
          const activeEl = document.activeElement;
          if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) return;
          removeAnnotation(selectedAnnotationId);
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedAnnotationId, removeAnnotation, textInput.visible]);

  const getCursor = () => {
    if (annotationMode === 'arrow' || annotationMode === 'region') return 'crosshair';
    if (annotationMode === 'select') return 'default';
    return 'default';
  };

  return (
    <div
      ref={containerRef}
      style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: annotationMode ? 'auto' : 'none' }}
    >
      <canvas
        ref={canvasRef}
        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', cursor: getCursor(), pointerEvents: annotationMode ? 'auto' : 'none' }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onDoubleClick={handleDoubleClick}
      />
      {textInput.visible && (
        <input
          ref={textInputRef}
          style={{
            position: 'absolute',
            left: textInput.x,
            top: textInput.y,
            background: 'rgba(0,0,0,0.8)',
            border: '1px solid #4d96ff',
            color: '#fff',
            fontSize: 16,
            padding: '2px 6px',
            borderRadius: 3,
            outline: 'none',
            minWidth: 100,
            zIndex: 10,
          }}
          placeholder="输入标注文字..."
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleTextSubmit();
            if (e.key === 'Escape') setTextInput((p) => ({ ...p, visible: false }));
          }}
          onBlur={handleTextSubmit}
        />
      )}
    </div>
  );
}

function distToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.sqrt((px - x1) ** 2 + (py - y1) ** 2);
  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const nearX = x1 + t * dx;
  const nearY = y1 + t * dy;
  return Math.sqrt((px - nearX) ** 2 + (py - nearY) ** 2);
}
