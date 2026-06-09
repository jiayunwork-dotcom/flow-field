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
import { useAppStore } from './store/useAppStore';
import './App.css';

function App() {
  const undo = useAppStore((s) => s.undo);
  const redo = useAppStore((s) => s.redo);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        redo();
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

          <Section title="数据导入">
            <ImportPanel />
          </Section>

          <Section title="导出">
            <ExportPanel />
          </Section>
        </div>
      </aside>

      <main className="canvas-area">
        <Canvas />
      </main>
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
