import { useRef, useCallback } from 'react';
import { useAppStore } from '../store/useAppStore';
import { parseCSV, parseVTK } from '../fields/DataImporter';
import type { VectorFieldData, TimeSeriesData } from '../store/types';

export function ImportPanel() {
  const setImportedField = useAppStore((s) => s.setImportedField);
  const setTimeSeriesData = useAppStore((s) => s.setTimeSeriesData);
  const timeSeriesData = useAppStore((s) => s.timeSeriesData);
  const timeSeriesFrame = useAppStore((s) => s.timeSeriesFrame);
  const timeSeriesPlaying = useAppStore((s) => s.timeSeriesPlaying);
  const timeSeriesSpeed = useAppStore((s) => s.timeSeriesSpeed);
  const setTimeSeriesFrame = useAppStore((s) => s.setTimeSeriesFrame);
  const setTimeSeriesPlaying = useAppStore((s) => s.setTimeSeriesPlaying);
  const setTimeSeriesSpeed = useAppStore((s) => s.setTimeSeriesSpeed);

  const fileRef = useRef<HTMLInputElement>(null);
  const tsFileRef = useRef<HTMLInputElement>(null);

  const handleFileImport = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const ext = file.name.split('.').pop()?.toLowerCase();

    try {
      let field: VectorFieldData;
      if (ext === 'csv') {
        field = parseCSV(text);
      } else if (ext === 'vtk') {
        field = parseVTK(text);
      } else {
        alert('不支持的文件格式，请使用 .csv 或 .vtk 文件');
        return;
      }
      setImportedField(field);
    } catch (err: any) {
      alert(`导入失败: ${err.message}`);
    }

    if (fileRef.current) fileRef.current.value = '';
  }, [setImportedField]);

  const handleTimeSeriesImport = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const sortedFiles = Array.from(files).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    const frames: TimeSeriesData['frames'] = [];
    const timestamps: number[] = [];

    for (let i = 0; i < sortedFiles.length; i++) {
      const file = sortedFiles[i];
      const text = await file.text();
      const ext = file.name.split('.').pop()?.toLowerCase();
      try {
        let field: VectorFieldData;
        if (ext === 'csv') {
          field = parseCSV(text);
        } else if (ext === 'vtk') {
          field = parseVTK(text);
        } else continue;
        frames.push({ data: field.data, width: field.width, height: field.height });
        timestamps.push(i);
      } catch { continue; }
    }

    if (frames.length > 0) {
      setTimeSeriesData({ frames, timestamps });
    }

    if (tsFileRef.current) tsFileRef.current.value = '';
  }, [setTimeSeriesData]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ fontWeight: 600, fontSize: 13, color: '#ccc' }}>数据导入</div>

      <div style={{ display: 'flex', gap: 4 }}>
        <button onClick={() => fileRef.current?.click()} style={btnStyle}>
          导入CSV/VTK
        </button>
        <button onClick={() => setImportedField(null)} style={btnStyle}>
          清除
        </button>
      </div>
      <input ref={fileRef} type="file" accept=".csv,.vtk" style={{ display: 'none' }} onChange={handleFileImport} />

      <div style={{ borderTop: '1px solid #333', paddingTop: 6, marginTop: 2 }}>
        <div style={{ fontWeight: 500, fontSize: 11, color: '#999', marginBottom: 4 }}>时变场</div>
        <button onClick={() => tsFileRef.current?.click()} style={btnStyle}>
          导入时间序列
        </button>
        <input ref={tsFileRef} type="file" accept=".csv,.vtk" multiple style={{ display: 'none' }} onChange={handleTimeSeriesImport} />

        {timeSeriesData && (
          <div style={{ marginTop: 6 }}>
            <div style={{ fontSize: 10, color: '#aaa' }}>
              帧: {timeSeriesFrame + 1} / {timeSeriesData.frames.length}
            </div>
            <div style={{ display: 'flex', gap: 3, marginTop: 4 }}>
              <button onClick={() => setTimeSeriesPlaying(!timeSeriesPlaying)} style={btnStyle}>
                {timeSeriesPlaying ? '⏸' : '▶'}
              </button>
              <button onClick={() => setTimeSeriesFrame(Math.max(0, timeSeriesFrame - 1))} style={btnStyle}>
                ⏮
              </button>
              <button onClick={() => setTimeSeriesFrame(Math.min(timeSeriesData.frames.length - 1, timeSeriesFrame + 1))} style={btnStyle}>
                ⏭
              </button>
              <select
                value={timeSeriesSpeed}
                onChange={(e) => setTimeSeriesSpeed(parseFloat(e.target.value))}
                style={{ background: '#1a1a2a', color: '#ccc', border: '1px solid #333', borderRadius: 3, fontSize: 10, padding: '1px 4px' }}
              >
                <option value={0.25}>0.25x</option>
                <option value={0.5}>0.5x</option>
                <option value={1}>1x</option>
                <option value={2}>2x</option>
                <option value={4}>4x</option>
              </select>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  background: '#2a2a3a',
  border: '1px solid #444',
  borderRadius: 4,
  color: '#ddd',
  padding: '4px 8px',
  cursor: 'pointer',
  fontSize: 11,
};
