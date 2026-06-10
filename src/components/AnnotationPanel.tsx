import { useAppStore } from '../store/useAppStore';
import type { Annotation } from '../store/types';
import { ANNOTATION_COLORS } from '../store/types';

const ANNOTATION_MODES: Array<{ mode: 'arrow' | 'text' | 'region' | 'select'; label: string; icon: string }> = [
  { mode: 'select', label: '选择', icon: '⊹' },
  { mode: 'arrow', label: '箭头', icon: '→' },
  { mode: 'text', label: '文字', icon: 'T' },
  { mode: 'region', label: '区域框', icon: '▭' },
];

export function AnnotationPanel() {
  const annotations = useAppStore((s) => s.annotations);
  const selectedAnnotationId = useAppStore((s) => s.selectedAnnotationId);
  const annotationMode = useAppStore((s) => s.annotationMode);
  const currentTime = useAppStore((s) => s.timelineCurrentTime);
  const duration = useAppStore((s) => s.timelineDuration);
  const updateAnnotation = useAppStore((s) => s.updateAnnotation);
  const removeAnnotation = useAppStore((s) => s.removeAnnotation);
  const selectAnnotation = useAppStore((s) => s.selectAnnotation);
  const setAnnotationMode = useAppStore((s) => s.setAnnotationMode);
  const insertAnnotationPositionFrame = useAppStore((s) => s.insertAnnotationPositionFrame);

  const selected = annotations.find((a) => a.id === selectedAnnotationId);

  const handleModeSelect = (mode: typeof annotationMode) => {
    if (annotationMode === mode) {
      setAnnotationMode(null);
    } else {
      setAnnotationMode(mode);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontWeight: 600, fontSize: 13, color: '#ccc', marginBottom: 4 }}>标注图层</div>

      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {ANNOTATION_MODES.map(({ mode, label, icon }) => (
          <button
            key={mode}
            onClick={() => handleModeSelect(mode)}
            style={{
              background: annotationMode === mode ? '#2a4a6a' : '#2a2a3a',
              border: `1px solid ${annotationMode === mode ? '#5a8aba' : '#444'}`,
              borderRadius: 4,
              color: annotationMode === mode ? '#fff' : '#ddd',
              padding: '4px 8px',
              cursor: 'pointer',
              fontSize: 12,
            }}
          >
            {icon} {label}
          </button>
        ))}
      </div>

      <div style={{ fontSize: 10, color: '#666', marginTop: 2 }}>
        {annotationMode === 'arrow' && '在画布上拖拽绘制箭头'}
        {annotationMode === 'text' && '双击画布添加文字标注'}
        {annotationMode === 'region' && '在画布上拖拽绘制区域框'}
        {annotationMode === 'select' && '点击选中标注，拖拽移动，Delete删除'}
        {!annotationMode && '选择工具后操作标注'}
      </div>

      {annotations.length > 0 && (
        <div style={{ maxHeight: 150, overflowY: 'auto', border: '1px solid #333', borderRadius: 4, padding: 4 }}>
          {annotations.map((ann) => (
            <div
              key={ann.id}
              onClick={() => selectAnnotation(ann.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '3px 6px',
                borderRadius: 3,
                cursor: 'pointer',
                background: ann.id === selectedAnnotationId ? '#3a3a5a' : 'transparent',
                fontSize: 11,
                color: '#bbb',
              }}
            >
              <span style={{ width: 8, height: 8, borderRadius: 2, background: ann.color, display: 'inline-block', flexShrink: 0 }} />
              <span>
                {ann.type === 'arrow' && '箭头'}
                {ann.type === 'text' && `文字: ${ann.text.slice(0, 8)}`}
                {ann.type === 'region' && `区域: ${ann.label || '(无标题)'}`}
              </span>
              {ann.timeStart !== null && ann.timeEnd !== null && (
                <span style={{ fontSize: 9, color: '#888' }}>
                  {ann.timeStart.toFixed(1)}s-{ann.timeEnd.toFixed(1)}s
                </span>
              )}
              <button
                onClick={(e) => { e.stopPropagation(); removeAnnotation(ann.id); }}
                style={{
                  marginLeft: 'auto',
                  background: 'none',
                  border: 'none',
                  color: '#f66',
                  cursor: 'pointer',
                  fontSize: 11,
                }}
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
            编辑标注: {selected.type === 'arrow' ? '箭头' : selected.type === 'text' ? '文字' : '区域框'}
          </div>

          <div style={{ marginBottom: 6 }}>
            <div style={{ fontSize: 10, color: '#999', marginBottom: 2 }}>颜色</div>
            <div style={{ display: 'flex', gap: 3 }}>
              {ANNOTATION_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => updateAnnotation(selected.id, { color: c } as Partial<Annotation>)}
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 3,
                    background: c,
                    border: selected.color === c ? '2px solid #fff' : '2px solid transparent',
                    cursor: 'pointer',
                    padding: 0,
                  }}
                />
              ))}
            </div>
          </div>

          {(selected.type === 'arrow' || selected.type === 'region') && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: '#bbb', marginBottom: 4 }}>
              线宽: {selected.lineWidth}px
              <input
                type="range"
                min={1}
                max={5}
                step={1}
                value={selected.lineWidth}
                onChange={(e) => updateAnnotation(selected.id, { lineWidth: parseInt(e.target.value) } as Partial<Annotation>)}
                style={{ flex: 1 }}
              />
            </label>
          )}

          {selected.type === 'text' && (
            <>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: '#bbb', marginBottom: 4 }}>
                字号: {selected.fontSize}px
                <input
                  type="range"
                  min={12}
                  max={36}
                  step={1}
                  value={selected.fontSize}
                  onChange={(e) => updateAnnotation(selected.id, { fontSize: parseInt(e.target.value) } as Partial<Annotation>)}
                  style={{ flex: 1 }}
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 11, color: '#bbb', marginBottom: 4 }}>
                文字内容
                <input
                  type="text"
                  value={selected.text}
                  onChange={(e) => updateAnnotation(selected.id, { text: e.target.value } as Partial<Annotation>)}
                  style={{ background: '#111', color: '#ddd', border: '1px solid #444', borderRadius: 2, padding: '2px 4px', fontSize: 11 }}
                />
              </label>
            </>
          )}

          {selected.type === 'region' && (
            <label style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 11, color: '#bbb', marginBottom: 4 }}>
              区域说明
              <input
                type="text"
                value={selected.label}
                onChange={(e) => updateAnnotation(selected.id, { label: e.target.value } as Partial<Annotation>)}
                style={{ background: '#111', color: '#ddd', border: '1px solid #444', borderRadius: 2, padding: '2px 4px', fontSize: 11 }}
                placeholder="区域说明文字"
              />
            </label>
          )}

          <div style={{ borderTop: '1px solid #333', paddingTop: 6, marginTop: 6 }}>
            <div style={{ fontSize: 10, color: '#999', marginBottom: 4 }}>时间区间绑定</div>
            <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginBottom: 4 }}>
              <label style={{ fontSize: 10, color: '#aaa' }}>
                起始:
                <input
                  type="number"
                  step={0.1}
                  min={0}
                  max={duration}
                  value={selected.timeStart ?? ''}
                  onChange={(e) => {
                    const v = e.target.value === '' ? null : parseFloat(e.target.value);
                    updateAnnotation(selected.id, { timeStart: v } as Partial<Annotation>);
                  }}
                  style={{ width: 50, background: '#111', color: '#ddd', border: '1px solid #444', borderRadius: 2, padding: '1px 4px', fontSize: 10, marginLeft: 4 }}
                  placeholder="无"
                />
              </label>
              <label style={{ fontSize: 10, color: '#aaa' }}>
                结束:
                <input
                  type="number"
                  step={0.1}
                  min={0}
                  max={duration}
                  value={selected.timeEnd ?? ''}
                  onChange={(e) => {
                    const v = e.target.value === '' ? null : parseFloat(e.target.value);
                    updateAnnotation(selected.id, { timeEnd: v } as Partial<Annotation>);
                  }}
                  style={{ width: 50, background: '#111', color: '#ddd', border: '1px solid #444', borderRadius: 2, padding: '1px 4px', fontSize: 10, marginLeft: 4 }}
                  placeholder="无"
                />
              </label>
            </div>
            <div style={{ fontSize: 9, color: '#666' }}>留空表示始终可见</div>
          </div>

          <div style={{ borderTop: '1px solid #333', paddingTop: 6, marginTop: 6 }}>
            <div style={{ fontSize: 10, color: '#999', marginBottom: 4 }}>标注位置动画</div>
            <button
              onClick={() => insertAnnotationPositionFrame(selected.id)}
              style={{
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
              + 在当前时间 ({currentTime.toFixed(1)}s) 插入位置帧
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
