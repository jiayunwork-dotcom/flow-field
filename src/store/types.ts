export interface FieldElement {
  id: string;
  type: 'source' | 'sink' | 'vortex' | 'uniform';
  x: number;
  y: number;
  strength: number;
  angle?: number;
}

export interface PresetField {
  id: string;
  name: string;
  formulaX: string;
  formulaY: string;
  params: Record<string, number>;
  active: boolean;
}

export interface CustomField {
  id: string;
  name: string;
  formulaX: string;
  formulaY: string;
  active: boolean;
}

export type FieldDefinition = PresetField | CustomField;

export interface VectorFieldData {
  width: number;
  height: number;
  data: Float32Array;
}

export type VisualizationMode = 'arrows' | 'particles' | 'streamlines' | 'lic' | 'vorticity';
export type OperationMode = 'none' | 'divergence' | 'curl' | 'gradient';
export type ColormapName = 'viridis' | 'magma' | 'inferno' | 'plasma' | 'turbo';

export interface GlobalParams {
  particleCount: number;
  trailLength: number;
  speedScale: number;
  integrationStep: number;
  colormap: ColormapName;
}

export interface TimeSeriesFrame {
  data: Float32Array;
  width: number;
  height: number;
}

export interface TimeSeriesData {
  frames: TimeSeriesFrame[];
  timestamps: number[];
}

export interface AppState {
  fieldElements: FieldElement[];
  presetFields: PresetField[];
  customFields: CustomField[];
  visualizationModes: Record<VisualizationMode, boolean>;
  operationMode: OperationMode;
  globalParams: GlobalParams;
  colorRange: { min: number; max: number; locked: boolean };
  operationRange: { min: number; max: number; locked: boolean };
  importedField: VectorFieldData | null;
  timeSeriesData: TimeSeriesData | null;
  timeSeriesFrame: number;
  timeSeriesPlaying: boolean;
  timeSeriesSpeed: number;
  licDirty: boolean;
  selectedElementId: string | null;
  seedMode: 'auto' | 'manual';
  manualSeedPoints: Array<{ x: number; y: number }>;
  licStepSize: number;
  licKernelLength: number;
  arrowSpacing: number;
}
