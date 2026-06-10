import { useCallback, useRef } from 'react';
import { useAppStore } from '../store/useAppStore';

export function ExportPanel() {
  const recordingRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

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
