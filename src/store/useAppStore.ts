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
} from './types';

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
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
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
    const state = get();
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
}));

const initialState = useAppStore.getState();
historyStack = [captureHistory(initialState)];
historyIndex = 0;
