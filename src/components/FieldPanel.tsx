import { useAppStore } from '../store/useAppStore';
import type { PresetField } from '../store/types';

export function FieldPanel() {
  const presetFields = useAppStore((s) => s.presetFields);
  const customFields = useAppStore((s) => s.customFields);
  const togglePresetField = useAppStore((s) => s.togglePresetField);
  const updatePresetParam = useAppStore((s) => s.updatePresetParam);
  const addCustomField = useAppStore((s) => s.addCustomField);
  const removeCustomField = useAppStore((s) => s.removeCustomField);
  const toggleCustomField = useAppStore((s) => s.toggleCustomField);
  const updateCustomField = useAppStore((s) => s.updateCustomField);

  const handleAddCustom = () => {
    addCustomField({
      id: `custom_${Date.now()}`,
      name: '自定义场',
      formulaX: 'sin(y)',
      formulaY: 'cos(x)',
      active: true,
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontWeight: 600, fontSize: 13, color: '#ccc' }}>矢量场</div>

      <div style={{ fontWeight: 500, fontSize: 11, color: '#999' }}>预设场</div>
      {presetFields.map((f) => (
        <PresetFieldItem key={f.id} field={f} onToggle={() => togglePresetField(f.id)} onUpdateParam={(k, v) => updatePresetParam(f.id, k, v)} />
      ))}

      <div style={{ borderTop: '1px solid #333', paddingTop: 6, marginTop: 4 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontWeight: 500, fontSize: 11, color: '#999' }}>自定义公式</span>
          <button onClick={handleAddCustom} style={{ background: '#2a2a3a', border: '1px solid #444', borderRadius: 4, color: '#ddd', padding: '2px 8px', cursor: 'pointer', fontSize: 11 }}>
            + 添加
          </button>
        </div>
        {customFields.map((f) => (
          <CustomFieldItem
            key={f.id}
            field={f}
            onToggle={() => toggleCustomField(f.id)}
            onRemove={() => removeCustomField(f.id)}
            onUpdate={(updates) => updateCustomField(f.id, updates)}
          />
        ))}
      </div>
    </div>
  );
}

function PresetFieldItem({ field, onToggle, onUpdateParam }: { field: PresetField; onToggle: () => void; onUpdateParam: (key: string, val: number) => void }) {
  return (
    <div style={{ background: field.active ? '#1a2a1a' : '#1a1a1a', border: `1px solid ${field.active ? '#3a6a3a' : '#333'}`, borderRadius: 4, padding: 6 }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#ccc', cursor: 'pointer' }}>
        <input type="checkbox" checked={field.active} onChange={onToggle} />
        {field.name}
      </label>
      {field.active && (
        <div style={{ marginTop: 4, paddingLeft: 16 }}>
          {Object.entries(field.params).map(([key, val]) => (
            <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: '#aaa' }}>
              {key}: {val.toFixed(2)}
              <input type="range" min={-3} max={3} step={0.05} value={val} onChange={(e) => onUpdateParam(key, parseFloat(e.target.value))} style={{ flex: 1 }} />
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

function CustomFieldItem({ field, onToggle, onRemove, onUpdate }: {
  field: { id: string; name: string; formulaX: string; formulaY: string; active: boolean };
  onToggle: () => void;
  onRemove: () => void;
  onUpdate: (updates: { name?: string; formulaX?: string; formulaY?: string }) => void;
}) {
  return (
    <div style={{ background: field.active ? '#1a2a1a' : '#1a1a1a', border: `1px solid ${field.active ? '#3a6a3a' : '#333'}`, borderRadius: 4, padding: 6, marginTop: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#ccc', cursor: 'pointer' }}>
          <input type="checkbox" checked={field.active} onChange={onToggle} />
          <input
            type="text"
            value={field.name}
            onChange={(e) => onUpdate({ name: e.target.value })}
            style={{ background: 'transparent', border: 'none', color: '#ccc', fontSize: 11, width: 80 }}
          />
        </label>
        <button onClick={onRemove} style={{ background: 'none', border: 'none', color: '#f66', cursor: 'pointer', fontSize: 11 }}>✕</button>
      </div>
      {field.active && (
        <div style={{ marginTop: 4, paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 3 }}>
          <label style={{ fontSize: 10, color: '#888' }}>
            Vx: <input
              type="text"
              value={field.formulaX}
              onChange={(e) => onUpdate({ formulaX: e.target.value })}
              style={{ background: '#111', color: '#0f0', border: '1px solid #333', borderRadius: 2, padding: '1px 4px', fontSize: 10, width: '100%', fontFamily: 'monospace' }}
            />
          </label>
          <label style={{ fontSize: 10, color: '#888' }}>
            Vy: <input
              type="text"
              value={field.formulaY}
              onChange={(e) => onUpdate({ formulaY: e.target.value })}
              style={{ background: '#111', color: '#0f0', border: '1px solid #333', borderRadius: 2, padding: '1px 4px', fontSize: 10, width: '100%', fontFamily: 'monospace' }}
            />
          </label>
          <div style={{ fontSize: 9, color: '#555' }}>支持: x, y, sin, cos, exp, sqrt, abs, log, +, -, *, /, ^</div>
        </div>
      )}
    </div>
  );
}
