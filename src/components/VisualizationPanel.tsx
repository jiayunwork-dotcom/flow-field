import { useAppStore } from '../store/useAppStore';
import type { VisualizationMode } from '../store/types';

const MODES: Array<{ mode: VisualizationMode; label: string; icon: string }> = [
  { mode: 'arrows', label: '箭头场', icon: '⇀' },
  { mode: 'particles', label: '粒子动画', icon: '✦' },
  { mode: 'streamlines', label: '流线', icon: '〰' },
  { mode: 'lic', label: 'LIC', icon: '▤' },
  { mode: 'vorticity', label: '涡量', icon: '🌀' },
];

export function VisualizationPanel() {
  const visualizationModes = useAppStore((s) => s.visualizationModes);
  const toggleVisualization = useAppStore((s) => s.toggleVisualization);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ fontWeight: 600, fontSize: 13, color: '#ccc' }}>可视化模式</div>
      {MODES.map(({ mode, label, icon }) => (
        <label
          key={mode}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '4px 8px',
            borderRadius: 4,
            background: visualizationModes[mode] ? '#1a2a3a' : 'transparent',
            cursor: 'pointer',
            fontSize: 12,
            color: visualizationModes[mode] ? '#8af' : '#888',
            border: `1px solid ${visualizationModes[mode] ? '#3a5a8a' : 'transparent'}`,
          }}
        >
          <input
            type="checkbox"
            checked={visualizationModes[mode]}
            onChange={() => toggleVisualization(mode)}
          />
          <span>{icon}</span>
          <span>{label}</span>
        </label>
      ))}
    </div>
  );
}
