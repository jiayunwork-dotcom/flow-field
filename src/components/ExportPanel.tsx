import { useCallback, useRef, useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { SCENE_VERSION } from '../store/types';

export function ExportPanel() {
  const recordingRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const sceneFileRef = useRef<HTMLInputElement>(null);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [importSuccess, setImportSuccess] = useState(false);
  const missingExternalRefs = useAppStore((s) => s.missingExternalRefs);

  const handleScreenshot = useCallback(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = `flowfield_${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  }, []);

  const handleStartRecording = useCallback(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return;

    try {
      const stream = canvas.captureStream(30);
      const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9' });
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.download = `flowfield_${Date.now()}.webm`;
        link.href = url;
        link.click();
        URL.revokeObjectURL(url);
      };

      recorder.start();
      recordingRef.current = recorder;

      setTimeout(() => {
        if (recordingRef.current?.state === 'recording') {
          recordingRef.current.stop();
          recordingRef.current = null;
        }
      }, 30000);
    } catch (e) {
      alert('录制失败: ' + (e as Error).message);
    }
  }, []);

  const handleStopRecording = useCallback(() => {
    if (recordingRef.current?.state === 'recording') {
      recordingRef.current.stop();
      recordingRef.current = null;
    }
  }, []);

  const handleExportJSON = useCallback(() => {
    const state = useAppStore.getState();
    const exportData = {
      fieldElements: state.fieldElements,
      presetFields: state.presetFields,
      customFields: state.customFields,
      globalParams: state.globalParams,
      visualizationModes: state.visualizationModes,
      operationMode: state.operationMode,
    };
    const json = JSON.stringify(exportData, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = `flowfield_${Date.now()}.json`;
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
  }, []);

  const handleExportScene = useCallback(() => {
    const scene = useAppStore.getState().exportScene();
    const json = JSON.stringify(scene, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = `scene_${Date.now()}.json`;
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
  }, []);

  const handleImportScene = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportErrors([]);
    setImportSuccess(false);

    try {
      const text = await file.text();
      let data: unknown;
      try {
        data = JSON.parse(text);
      } catch {
        setImportErrors(['JSON解析失败: 文件内容不是有效的JSON格式']);
        return;
      }

      const result = useAppStore.getState().importScene(data);
      if (result.success) {
        setImportSuccess(true);
        setImportErrors([]);
      } else {
        setImportSuccess(false);
        setImportErrors(result.errors);
      }
    } catch (err) {
      setImportErrors([`读取文件失败: ${(err as Error).message}`]);
    }

    if (sceneFileRef.current) sceneFileRef.current.value = '';
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ fontWeight: 600, fontSize: 13, color: '#ccc' }}>导出</div>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        <button onClick={handleScreenshot} style={btnStyle}>
          📷 截图 PNG
        </button>
        <button onClick={handleStartRecording} style={btnStyle}>
          🎬 录制 WebM
        </button>
        <button onClick={handleStopRecording} style={btnStyle}>
          ⏹ 停止录制
        </button>
        <button onClick={handleExportJSON} style={btnStyle}>
          💾 导出 JSON
        </button>
      </div>
      <div style={{ fontSize: 9, color: '#555' }}>录制最长30秒，自动停止</div>

      <div style={{ borderTop: '1px solid #333', paddingTop: 6, marginTop: 2 }}>
        <div style={{ fontWeight: 600, fontSize: 12, color: '#ccc', marginBottom: 4 }}>场景导出/导入</div>
        <div style={{ fontSize: 10, color: '#888', marginBottom: 4 }}>
          导出完整场景 (时间线+关键帧+标注+动画)，版本 v{SCENE_VERSION}
        </div>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          <button onClick={handleExportScene} style={btnStyle}>
            📦 导出场景
          </button>
          <button onClick={() => sceneFileRef.current?.click()} style={btnStyle}>
            📂 导入场景
          </button>
        </div>
        <input
          ref={sceneFileRef}
          type="file"
          accept=".json"
          style={{ display: 'none' }}
          onChange={handleImportScene}
        />

        {importSuccess && (
          <div style={{ marginTop: 4, padding: '4px 8px', background: '#1a3a1a', border: '1px solid #3a6a3a', borderRadius: 3, fontSize: 10, color: '#6bcb77' }}>
            场景导入成功
          </div>
        )}

        {importErrors.length > 0 && (
          <div style={{ marginTop: 4, padding: '4px 8px', background: '#3a1a1a', border: '1px solid #6a3a3a', borderRadius: 3, fontSize: 10, color: '#ff6b6b', maxHeight: 100, overflowY: 'auto' }}>
            {importErrors.map((err, i) => (
              <div key={i}>{err}</div>
            ))}
          </div>
        )}

        {missingExternalRefs.length > 0 && (
          <div style={{ marginTop: 4, padding: '4px 8px', background: '#3a3a1a', border: '1px solid #6a6a3a', borderRadius: 3, fontSize: 10, color: '#ffd93d' }}>
            <div style={{ marginBottom: 2 }}>⚠ 以下外部文件引用未找到:</div>
            {missingExternalRefs.map((ref, i) => (
              <div key={i} style={{ fontSize: 9, color: '#cc9' }}>{ref}</div>
            ))}
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
