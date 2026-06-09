import { useAppStore } from '../store/useAppStore';
import type { OperationMode } from '../store/types';

const OPS: Array<{ mode: OperationMode; label: string }> = [
  { mode: 'none', label: '无' },
  { mode: 'divergence', label: '散度场' },
  { mode: 'curl', label: '旋度场' },
  { mode: 'gradient', label: '梯度场' },
];

export function OperationPanel() {
  const operationMode = useAppStore((s) => s.operationMode);
  const setOperationMode = useAppStore((s) => s.setOperationMode);
  const operationRange = useAppStore((s) => s.operationRange);
  const setOperationRange = useAppStore((s) => s.setOperationRange);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ fontWeight: 600, fontSize: 13, color: '#ccc' }}>场运算</div>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {OPS.map(({ mode, label }) => (
          <button
            key={mode}
            onClick={() => setOperationMode(mode)}
            style={{
              background: operationMode === mode ? '#2a3a5a' : '#1a1a2a',
              border: `1px solid ${operationMode === mode ? '#4a6a9a' : '#333'}`,
              borderRadius: 4,
              color: operationMode === mode ? '#8af' : '#888',
              padding: '3px 8px',
              cursor: 'pointer',
              fontSize: 11,
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {operationMode !== 'none' && (
        <div style={{ fontSize: 10, color: '#888', marginTop: 4 }}>
          <div>范围: [{operationRange.min.toFixed(3)}, {operationRange.max.toFixed(3)}]</div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
            <span>Min:</span>
            <input type="number" step={0.01} value={operationRange.min}
              onChange={(e) => setOperationRange({ min: parseFloat(e.target.value) || 0, locked: true })}
              style={{ width: 60, background: '#111', color: '#ddd', border: '1px solid #444', borderRadius: 2, padding: '1px 4px', fontSize: 10 }}
            />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
            <span>Max:</span>
            <input type="number" step={0.01} value={operationRange.max}
              onChange={(e) => setOperationRange({ max: parseFloat(e.target.value) || 1, locked: true })}
              style={{ width: 60, background: '#111', color: '#ddd', border: '1px solid #444', borderRadius: 2, padding: '1px 4px', fontSize: 10 }}
            />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2, color: '#aaa' }}>
            <input type="checkbox" checked={operationRange.locked}
              onChange={(e) => setOperationRange({ locked: e.target.checked })}
            />
            锁定范围
          </label>
        </div>
      )}
    </div>
  );
}
