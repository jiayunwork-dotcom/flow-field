import { useEffect, useRef, useCallback } from 'react';
import { useAppStore } from '../store/useAppStore';
import { FlowFieldRenderer } from '../gl/FlowFieldRenderer';
import type { FieldElement } from '../store/types';

let nextId = 1;
function genId() { return `el_${nextId++}_${Date.now()}`; }

const ELEMENT_DEFAULTS: Record<FieldElement['type'], { strength: number; angle?: number; rate?: number; spreadAngle?: number; initialSpeed?: number }> = {
  source: { strength: 0.5 },
  sink: { strength: 0.5 },
  vortex: { strength: 0.5 },
  uniform: { strength: 0.3, angle: 0 },
  emitter: { strength: 0, rate: 100, spreadAngle: 30, initialSpeed: 1.0, angle: 0 },
};

export function Canvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<FlowFieldRenderer | null>(null);
  const animRef = useRef<number>(0);
  const fpsRef = useRef({ frames: 0, lastTime: performance.now(), fps: 0 });
  const fpsDisplayRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ id: string; offsetX: number; offsetY: number } | null>(null);
  const probeDragRef = useRef(false);
  const splitDragRef = useRef(false);
  const stateRef = useRef(useAppStore.getState());

  useEffect(() => {
    const unsub = useAppStore.subscribe((state) => {
      stateRef.current = state;
    });
    return unsub;
  }, []);

  const addElement = useAppStore((s) => s.addElement);
  const updateElement = useAppStore((s) => s.updateElement);
  const removeElement = useAppStore((s) => s.removeElement);
  const selectElement = useAppStore((s) => s.selectElement);
  const setProbePoint = useAppStore((s) => s.setProbePoint);
  const setCompareSplit = useAppStore((s) => s.setCompareSplit);
  const setPerfStats = useAppStore((s) => s.setPerfStats);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || rendererRef.current) return;

    try {
      const renderer = new FlowFieldRenderer(canvas);
      rendererRef.current = renderer;
      const container = containerRef.current;
      if (container) {
        const size = Math.min(container.clientWidth, container.clientHeight, 1024);
        renderer.resize(size, size);
      }
    } catch (e) {
      console.error('Failed to initialize renderer:', e);
    }

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
      rendererRef.current?.destroy();
      rendererRef.current = null;
    };
  }, []);

  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;

    let running = true;
    const render = () => {
      if (!running) return;
      const s = stateRef.current;

      renderer.render({
        elements: s.fieldElements,
        presetFields: s.presetFields,
        customFields: s.customFields,
        globalParams: s.globalParams,
        showArrows: s.visualizationModes.arrows,
        showParticles: s.visualizationModes.particles,
        showStreamlines: s.visualizationModes.streamlines,
        showLIC: s.visualizationModes.lic,
        showVorticity: s.visualizationModes.vorticity,
        showHeatmap: s.visualizationModes.heatmap,
        heatmapOpacity: s.heatmapOpacity,
        operationMode: s.operationMode,
        colorRange: s.colorRange,
        operationRange: s.operationRange,
        licDirty: s.licDirty,
        licStepSize: s.licStepSize,
        licKernelLength: s.licKernelLength,
        arrowSpacing: s.arrowSpacing,
        importedField: s.importedField,
        probePoint: s.probePoint,
        probeMode: s.probeMode,
        compareMode: s.compareMode,
        compareSplit: s.compareSplit,
      });

      if (s.licDirty) useAppStore.getState().clearLicDirty();

      if (!s.colorRange.locked) {
        try {
          const range = renderer.computeFieldRange();
          if (isFinite(range.min) && isFinite(range.max)) {
            useAppStore.getState().setColorRange({ min: range.min, max: range.max });
          }
        } catch {}
      }

      if (s.probeMode && s.probePoint) {
        try {
          const info = renderer.getProbeVelocity(s.probePoint);
          useAppStore.getState().setProbeInfo(info);
        } catch {}
      }

      try {
        const [tw, th] = renderer.getParticleTexSize();
        const canvas = renderer.getCanvas();
        setPerfStats({
          activeParticles: tw * th,
          drawCalls: renderer.getDrawCallCount(),
          fieldTextureRes: [canvas.width, canvas.height] as [number, number],
          particleTexSize: [tw, th] as [number, number],
        });
      } catch {}

      const now = performance.now();
      fpsRef.current.frames++;
      if (now - fpsRef.current.lastTime >= 1000) {
        fpsRef.current.fps = fpsRef.current.frames;
        fpsRef.current.frames = 0;
        fpsRef.current.lastTime = now;
        if (fpsDisplayRef.current) {
          fpsDisplayRef.current.textContent = `${fpsRef.current.fps} FPS`;
        }
      }

      animRef.current = requestAnimationFrame(render);
    };

    animRef.current = requestAnimationFrame(render);
    return () => {
      running = false;
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, []);

  const screenToNorm = useCallback((clientX: number, clientY: number): [number, number] => {
    const canvas = canvasRef.current;
    if (!canvas) return [0, 0];
    const rect = canvas.getBoundingClientRect();
    const nx = ((clientX - rect.left) / rect.width) * 2 - 1;
    const ny = -(((clientY - rect.top) / rect.height) * 2 - 1);
    return [nx, ny];
  }, []);

  const findElementAt = useCallback((nx: number, ny: number): FieldElement | null => {
    const els = useAppStore.getState().fieldElements;
    let closest: FieldElement | null = null;
    let minDist = 0.08;
    for (const el of els) {
      const dx = el.x - nx;
      const dy = el.y - ny;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < minDist) {
        minDist = dist;
        closest = el;
      }
    }
    return closest;
  }, []);

  const isNearProbe = useCallback((nx: number, ny: number): boolean => {
    const probe = useAppStore.getState().probePoint;
    if (!probe) return false;
    const dx = probe.x - nx;
    const dy = probe.y - ny;
    return Math.sqrt(dx * dx + dy * dy) < 0.05;
  }, []);

  const isNearSplitLine = useCallback((clientX: number): boolean => {
    const canvas = canvasRef.current;
    if (!canvas) return false;
    const state = useAppStore.getState();
    if (!state.compareMode) return false;
    const rect = canvas.getBoundingClientRect();
    const splitScreenX = rect.left + state.compareSplit * rect.width;
    return Math.abs(clientX - splitScreenX) < 10;
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const [nx, ny] = screenToNorm(e.clientX, e.clientY);
    const state = useAppStore.getState();

    if (state.compareMode && isNearSplitLine(e.clientX)) {
      splitDragRef.current = true;
      return;
    }

    if (state.probeMode) {
      if (isNearProbe(nx, ny)) {
        probeDragRef.current = true;
      } else {
        setProbePoint({ x: nx, y: ny });
      }
      return;
    }

    if (e.button === 2) {
      e.preventDefault();
      const hit = findElementAt(nx, ny);
      if (hit) removeElement(hit.id);
      return;
    }

    if (state.placementMode) {
      const defaults = ELEMENT_DEFAULTS[state.placementMode];
      const el: FieldElement = {
        id: genId(),
        type: state.placementMode,
        x: nx,
        y: ny,
        strength: defaults.strength,
        angle: defaults.angle,
        rate: defaults.rate,
        spreadAngle: defaults.spreadAngle,
        initialSpeed: defaults.initialSpeed,
      };
      addElement(el);
      selectElement(el.id);
      return;
    }

    const hit = findElementAt(nx, ny);
    if (hit) {
      selectElement(hit.id);
      dragRef.current = { id: hit.id, offsetX: nx - hit.x, offsetY: ny - hit.y };
    } else {
      selectElement(null);
    }
  }, [screenToNorm, findElementAt, removeElement, selectElement, addElement, setProbePoint, isNearProbe, isNearSplitLine]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (splitDragRef.current) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const split = Math.max(0.1, Math.min(0.9, (e.clientX - rect.left) / rect.width));
      setCompareSplit(split);
      return;
    }

    if (probeDragRef.current) {
      const [nx, ny] = screenToNorm(e.clientX, e.clientY);
      setProbePoint({ x: nx, y: ny });
      return;
    }

    if (!dragRef.current) return;
    const [nx, ny] = screenToNorm(e.clientX, e.clientY);
    updateElement(dragRef.current.id, {
      x: nx - dragRef.current.offsetX,
      y: ny - dragRef.current.offsetY,
    });
  }, [screenToNorm, updateElement, setProbePoint, setCompareSplit]);

  const handleMouseUp = useCallback(() => {
    dragRef.current = null;
    probeDragRef.current = false;
    splitDragRef.current = false;
  }, []);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
  }, []);

  const placementMode = useAppStore((s) => s.placementMode);
  const probeMode = useAppStore((s) => s.probeMode);
  const probeInfo = useAppStore((s) => s.probeInfo);
  const perfPanelExpanded = useAppStore((s) => s.perfPanelExpanded);
  const perfStats = useAppStore((s) => s.perfStats);
  const setPerfPanelExpanded = useAppStore((s) => s.setPerfPanelExpanded);

  const getCursor = () => {
    if (placementMode) return 'crosshair';
    if (probeMode) return 'crosshair';
    if (useAppStore.getState().compareMode) return 'default';
    return 'default';
  };

  return (
    <div ref={containerRef} style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%' }}>
      <canvas
        ref={canvasRef}
        width={1024}
        height={1024}
        style={{
          maxWidth: '100%',
          maxHeight: '100%',
          width: 1024,
          height: 1024,
          background: '#0a0a12',
          cursor: getCursor(),
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onContextMenu={handleContextMenu}
      />
      <div
        ref={fpsDisplayRef}
        style={{
          position: 'absolute',
          top: 8,
          right: 8,
          color: '#0f0',
          fontFamily: 'monospace',
          fontSize: 12,
          background: 'rgba(0,0,0,0.6)',
          padding: '2px 6px',
          borderRadius: 3,
          pointerEvents: 'none',
        }}
      >
        0 FPS
      </div>

      <div
        style={{
          position: 'absolute',
          top: 28,
          right: 8,
          background: 'rgba(0,0,0,0.6)',
          borderRadius: 3,
          fontSize: 10,
          fontFamily: 'monospace',
          color: '#8a8',
          overflow: 'hidden',
        }}
      >
        <div
          onClick={() => setPerfPanelExpanded(!perfPanelExpanded)}
          style={{
            padding: '2px 6px',
            cursor: 'pointer',
            userSelect: 'none',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          <span style={{ fontSize: 8 }}>{perfPanelExpanded ? '▾' : '▸'}</span>
          <span>性能</span>
        </div>
        {perfPanelExpanded && (
          <div style={{ padding: '2px 6px 4px', display: 'flex', flexDirection: 'column', gap: 1 }}>
            <div>粒子数: {perfStats.activeParticles.toLocaleString()}</div>
            <div>Draw Calls: {perfStats.drawCalls}</div>
            <div>场纹理: {perfStats.fieldTextureRes[0]}×{perfStats.fieldTextureRes[1]}</div>
            <div>粒子纹理: {perfStats.particleTexSize[0]}×{perfStats.particleTexSize[1]}</div>
          </div>
        )}
      </div>

      {probeMode && probeInfo && (
        <div
          style={{
            position: 'absolute',
            bottom: 8,
            left: 8,
            background: 'rgba(0,0,0,0.7)',
            padding: '4px 8px',
            borderRadius: 4,
            fontFamily: 'monospace',
            fontSize: 11,
            color: '#fff',
          }}
        >
          <div style={{ color: '#8af', marginBottom: 2 }}>探针信息</div>
          <div>vx: {probeInfo.vx.toFixed(4)}</div>
          <div>vy: {probeInfo.vy.toFixed(4)}</div>
          <div>|v|: {probeInfo.magnitude.toFixed(4)}</div>
        </div>
      )}
    </div>
  );
}
