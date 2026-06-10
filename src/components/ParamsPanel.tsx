import { useAppStore } from '../store/useAppStore';
import type { ColormapName } from '../store/types';

const COLORMAPS: Array<{ name: ColormapName; label: string }> = [
  { name: 'viridis', label: 'Viridis' },
  { name: 'magma', label: 'Magma' },
  { name: 'inferno', label: 'Inferno' },
  { name: 'plasma', label: 'Plasma' },
  { name: 'turbo', label: 'Turbo' },
];

export function ParamsPanel() {
  const globalParams = useAppStore((s) => s.globalParams);
  const setGlobalParam = useAppStore((s) => s.setGlobalParam);
  const setColormap = useAppStore((s) => s.setColormap);
  const colorRange = useAppStore((s) => s.colorRange);
  const setColorRange = useAppStore((s) => s.setColorRange);
  const arrowSpacing = useAppStore((s) => s.arrowSpacing);
  const setArrowSpacing = useAppStore((s) => s.setArrowSpacing);
  const licStepSize = useAppStore((s) => s.licStepSize);
  const licKernelLength = useAppStore((s) => s.licKernelLength);
  const setLicParams = useAppStore((s) => s.setLicParams);
  const compareMode = useAppStore((s) => s.compareMode);
  const setCompareMode = useAppStore((s) => s.setCompareMode);
  const compareSplit = useAppStore((s) => s.compareSplit);
  const setCompareSplit = useAppStore((s) => s.setCompareSplit);
  const snapshotField = useAppStore((s) => s.snapshotField);

  const handleSaveSnapshot = () => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return;
    const gl = canvas.getContext('webgl2');
    if (!gl) return;
    const w = canvas.width;
    const h = canvas.height;
    const pixels = new Float32Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.FLOAT, pixels);
    const data = new Float32Array(w * h * 2);
    for (let i = 0; i < w * h; i++) {
      data[i * 2] = pixels[i * 4];
      data[i * 2 + 1] = pixels[i * 4 + 1];
    }
    useAppStore.getState().saveSnapshot({ width: w, height: h, data });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ fontWeight: 600, fontSize: 13, color: '#ccc' }}>参数控制</div>

      <ParamSlider label="粒子数量" value={globalParams.particleCount} min={5000} max={200000} step={5000}
        display={globalParams.particleCount.toLocaleString()}
        onChange={(v) => setGlobalParam('particleCount', v)} />

      <ParamSlider label="尾迹长度" value={globalParams.trailLength} min={5} max={100} step={1}
        display={`${globalParams.trailLength} 帧`}
        onChange={(v) => setGlobalParam('trailLength', v)} />

      <ParamSlider label="速度缩放" value={globalParams.speedScale} min={0.1} max={10} step={0.1}
        display={globalParams.speedScale.toFixed(1)}
        onChange={(v) => setGlobalParam('speedScale', v)} />

      <ParamSlider label="积分步长" value={globalParams.integrationStep} min={0.001} max={0.1} step={0.001}
        display={globalParams.integrationStep.toFixed(3)}
        onChange={(v) => setGlobalParam('integrationStep', v)} />

      <ParamSlider label="箭头间距" value={arrowSpacing} min={15} max={60} step={1}
        display={`${arrowSpacing}px`}
        onChange={setArrowSpacing} />

      <ParamSlider label="LIC步长" value={licStepSize} min={0.001} max={0.05} step={0.001}
        display={licStepSize.toFixed(3)}
        onChange={(v) => setLicParams(v, undefined)} />

      <ParamSlider label="LIC卷积核" value={licKernelLength} min={5} max={64} step={1}
        display={`${licKernelLength}`}
        onChange={(v) => setLicParams(undefined, v)} />

      <div style={{ marginTop: 4 }}>
        <div style={{ fontSize: 11, color: '#999', marginBottom: 4 }}>色标</div>
        <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
          {COLORMAPS.map(({ name, label }) => (
            <button
              key={name}
              onClick={() => setColormap(name)}
              style={{
                background: globalParams.colormap === name ? '#2a3a5a' : '#1a1a2a',
                border: `1px solid ${globalParams.colormap === name ? '#4a6a9a' : '#333'}`,
                borderRadius: 3,
                color: globalParams.colormap === name ? '#8af' : '#888',
                padding: '2px 6px',
                cursor: 'pointer',
                fontSize: 10,
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 4 }}>
        <div style={{ fontSize: 11, color: '#999', marginBottom: 2 }}>色标范围</div>
        <div style={{ fontSize: 10, color: '#aaa' }}>
          [{colorRange.min.toFixed(3)}, {colorRange.max.toFixed(3)}]
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2, fontSize: 10, color: '#aaa' }}>
          <input type="checkbox" checked={colorRange.locked}
            onChange={(e) => setColorRange({ locked: e.target.checked })}
          />
          锁定范围
        </label>
        {colorRange.locked && (
          <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
            <input type="number" step={0.01} value={colorRange.min}
              onChange={(e) => setColorRange({ min: parseFloat(e.target.value) || 0 })}
              style={{ width: 60, background: '#111', color: '#ddd', border: '1px solid #444', borderRadius: 2, padding: '1px 4px', fontSize: 10 }}
              placeholder="Min"
            />
            <input type="number" step={0.01} value={colorRange.max}
              onChange={(e) => setColorRange({ max: parseFloat(e.target.value) || 1 })}
              style={{ width: 60, background: '#111', color: '#ddd', border: '1px solid #444', borderRadius: 2, padding: '1px 4px', fontSize: 10 }}
              placeholder="Max"
            />
          </div>
        )}
      </div>

      <div style={{ marginTop: 6, borderTop: '1px solid #333', paddingTop: 6 }}>
        <div style={{ fontSize: 11, color: '#999', marginBottom: 4 }}>对比模式</div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#bbb' }}>
          <input type="checkbox" checked={compareMode}
            onChange={(e) => setCompareMode(e.target.checked)}
          />
          启用对比
        </label>
        {compareMode && (
          <>
            <button
              onClick={handleSaveSnapshot}
              style={{
                marginTop: 4,
                background: '#2a3a5a',
                border: '1px solid #4a6a9a',
                borderRadius: 3,
                color: '#8af',
                padding: '3px 8px',
                cursor: 'pointer',
                fontSize: 10,
                width: '100%',
              }}
            >
              保存快照 {snapshotField ? '(已保存)' : ''}
            </button>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: '#bbb', marginTop: 4 }}>
              分割: {Math.round(compareSplit * 100)}%
              <input
                type="range"
                min={0.1}
                max={0.9}
                step={0.01}
                value={compareSplit}
                onChange={(e) => setCompareSplit(parseFloat(e.target.value))}
                style={{ flex: 1 }}
              />
            </label>
            <div style={{ fontSize: 9, color: '#666', marginTop: 2 }}>
              拖动画布上的分割线可调整比例
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ParamSlider({ label, value, min, max, step, display, onChange }: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  onChange: (v: number) => void;
}) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 11, color: '#aaa' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span>{label}</span>
        <span style={{ color: '#8af', fontFamily: 'monospace', fontSize: 10 }}>{display}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        style={{ width: '100%' }}
      />
    </label>
  );
}
