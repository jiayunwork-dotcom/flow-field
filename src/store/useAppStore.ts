import { create } from 'zustand';
import type {
  AppState,
  FieldElement,
  PresetField,
  CustomField,
  VisualizationMode,
  OperationMode,
  ColormapName,
  VectorFieldData,
  TimeSeriesData,
  ProbeInfo,
  PerfStats,
  Keyframe,
  FieldSnapshot,
  Annotation,
  AnnotationKeyframe,
  AnnotationMode,
  AnnotationTemplate,
  Bookmark,
  LoopRegion,
  ExternalFieldRef,
  SceneData,
} from './types';
import { SCENE_VERSION } from './types';

interface HistoryEntry {
  fieldElements: FieldElement[];
  presetFields: PresetField[];
  customFields: CustomField[];
}

interface AppStore extends AppState {
  addElement: (element: FieldElement) => void;
  updateElement: (id: string, updates: Partial<FieldElement>) => void;
  removeElement: (id: string) => void;
  selectElement: (id: string | null) => void;
  togglePresetField: (id: string) => void;
  updatePresetParam: (id: string, key: string, value: number) => void;
  addCustomField: (field: CustomField) => void;
  removeCustomField: (id: string) => void;
  toggleCustomField: (id: string) => void;
  updateCustomField: (id: string, updates: Partial<CustomField>) => void;
  toggleVisualization: (mode: VisualizationMode) => void;
  setOperationMode: (mode: OperationMode) => void;
  setGlobalParam: <K extends keyof AppState['globalParams']>(
    key: K,
    value: AppState['globalParams'][K]
  ) => void;
  setColormap: (cmap: ColormapName) => void;
  setColorRange: (range: Partial<AppState['colorRange']>) => void;
  setOperationRange: (range: Partial<AppState['operationRange']>) => void;
  setImportedField: (field: VectorFieldData | null) => void;
  setTimeSeriesData: (data: TimeSeriesData | null) => void;
  setTimeSeriesFrame: (frame: number) => void;
  setTimeSeriesPlaying: (playing: boolean) => void;
  setTimeSeriesSpeed: (speed: number) => void;
  markLicDirty: () => void;
  clearLicDirty: () => void;
  setSeedMode: (mode: 'auto' | 'manual') => void;
  addSeedPoint: (p: { x: number; y: number }) => void;
  clearSeedPoints: () => void;
  setLicParams: (stepSize?: number, kernelLength?: number) => void;
  setArrowSpacing: (spacing: number) => void;
  setPlacementMode: (mode: FieldElement['type'] | null) => void;
  setHeatmapOpacity: (opacity: number) => void;
  setProbeMode: (mode: boolean) => void;
  setProbePoint: (point: { x: number; y: number } | null) => void;
  setProbeInfo: (info: ProbeInfo | null) => void;
  setCompareMode: (mode: boolean) => void;
  setCompareSplit: (split: number) => void;
  saveSnapshot: (field: VectorFieldData) => void;
  setPerfPanelExpanded: (expanded: boolean) => void;
  setPerfStats: (stats: Partial<PerfStats>) => void;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;

  setTimelineDuration: (d: number) => void;
  setTimelineCurrentTime: (t: number) => void;
  setTimelineRecording: (r: boolean) => void;
  setTimelinePlaying: (p: boolean) => void;
  setTimelinePlaybackSpeed: (speed: number) => void;
  setTimelineLoopRegion: (region: LoopRegion | null) => void;
  setSelectedKeyframeIds: (ids: string[]) => void;
  setCopiedKeyframes: (kfs: Keyframe[]) => void;
  removeTimelineKeyframes: (ids: string[]) => void;
  moveTimelineKeyframes: (idToDelta: Record<string, number>) => void;
  addTimelineKeyframes: (kfs: Keyframe[]) => void;
  addTimelineKeyframe: (kf: Keyframe) => void;
  removeTimelineKeyframe: (id: string) => void;
  moveTimelineKeyframe: (id: string, newTime: number) => void;
  insertManualKeyframe: () => void;
  captureFieldSnapshot: () => FieldSnapshot;
  restoreFieldSnapshot: (snap: FieldSnapshot) => void;
  interpolateAndRestore: (time: number) => void;

  addBookmark: (bookmark: Bookmark) => void;
  removeBookmark: (id: string) => void;
  renameBookmark: (id: string, name: string) => void;

  addAnnotationTemplate: (template: AnnotationTemplate) => void;
  removeAnnotationTemplate: (id: string) => void;
  setActiveTemplateId: (id: string | null) => void;

  addAnnotation: (a: Annotation) => void;
  updateAnnotation: (id: string, updates: Partial<Annotation>) => void;
  removeAnnotation: (id: string) => void;
  selectAnnotation: (id: string | null) => void;
  setAnnotationMode: (mode: AnnotationMode) => void;
  addAnnotationKeyframe: (kf: AnnotationKeyframe) => void;
  removeAnnotationKeyframe: (id: string) => void;
  updateAnnotationKeyframe: (id: string, updates: Partial<AnnotationKeyframe>) => void;
  insertAnnotationPositionFrame: (annotationId: string) => void;

  exportScene: () => SceneData;
  importScene: (data: unknown) => { success: boolean; errors: string[] };
  setExternalFieldRefs: (refs: ExternalFieldRef[]) => void;
  setMissingExternalRefs: (refs: string[]) => void;
}

const DEFAULT_PRESETS: PresetField[] = [
  {
    id: 'uniform',
    name: '均匀流 (Uniform)',
    formulaX: 'a',
    formulaY: '0',
    params: { a: 1.0 },
    active: true,
  },
  {
    id: 'rotation',
    name: '旋转场 (Rotation)',
    formulaX: '-y*a',
    formulaY: 'x*a',
    params: { a: 1.0 },
    active: false,
  },
  {
    id: 'divergence',
    name: '辐散场 (Divergence)',
    formulaX: 'x*a',
    formulaY: 'y*a',
    params: { a: 1.0 },
    active: false,
  },
  {
    id: 'dipole',
    name: '偶极子 (Dipole)',
    formulaX: '2*x*y*a/(x*x+y*y+0.01)',
    formulaY: '(y*y-x*x)*a/(x*x+y*y+0.01)',
    params: { a: 1.0 },
    active: false,
  },
  {
    id: 'saddle',
    name: '鞍点场 (Saddle)',
    formulaX: 'x*a',
    formulaY: '-y*a',
    params: { a: 1.0 },
    active: false,
  },
];

const MAX_HISTORY = 50;
let historyStack: HistoryEntry[] = [];
let historyIndex = -1;

function captureHistory(state: AppState): HistoryEntry {
  return {
    fieldElements: JSON.parse(JSON.stringify(state.fieldElements)),
    presetFields: JSON.parse(JSON.stringify(state.presetFields)),
    customFields: JSON.parse(JSON.stringify(state.customFields)),
  };
}

function pushHistory(state: AppState) {
  const entry = captureHistory(state);
  if (historyIndex < historyStack.length - 1) {
    historyStack = historyStack.slice(0, historyIndex + 1);
  }
  historyStack.push(entry);
  if (historyStack.length > MAX_HISTORY) {
    historyStack.shift();
  }
  historyIndex = historyStack.length - 1;
}

let _nextKfId = 1;
function genKfId() { return `kf_${_nextKfId++}_${Date.now()}`; }

function interpolateFieldSnapshot(a: FieldSnapshot, b: FieldSnapshot, t: number): FieldSnapshot {
  const elements: FieldElement[] = [];
  const byIdA = new Map(a.fieldElements.map((e) => [e.id, e]));
  const byIdB = new Map(b.fieldElements.map((e) => [e.id, e]));
  const allIds = new Set([...byIdA.keys(), ...byIdB.keys()]);
  for (const id of allIds) {
    const ea = byIdA.get(id);
    const eb = byIdB.get(id);
    if (ea && eb) {
      elements.push({
        ...ea,
        x: ea.x + (eb.x - ea.x) * t,
        y: ea.y + (eb.y - ea.y) * t,
        strength: ea.strength + (eb.strength - ea.strength) * t,
        angle: ea.angle !== undefined && eb.angle !== undefined
          ? ea.angle + (eb.angle - ea.angle) * t
          : ea.angle ?? eb.angle,
        rate: ea.rate !== undefined && eb.rate !== undefined
          ? ea.rate + (eb.rate - ea.rate) * t
          : ea.rate ?? eb.rate,
        spreadAngle: ea.spreadAngle !== undefined && eb.spreadAngle !== undefined
          ? ea.spreadAngle + (eb.spreadAngle - ea.spreadAngle) * t
          : ea.spreadAngle ?? eb.spreadAngle,
        initialSpeed: ea.initialSpeed !== undefined && eb.initialSpeed !== undefined
          ? ea.initialSpeed + (eb.initialSpeed - ea.initialSpeed) * t
          : ea.initialSpeed ?? eb.initialSpeed,
      });
    } else {
      elements.push(JSON.parse(JSON.stringify(ea ?? eb)));
    }
  }

  const presetFields: PresetField[] = a.presetFields.map((pf) => {
    const bf = b.presetFields.find((f) => f.id === pf.id);
    if (!bf) return JSON.parse(JSON.stringify(pf));
    return {
      ...pf,
      active: t >= 0.5 ? bf.active : pf.active,
      params: Object.fromEntries(
        Object.keys(pf.params).map((k) => [k, pf.params[k] + ((bf.params[k] ?? pf.params[k]) - pf.params[k]) * t])
      ),
    };
  });

  const customFields: CustomField[] = a.customFields.map((cf) => {
    const bf = b.customFields.find((f) => f.id === cf.id);
    if (!bf) return JSON.parse(JSON.stringify(cf));
    return { ...cf, active: t >= 0.5 ? bf.active : cf.active };
  });

  return { fieldElements: elements, presetFields, customFields };
}

function validateSceneData(data: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!data || typeof data !== 'object') {
    errors.push('数据不是有效的JSON对象');
    return { valid: false, errors };
  }
  const d = data as Record<string, unknown>;
  if (typeof d.version !== 'number') {
    errors.push('缺少必需字段 "version" 或类型错误 (应为 number)');
  }
  if (!d.timeline || typeof d.timeline !== 'object') {
    errors.push('缺少必需字段 "timeline" 或类型错误 (应为 object)');
  } else {
    const tl = d.timeline as Record<string, unknown>;
    if (typeof tl.duration !== 'number') {
      errors.push('timeline.duration 缺少或类型错误 (应为 number)');
    }
    if (!Array.isArray(tl.keyframes)) {
      errors.push('timeline.keyframes 缺少或类型错误 (应为 array)');
    } else {
      tl.keyframes.forEach((kf: unknown, i: number) => {
        if (!kf || typeof kf !== 'object') {
          errors.push(`timeline.keyframes[${i}] 不是有效对象`);
        } else {
          const k = kf as Record<string, unknown>;
          if (typeof k.time !== 'number') errors.push(`timeline.keyframes[${i}].time 缺少或类型错误`);
          if (!k.fieldSnapshot || typeof k.fieldSnapshot !== 'object') {
            errors.push(`timeline.keyframes[${i}].fieldSnapshot 缺少或类型错误`);
          }
        }
      });
    }
  }
  if (!Array.isArray(d.annotations)) {
    errors.push('缺少必需字段 "annotations" 或类型错误 (应为 array)');
  } else {
    (d.annotations as unknown[]).forEach((a: unknown, i: number) => {
      if (!a || typeof a !== 'object') {
        errors.push(`annotations[${i}] 不是有效对象`);
      } else {
        const ann = a as Record<string, unknown>;
        if (!['arrow', 'text', 'region'].includes(ann.type as string)) {
          errors.push(`annotations[${i}].type 无效: "${String(ann.type)}"`);
        }
      }
    });
  }
  if (d.annotationKeyframes !== undefined && !Array.isArray(d.annotationKeyframes)) {
    errors.push('annotationKeyframes 类型错误 (应为 array)');
  }
  if (d.externalFieldRefs !== undefined && !Array.isArray(d.externalFieldRefs)) {
    errors.push('externalFieldRefs 类型错误 (应为 array)');
  }
  return { valid: errors.length === 0, errors };
}

export const useAppStore = create<AppStore>((set, get) => ({
  fieldElements: [],
  presetFields: DEFAULT_PRESETS,
  customFields: [],
  visualizationModes: {
    arrows: false,
    particles: true,
    streamlines: false,
    lic: false,
    vorticity: false,
    heatmap: false,
  },
  operationMode: 'none',
  globalParams: {
    particleCount: 50000,
    trailLength: 30,
    speedScale: 1.0,
    integrationStep: 0.01,
    colormap: 'viridis',
  },
  colorRange: { min: 0, max: 1, locked: false },
  operationRange: { min: -1, max: 1, locked: false },
  importedField: null,
  timeSeriesData: null,
  timeSeriesFrame: 0,
  timeSeriesPlaying: false,
  timeSeriesSpeed: 1.0,
  licDirty: true,
  selectedElementId: null,
  seedMode: 'auto',
  manualSeedPoints: [],
  licStepSize: 0.005,
  licKernelLength: 20,
  arrowSpacing: 30,
  placementMode: null,
  heatmapOpacity: 0.5,
  probeMode: false,
  probePoint: null,
  probeInfo: null,
  compareMode: false,
  compareSplit: 0.5,
  snapshotField: null,
  perfPanelExpanded: false,
  perfStats: {
    activeParticles: 0,
    drawCalls: 0,
    fieldTextureRes: [1024, 1024],
    particleTexSize: [256, 256],
  },

  timelineDuration: 30,
  timelineKeyframes: [],
  timelineCurrentTime: 0,
  timelineRecording: false,
  timelinePlaying: false,
  timelinePlaybackSpeed: 1,
  timelineLoopRegion: null,
  selectedKeyframeIds: [],
  copiedKeyframes: [],
  bookmarks: [],
  annotationTemplates: [],
  activeTemplateId: null,

  annotations: [],
  annotationKeyframes: [],
  selectedAnnotationId: null,
  annotationMode: null,
  externalFieldRefs: [],
  missingExternalRefs: [],

  addElement: (element) =>
    set((s) => {
      pushHistory(s);
      return { fieldElements: [...s.fieldElements, element], licDirty: true };
    }),

  updateElement: (id, updates) =>
    set((s) => {
      pushHistory(s);
      return {
        fieldElements: s.fieldElements.map((e) =>
          e.id === id ? { ...e, ...updates } : e
        ),
        licDirty: true,
      };
    }),

  removeElement: (id) =>
    set((s) => {
      pushHistory(s);
      return {
        fieldElements: s.fieldElements.filter((e) => e.id !== id),
        licDirty: true,
        selectedElementId: s.selectedElementId === id ? null : s.selectedElementId,
      };
    }),

  selectElement: (id) => set({ selectedElementId: id }),

  togglePresetField: (id) =>
    set((s) => ({
      presetFields: s.presetFields.map((f) =>
        f.id === id ? { ...f, active: !f.active } : f
      ),
      licDirty: true,
    })),

  updatePresetParam: (id, key, value) =>
    set((s) => ({
      presetFields: s.presetFields.map((f) =>
        f.id === id
          ? { ...f, params: { ...f.params, [key]: value } }
          : f
      ),
      licDirty: true,
    })),

  addCustomField: (field) =>
    set((s) => {
      pushHistory(s);
      return { customFields: [...s.customFields, field], licDirty: true };
    }),

  removeCustomField: (id) =>
    set((s) => {
      pushHistory(s);
      return {
        customFields: s.customFields.filter((f) => f.id !== id),
        licDirty: true,
      };
    }),

  toggleCustomField: (id) =>
    set((s) => ({
      customFields: s.customFields.map((f) =>
        f.id === id ? { ...f, active: !f.active } : f
      ),
      licDirty: true,
    })),

  updateCustomField: (id, updates) =>
    set((s) => ({
      customFields: s.customFields.map((f) =>
        f.id === id ? { ...f, ...updates } : f
      ),
      licDirty: true,
    })),

  toggleVisualization: (mode) =>
    set((s) => ({
      visualizationModes: {
        ...s.visualizationModes,
        [mode]: !s.visualizationModes[mode],
      },
    })),

  setOperationMode: (mode) => set({ operationMode: mode }),

  setGlobalParam: (key, value) =>
    set((s) => ({
      globalParams: { ...s.globalParams, [key]: value },
    })),

  setColormap: (cmap) =>
    set((s) => ({ globalParams: { ...s.globalParams, colormap: cmap } })),

  setColorRange: (range) =>
    set((s) => ({ colorRange: { ...s.colorRange, ...range } })),

  setOperationRange: (range) =>
    set((s) => ({ operationRange: { ...s.operationRange, ...range } })),

  setImportedField: (field) => set({ importedField: field, licDirty: true }),

  setTimeSeriesData: (data) =>
    set({ timeSeriesData: data, timeSeriesFrame: 0, licDirty: true }),

  setTimeSeriesFrame: (frame) => set({ timeSeriesFrame: frame, licDirty: true }),

  setTimeSeriesPlaying: (playing) => set({ timeSeriesPlaying: playing }),

  setTimeSeriesSpeed: (speed) => set({ timeSeriesSpeed: speed }),

  markLicDirty: () => set({ licDirty: true }),

  clearLicDirty: () => set({ licDirty: false }),

  setSeedMode: (mode) => set({ seedMode: mode }),

  addSeedPoint: (p) =>
    set((s) => ({ manualSeedPoints: [...s.manualSeedPoints, p] })),

  clearSeedPoints: () => set({ manualSeedPoints: [] }),

  setLicParams: (stepSize, kernelLength) =>
    set((s) => ({
      licStepSize: stepSize ?? s.licStepSize,
      licKernelLength: kernelLength ?? s.licKernelLength,
      licDirty: true,
    })),

  setArrowSpacing: (spacing) => set({ arrowSpacing: spacing }),

  setPlacementMode: (mode) => set({ placementMode: mode }),

  setHeatmapOpacity: (opacity) => set({ heatmapOpacity: opacity }),

  setProbeMode: (mode) => set({ probeMode: mode }),

  setProbePoint: (point) => set({ probePoint: point }),

  setProbeInfo: (info) => set({ probeInfo: info }),

  setCompareMode: (mode) => set({ compareMode: mode }),

  setCompareSplit: (split) => set({ compareSplit: split }),

  saveSnapshot: (field) => set({ snapshotField: field }),

  setPerfPanelExpanded: (expanded) => set({ perfPanelExpanded: expanded }),

  setPerfStats: (stats) =>
    set((s) => ({ perfStats: { ...s.perfStats, ...stats } })),

  undo: () => {
    if (historyIndex <= 0) return;
    historyIndex--;
    const entry = historyStack[historyIndex];
    set({
      fieldElements: JSON.parse(JSON.stringify(entry.fieldElements)),
      presetFields: JSON.parse(JSON.stringify(entry.presetFields)),
      customFields: JSON.parse(JSON.stringify(entry.customFields)),
      licDirty: true,
    });
  },

  redo: () => {
    if (historyIndex >= historyStack.length - 1) return;
    historyIndex++;
    const entry = historyStack[historyIndex];
    set({
      fieldElements: JSON.parse(JSON.stringify(entry.fieldElements)),
      presetFields: JSON.parse(JSON.stringify(entry.presetFields)),
      customFields: JSON.parse(JSON.stringify(entry.customFields)),
      licDirty: true,
    });
  },

  canUndo: () => historyIndex > 0,
  canRedo: () => historyIndex < historyStack.length - 1,

  setTimelineDuration: (d) => set({ timelineDuration: Math.max(1, Math.min(120, d)) }),

  setTimelineCurrentTime: (t) => set({ timelineCurrentTime: Math.max(0, Math.min(get().timelineDuration, t)) }),

  setTimelineRecording: (r) => set({ timelineRecording: r }),

  setTimelinePlaying: (p) => set({ timelinePlaying: p }),

  setTimelinePlaybackSpeed: (speed) => set({ timelinePlaybackSpeed: speed }),

  setTimelineLoopRegion: (region) => set({ timelineLoopRegion: region }),

  setSelectedKeyframeIds: (ids) => set({ selectedKeyframeIds: ids }),

  setCopiedKeyframes: (kfs) => set({ copiedKeyframes: kfs }),

  removeTimelineKeyframes: (ids) =>
    set((s) => {
      const idSet = new Set(ids);
      const kfs = s.timelineKeyframes.filter((k) => !idSet.has(k.id));
      let newDuration = s.timelineDuration;
      if (kfs.length === 0) newDuration = 30;
      return { timelineKeyframes: kfs, selectedKeyframeIds: [], timelineDuration: newDuration };
    }),

  moveTimelineKeyframes: (idToDelta) =>
    set((s) => ({
      timelineKeyframes: s.timelineKeyframes
        .map((k) => {
          const delta = idToDelta[k.id];
          if (delta === undefined) return k;
          return { ...k, time: Math.max(0, Math.min(s.timelineDuration, k.time + delta)) };
        })
        .sort((a, b) => a.time - b.time),
    })),

  addTimelineKeyframes: (kfs) =>
    set((s) => ({
      timelineKeyframes: [...s.timelineKeyframes, ...kfs].sort((a, b) => a.time - b.time),
    })),

  addTimelineKeyframe: (kf) =>
    set((s) => ({
      timelineKeyframes: [...s.timelineKeyframes, kf].sort((a, b) => a.time - b.time),
    })),

  removeTimelineKeyframe: (id) =>
    set((s) => {
      const kfs = s.timelineKeyframes.filter((k) => k.id !== id);
      let newDuration = s.timelineDuration;
      if (kfs.length > 0) {
        const minT = kfs[0].time;
        const maxT = kfs[kfs.length - 1].time;
        if (s.timelineCurrentTime < minT) set({ timelineCurrentTime: minT });
        if (s.timelineCurrentTime > maxT) set({ timelineCurrentTime: maxT });
      }
      if (kfs.length === 0) {
        newDuration = 30;
      }
      return { timelineKeyframes: kfs, timelineDuration: newDuration };
    }),

  moveTimelineKeyframe: (id, newTime) =>
    set((s) => ({
      timelineKeyframes: s.timelineKeyframes
        .map((k) => (k.id === id ? { ...k, time: Math.max(0, Math.min(s.timelineDuration, newTime)) } : k))
        .sort((a, b) => a.time - b.time),
    })),

  insertManualKeyframe: () => {
    const s = get();
    if (s.timelinePlaying) return;
    const snap = get().captureFieldSnapshot();
    const kf: Keyframe = {
      id: genKfId(),
      time: s.timelineCurrentTime,
      fieldSnapshot: snap,
    };
    set((st) => ({
      timelineKeyframes: [...st.timelineKeyframes, kf].sort((a, b) => a.time - b.time),
    }));
  },

  captureFieldSnapshot: () => {
    const s = get();
    return {
      fieldElements: JSON.parse(JSON.stringify(s.fieldElements)),
      presetFields: JSON.parse(JSON.stringify(s.presetFields)),
      customFields: JSON.parse(JSON.stringify(s.customFields)),
    };
  },

  restoreFieldSnapshot: (snap) => {
    set({
      fieldElements: JSON.parse(JSON.stringify(snap.fieldElements)),
      presetFields: JSON.parse(JSON.stringify(snap.presetFields)),
      customFields: JSON.parse(JSON.stringify(snap.customFields)),
      licDirty: true,
    });
  },

  interpolateAndRestore: (time) => {
    const s = get();
    const kfs = s.timelineKeyframes;
    if (kfs.length === 0) return;

    if (time <= kfs[0].time) {
      s.restoreFieldSnapshot(kfs[0].fieldSnapshot);
      return;
    }
    if (time >= kfs[kfs.length - 1].time) {
      s.restoreFieldSnapshot(kfs[kfs.length - 1].fieldSnapshot);
      return;
    }

    let prev = kfs[0];
    let next = kfs[kfs.length - 1];
    for (let i = 0; i < kfs.length - 1; i++) {
      if (time >= kfs[i].time && time <= kfs[i + 1].time) {
        prev = kfs[i];
        next = kfs[i + 1];
        break;
      }
    }

    const span = next.time - prev.time;
    const t = span > 0 ? (time - prev.time) / span : 0;
    const interpolated = interpolateFieldSnapshot(prev.fieldSnapshot, next.fieldSnapshot, t);
    s.restoreFieldSnapshot(interpolated);
  },

  addBookmark: (bookmark) =>
    set((s) => ({ bookmarks: [...s.bookmarks, bookmark] })),

  removeBookmark: (id) =>
    set((s) => ({ bookmarks: s.bookmarks.filter((b) => b.id !== id) })),

  renameBookmark: (id, name) =>
    set((s) => ({
      bookmarks: s.bookmarks.map((b) => (b.id === id ? { ...b, name } : b)),
    })),

  addAnnotationTemplate: (template) =>
    set((s) => ({ annotationTemplates: [...s.annotationTemplates, template] })),

  removeAnnotationTemplate: (id) =>
    set((s) => ({
      annotationTemplates: s.annotationTemplates.filter((t) => t.id !== id),
      activeTemplateId: s.activeTemplateId === id ? null : s.activeTemplateId,
    })),

  setActiveTemplateId: (id) => set({ activeTemplateId: id }),

  addAnnotation: (a) =>
    set((s) => ({ annotations: [...s.annotations, a] })),

  updateAnnotation: (id, updates) =>
    set((s) => ({
      annotations: s.annotations.map((a) =>
        a.id === id ? { ...a, ...updates } as Annotation : a
      ),
    })),

  removeAnnotation: (id) =>
    set((s) => ({
      annotations: s.annotations.filter((a) => a.id !== id),
      annotationKeyframes: s.annotationKeyframes.filter((k) => k.annotationId !== id),
      selectedAnnotationId: s.selectedAnnotationId === id ? null : s.selectedAnnotationId,
    })),

  selectAnnotation: (id) => set({ selectedAnnotationId: id }),

  setAnnotationMode: (mode) => set({ annotationMode: mode }),

  addAnnotationKeyframe: (kf) =>
    set((s) => ({
      annotationKeyframes: [...s.annotationKeyframes, kf].sort((a, b) => a.time - b.time),
    })),

  removeAnnotationKeyframe: (id) =>
    set((s) => ({
      annotationKeyframes: s.annotationKeyframes.filter((k) => k.id !== id),
    })),

  updateAnnotationKeyframe: (id, updates) =>
    set((s) => ({
      annotationKeyframes: s.annotationKeyframes.map((k) =>
        k.id === id ? { ...k, ...updates } : k
      ),
    })),

  insertAnnotationPositionFrame: (annotationId) => {
    const s = get();
    const ann = s.annotations.find((a) => a.id === annotationId);
    if (!ann) return;
    let x: number, y: number;
    if (ann.type === 'arrow') {
      x = (ann.startX + ann.endX) / 2;
      y = (ann.startY + ann.endY) / 2;
    } else if (ann.type === 'region') {
      x = ann.x + ann.width / 2;
      y = ann.y + ann.height / 2;
    } else {
      x = ann.x;
      y = ann.y;
    }
    const kf: AnnotationKeyframe = {
      id: genKfId(),
      annotationId,
      time: s.timelineCurrentTime,
      x,
      y,
    };
    set((st) => ({
      annotationKeyframes: [...st.annotationKeyframes, kf].sort((a, b) => a.time - b.time),
    }));
  },

  exportScene: () => {
    const s = get();
    return {
      version: SCENE_VERSION,
      timeline: {
        duration: s.timelineDuration,
        keyframes: s.timelineKeyframes,
      },
      annotations: s.annotations,
      annotationKeyframes: s.annotationKeyframes,
      externalFieldRefs: s.externalFieldRefs,
    };
  },

  importScene: (data: unknown) => {
    const validation = validateSceneData(data);
    if (!validation.valid) {
      return { success: false, errors: validation.errors };
    }
    const d = data as SceneData;
    if (d.version > SCENE_VERSION) {
      return { success: false, errors: [`场景版本 ${d.version} 高于当前版本 ${SCENE_VERSION}，无法导入`] };
    }

    let migratedData = d;
    if (d.version < SCENE_VERSION) {
      migratedData = {
        ...d,
        version: SCENE_VERSION,
        annotationKeyframes: d.annotationKeyframes ?? [],
        externalFieldRefs: d.externalFieldRefs ?? [],
      };
    }

    const missing: string[] = [];
    if (migratedData.externalFieldRefs) {
      for (const ref of migratedData.externalFieldRefs) {
        missing.push(ref.filePath);
      }
    }

    set({
      timelineDuration: migratedData.timeline.duration,
      timelineKeyframes: migratedData.timeline.keyframes,
      timelineCurrentTime: 0,
      timelineRecording: false,
      timelinePlaying: false,
      annotations: migratedData.annotations,
      annotationKeyframes: migratedData.annotationKeyframes,
      externalFieldRefs: migratedData.externalFieldRefs ?? [],
      missingExternalRefs: missing,
      selectedAnnotationId: null,
      licDirty: true,
    });

    if (migratedData.timeline.keyframes.length > 0) {
      get().restoreFieldSnapshot(migratedData.timeline.keyframes[0].fieldSnapshot);
    }

    return { success: true, errors: [] };
  },

  setExternalFieldRefs: (refs) => set({ externalFieldRefs: refs }),

  setMissingExternalRefs: (refs) => set({ missingExternalRefs: refs }),
}));

const initialState = useAppStore.getState();
historyStack = [captureHistory(initialState)];
historyIndex = 0;
