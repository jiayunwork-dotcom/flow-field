import { useAppStore } from '../store/useAppStore';

export function UndoRedoPanel() {
  const undo = useAppStore((s) => s.undo);
  const redo = useAppStore((s) => s.redo);
  const canUndo = useAppStore((s) => s.canUndo);
  const canRedo = useAppStore((s) => s.canRedo);

  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
      <button
        onClick={undo}
        disabled={!canUndo()}
        style={{
          ...btnStyle,
          opacity: canUndo() ? 1 : 0.4,
          cursor: canUndo() ? 'pointer' : 'not-allowed',
        }}
        title="撤销 (Ctrl+Z)"
      >
        ↶ 撤销
      </button>
      <button
        onClick={redo}
        disabled={!canRedo()}
        style={{
          ...btnStyle,
          opacity: canRedo() ? 1 : 0.4,
          cursor: canRedo() ? 'pointer' : 'not-allowed',
        }}
        title="重做 (Ctrl+Y)"
      >
        ↷ 重做
      </button>
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  background: '#2a2a3a',
  border: '1px solid #444',
  borderRadius: 4,
  color: '#ddd',
  padding: '4px 10px',
  cursor: 'pointer',
  fontSize: 11,
};
