import { useCallback } from 'react';
import { useAppStore } from '../store/useAppStore';
import type { FieldElement } from '../store/types';

const ELEMENT_TYPES: Array<{ type: FieldElement['type']; label: string; icon: string; defaultStrength: number }> = [
  { type: 'source', label: '源点', icon: '⊕', defaultStrength: 0.5 },
  { type: 'sink', label: '汇点', icon: '⊖', defaultStrength: 0.5 },
  { type: 'vortex', label: '涡旋', icon: '↻', defaultStrength: 0.5 },
  { type: 'uniform', label: '均匀流', icon: '→', defaultStrength: 0.3 },
  { type: 'emitter', label: '发射器', icon: '喷射', defaultStrength: 0 },
];

export function ElementPanel() {
  const fieldElements = useAppStore((s) => s.fieldElements);
  const selectedElementId = useAppStore((s) => s.selectedElementId);
  const updateElement = useAppStore((s) => s.updateElement);
  const removeElement = useAppStore((s) => s.removeElement);
  const selectElement = useAppStore((s) => s.selectElement);
  const placementMode = useAppStore((s) => s.placementMode);
  const setPlacementMode = useAppStore((s) => s.setPlacementMode);
  const setProbeMode = useAppStore((s) => s.setProbeMode);
  const probeMode = useAppStore((s) => s.probeMode);

  const handleSelectType = useCallback((type: FieldElement['type']) => {
    if (placementMode === type) {
      setPlacementMode(null);
    } else {
      setPlacementMode(type);
      setProbeMode(false);
    }
  }, [placementMode, setPlacementMode, setProbeMode]);

  const handleToggleProbe = useCallback(() => {
    setProbeMode(!probeMode);
    if (!probeMode) setPlacementMode(null);
  }, [probeMode, setProbeMode, setPlacementMode]);

  const selected = fieldElements.find((e) => e.id === selectedElementId);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontWeight: 600, fontSize: 13, color: '#ccc', marginBottom: 4 }}>交互元素</div>
      <div style={{ fontSize: 10, color: placementMode ? '#8af' : '#666', marginBottom: 2 }}>
        {placementMode ? `点击画布放置${ELEMENT_TYPES.find(t => t.type === placementMode)?.label ?? ''}` : '选择元素类型后在画布上点击放置'}
      </div>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {ELEMENT_TYPES.map(({ type, label, icon }) => (
          <button
            key={type}
            onClick={() => handleSelectType(type)}
            style={{
              background: placementMode === type ? '#2a4a6a' : '#2a2a3a',
              border: `1px solid ${placementMode === type ? '#5a8aba' : '#444'}`,
              borderRadius: 4,
              color: placementMode === type ? '#fff' : '#ddd',
              padding: '4px 8px',
              cursor: 'pointer',
              fontSize: 12,
            }}
            title={`选择后在画布点击放置${label}`}
          >
            {icon} {label}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
        <button
          onClick={handleToggleProbe}
          style={{
            background: probeMode ? '#4a2a2a' : '#2a2a3a',
            border: `1px solid ${probeMode ? '#ba5a5a' : '#444'}`,
            borderRadius: 4,
            color: probeMode ? '#faa' : '#ddd',
            padding: '4px 8px',
            cursor: 'pointer',
            fontSize: 12,
          }}
          title="路径探针工具"
        >
          🔍 探针
        </button>
      </div>

      {fieldElements.length > 0 && (
        <div style={{ maxHeight: 200, overflowY: 'auto', border: '1px solid #333', borderRadius: 4, padding: 4 }}>
          {fieldElements.map((el) => (
            <div
              key={el.id}
              onClick={() => selectElement(el.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '3px 6px',
                borderRadius: 3,
                cursor: 'pointer',
                background: el.id === selectedElementId ? '#3a3a5a' : 'transparent',
                fontSize: 11,
                color: '#bbb',
              }}
            >
              <span>{ELEMENT_TYPES.find((t) => t.type === el.type)?.icon ?? '?'}</span>
              <span>{el.type} ({el.x.toFixed(2)}, {el.y.toFixed(2)})</span>
              <button
                onClick={(e) => { e.stopPropagation(); removeElement(el.id); }}
                style={{
                  marginLeft: 'auto',
                  background: 'none',
                  border: 'none',
                  color: '#f66',
                  cursor: 'pointer',
                  fontSize: 11,
                }}
                title="删除"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {selected && (
        <div style={{ border: '1px solid #444', borderRadius: 4, padding: 8, background: '#1a1a2a' }}>
          <div style={{ fontSize: 11, color: '#aaa', marginBottom: 6 }}>
            编辑: {selected.type}
          </div>
          {selected.type !== 'emitter' && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: '#bbb' }}>
              强度: {selected.strength.toFixed(2)}
              <input
                type="range"
                min={-2}
                max={2}
                step={0.05}
                value={selected.strength}
                onChange={(e) => updateElement(selected.id, { strength: parseFloat(e.target.value) })}
                style={{ flex: 1 }}
              />
            </label>
          )}
          {(selected.type === 'uniform' || selected.type === 'emitter') && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: '#bbb', marginTop: 4 }}>
              方向: {((selected.angle ?? 0) * 180 / Math.PI).toFixed(0)}°
              <input
                type="range"
                min={-3.14159}
                max={3.14159}
                step={0.05}
                value={selected.angle ?? 0}
                onChange={(e) => updateElement(selected.id, { angle: parseFloat(e.target.value) })}
                style={{ flex: 1 }}
              />
            </label>
          )}
          {selected.type === 'emitter' && (
            <>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: '#bbb', marginTop: 4 }}>
                发射速率: {selected.rate ?? 100}/s
                <input
                  type="range"
                  min={10}
                  max={500}
                  step={10}
                  value={selected.rate ?? 100}
                  onChange={(e) => updateElement(selected.id, { rate: parseInt(e.target.value) })}
                  style={{ flex: 1 }}
                />
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: '#bbb', marginTop: 4 }}>
                扇形张角: {selected.spreadAngle ?? 30}°
                <input
                  type="range"
                  min={0}
                  max={360}
                  step={5}
                  value={selected.spreadAngle ?? 30}
                  onChange={(e) => updateElement(selected.id, { spreadAngle: parseInt(e.target.value) })}
                  style={{ flex: 1 }}
                />
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: '#bbb', marginTop: 4 }}>
                初始速度: {(selected.initialSpeed ?? 1.0).toFixed(1)}
                <input
                  type="range"
                  min={0.1}
                  max={5.0}
                  step={0.1}
                  value={selected.initialSpeed ?? 1.0}
                  onChange={(e) => updateElement(selected.id, { initialSpeed: parseFloat(e.target.value) })}
                  style={{ flex: 1 }}
                />
              </label>
            </>
          )}
          <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
            <label style={{ fontSize: 11, color: '#bbb' }}>
              X: <input type="number" step={0.01} value={selected.x.toFixed(2)}
                onChange={(e) => updateElement(selected.id, { x: parseFloat(e.target.value) || 0 })}
                style={{ width: 60, background: '#111', color: '#ddd', border: '1px solid #444', borderRadius: 2, padding: '1px 4px', fontSize: 11 }}
              />
            </label>
            <label style={{ fontSize: 11, color: '#bbb' }}>
              Y: <input type="number" step={0.01} value={selected.y.toFixed(2)}
                onChange={(e) => updateElement(selected.id, { y: parseFloat(e.target.value) || 0 })}
                style={{ width: 60, background: '#111', color: '#ddd', border: '1px solid #444', borderRadius: 2, padding: '1px 4px', fontSize: 11 }}
              />
            </label>
          </div>
        </div>
      )}

      <div style={{ fontSize: 10, color: '#666', marginTop: 2 }}>
        选择类型→点击画布放置 | 右键删除 | 拖拽移动
      </div>
    </div>
  );
}
