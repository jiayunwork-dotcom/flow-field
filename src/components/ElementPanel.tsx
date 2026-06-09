import { useState, useCallback } from 'react';
import { useAppStore } from '../store/useAppStore';
import type { FieldElement } from '../store/types';

let nextId = 1;
function genId() { return `el_${nextId++}_${Date.now()}`; }

const ELEMENT_TYPES: Array<{ type: FieldElement['type']; label: string; icon: string; defaultStrength: number }> = [
  { type: 'source', label: '源点', icon: '⊕', defaultStrength: 0.5 },
  { type: 'sink', label: '汇点', icon: '⊖', defaultStrength: 0.5 },
  { type: 'vortex', label: '涡旋', icon: '↻', defaultStrength: 0.5 },
  { type: 'uniform', label: '均匀流', icon: '→', defaultStrength: 0.3 },
];

export function ElementPanel() {
  const fieldElements = useAppStore((s) => s.fieldElements);
  const selectedElementId = useAppStore((s) => s.selectedElementId);
  const addElement = useAppStore((s) => s.addElement);
  const updateElement = useAppStore((s) => s.updateElement);
  const removeElement = useAppStore((s) => s.removeElement);
  const selectElement = useAppStore((s) => s.selectElement);

  const handleAdd = useCallback((type: FieldElement['type']) => {
    const preset = ELEMENT_TYPES.find((t) => t.type === type)!;
    const el: FieldElement = {
      id: genId(),
      type,
      x: (Math.random() - 0.5) * 1.2,
      y: (Math.random() - 0.5) * 1.2,
      strength: preset.defaultStrength,
      angle: type === 'uniform' ? 0 : undefined,
    };
    addElement(el);
    selectElement(el.id);
  }, [addElement, selectElement]);

  const selected = fieldElements.find((e) => e.id === selectedElementId);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontWeight: 600, fontSize: 13, color: '#ccc', marginBottom: 4 }}>交互元素</div>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {ELEMENT_TYPES.map(({ type, label, icon }) => (
          <button
            key={type}
            onClick={() => handleAdd(type)}
            style={{
              background: '#2a2a3a',
              border: '1px solid #444',
              borderRadius: 4,
              color: '#ddd',
              padding: '4px 8px',
              cursor: 'pointer',
              fontSize: 12,
            }}
            title={`添加${label}`}
          >
            {icon} {label}
          </button>
        ))}
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
              <span>{ELEMENT_TYPES.find((t) => t.type === el.type)?.icon}</span>
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
          {selected.type === 'uniform' && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: '#bbb', marginTop: 4 }}>
              角度: {((selected.angle ?? 0) * 180 / Math.PI).toFixed(0)}°
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
        右键删除元素 | 拖拽移动元素
      </div>
    </div>
  );
}
