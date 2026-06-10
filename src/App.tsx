import { useEffect } from 'react';
import { Canvas } from './components/Canvas';
import { FieldPanel } from './components/FieldPanel';
import { VisualizationPanel } from './components/VisualizationPanel';
import { OperationPanel } from './components/OperationPanel';
import { ParamsPanel } from './components/ParamsPanel';
import { ElementPanel } from './components/ElementPanel';
import { ImportPanel } from './components/ImportPanel';
import { ExportPanel } from './components/ExportPanel';
import { UndoRedoPanel } from './components/UndoRedoPanel';
import { AnnotationPanel } from './components/AnnotationPanel';
import { AnnotationLayer } from './components/AnnotationLayer';
import { Timeline } from './components/Timeline';
import { useAppStore } from './store/useAppStore';
import './App.css';

function App() {
  const undo = useAppStore((s) => s.undo);
  const redo = useAppStore((s) => s.redo);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      const isInput = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'SELECT');

      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        redo();
        return;
      }

      if (isInput) return;

      const state = useAppStore.getState();
      const keyframes = state.timelineKeyframes;
      const currentTime = state.timelineCurrentTime;
      const selectedKeyframeIds = state.selectedKeyframeIds;
      const copiedKeyframes = state.copiedKeyframes;

      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        if (keyframes.length === 0) return;
        const sorted = [...keyframes].sort((a, b) => a.time - b.time);
        if (e.key === 'ArrowLeft') {
          let target = sorted[0].time;
          for (let i = sorted.length - 1; i >= 0; i--) {
            if (sorted[i].time < currentTime - 0.01) {
              target = sorted[i].time;
              break;
            }
          }
          state.setTimelineCurrentTime(target);
          state.interpolateAndRestore(target);
        } else {
          let target = sorted[sorted.length - 1].time;
          for (let i = 0; i < sorted.length; i++) {
            if (sorted[i].time > currentTime + 0.01) {
              target = sorted[i].time;
              break;
            }
          }
          state.setTimelineCurrentTime(target);
          state.interpolateAndRestore(target);
        }
        return;
      }

      if (e.key === 'Home') {
        e.preventDefault();
        if (keyframes.length > 0) {
          state.setTimelineCurrentTime(keyframes[0].time);
          state.interpolateAndRestore(keyframes[0].time);
        }
        return;
      }

      if (e.key === 'End') {
        e.preventDefault();
        if (keyframes.length > 0) {
          state.setTimelineCurrentTime(keyframes[keyframes.length - 1].time);
          state.interpolateAndRestore(keyframes[keyframes.length - 1].time);
        }
        return;
      }

      if (e.key === ' ') {
        e.preventDefault();
        if (state.timelinePlaying) {
          state.setTimelinePlaying(false);
        } else if (keyframes.length > 0) {
          state.setTimelineRecording(false);
          if (currentTime >= keyframes[keyframes.length - 1].time) {
            state.setTimelineCurrentTime(0);
            state.interpolateAndRestore(0);
          }
          state.setTimelinePlaying(true);
        }
        return;
      }

      if (e.key === 'Delete' && selectedKeyframeIds.length > 0) {
        e.preventDefault();
        state.removeTimelineKeyframes(selectedKeyframeIds);
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 'c' && selectedKeyframeIds.length > 0) {
        e.preventDefault();
        const kfs = keyframes.filter((k) => selectedKeyframeIds.includes(k.id));
        state.setCopiedKeyframes(JSON.parse(JSON.stringify(kfs)));
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 'v' && copiedKeyframes.length > 0) {
        e.preventDefault();
        const baseTime = copiedKeyframes[0].time;
        const offset = currentTime - baseTime;
        const newKfs: typeof copiedKeyframes = [];
        for (const ckf of copiedKeyframes) {
          let newTime = ckf.time + offset;
          const allKfTimes = [...keyframes.map((k) => k.time), ...newKfs.map((k) => k.time)];
          for (const et of allKfTimes) {
            if (Math.abs(newTime - et) < 0.05) {
              newTime = et + 0.05;
            }
          }
          newTime = Math.max(0, Math.min(state.timelineDuration, newTime));
          newKfs.push({
            ...JSON.parse(JSON.stringify(ckf)),
            id: `kf_paste_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            time: newTime,
          });
        }
        state.addTimelineKeyframes(newKfs);
        state.setSelectedKeyframeIds(newKfs.map((k) => k.id));
        return;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [undo, redo]);

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sidebar-header">
          <h1>Flow Field Editor</h1>
          <UndoRedoPanel />
        </div>

        <div className="sidebar-scroll">
          <Section title="矢量场定义">
            <FieldPanel />
          </Section>

          <Section title="可视化">
            <VisualizationPanel />
          </Section>

          <Section title="场运算">
            <OperationPanel />
          </Section>

          <Section title="交互元素">
            <ElementPanel />
          </Section>

          <Section title="参数">
            <ParamsPanel />
          </Section>

          <Section title="标注图层">
            <AnnotationPanel />
          </Section>

          <Section title="数据导入">
            <ImportPanel />
          </Section>

          <Section title="导出">
            <ExportPanel />
          </Section>
        </div>
      </aside>

      <div className="canvas-area">
        <div className="canvas-wrapper">
          <Canvas />
          <AnnotationLayer />
        </div>
        <Timeline />
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details open className="panel-section">
      <summary className="section-title">{title}</summary>
      <div className="section-content">{children}</div>
    </details>
  );
}

export default App;
