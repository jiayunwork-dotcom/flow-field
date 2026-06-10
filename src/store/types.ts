export interface FieldElement {
  id: string;
  type: 'source' | 'sink' | 'vortex' | 'uniform' | 'emitter';
  x: number;
  y: number;
  strength: number;
  angle?: number;
  rate?: number;
  spreadAngle?: number;
  initialSpeed?: number;
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

export type VisualizationMode = 'arrows' | 'particles' | 'streamlines' | 'lic' | 'vorticity' | 'heatmap';
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

export interface ProbeInfo {
  vx: number;
  vy: number;
  magnitude: number;
}

export interface FieldSnapshot {
  fieldElements: FieldElement[];
  presetFields: PresetField[];
  customFields: CustomField[];
}

export interface Keyframe {
  id: string;
  time: number;
  fieldSnapshot: FieldSnapshot;
}

export const ANNOTATION_COLORS = ['#ff6b6b', '#ffd93d', '#6bcb77', '#4d96ff', '#ff922b', '#cc5de8'] as const;
export type AnnotationColor = (typeof ANNOTATION_COLORS)[number];

export interface ArrowAnnotation {
  id: string;
  type: 'arrow';
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  color: AnnotationColor;
  lineWidth: number;
  timeStart: number | null;
  timeEnd: number | null;
}

export interface TextAnnotation {
  id: string;
  type: 'text';
  x: number;
  y: number;
  text: string;
  fontSize: number;
  color: AnnotationColor;
  timeStart: number | null;
  timeEnd: number | null;
}

export interface RegionAnnotation {
  id: string;
  type: 'region';
  x: number;
  y: number;
  width: number;
  height: number;
  color: AnnotationColor;
  lineWidth: number;
  label: string;
  timeStart: number | null;
  timeEnd: number | null;
}

export type Annotation = ArrowAnnotation | TextAnnotation | RegionAnnotation;

export interface AnnotationKeyframe {
  id: string;
  annotationId: string;
  time: number;
  x: number;
  y: number;
}

export interface AnnotationTemplate {
  id: string;
  name: string;
  type: 'arrow' | 'text' | 'region';
  color: AnnotationColor;
  lineWidth?: number;
  fontSize?: number;
}

export interface Bookmark {
  id: string;
  name: string;
  time: number;
}

export interface LoopRegion {
  start: number;
  end: number;
}

export type AnnotationMode = null | 'arrow' | 'text' | 'region' | 'select';

export const SCENE_VERSION = 1;

export interface ExternalFieldRef {
  filePath: string;
  sampleParams?: Record<string, unknown>;
}

export interface SceneData {
  version: number;
  timeline: {
    duration: number;
    keyframes: Keyframe[];
  };
  annotations: Annotation[];
  annotationKeyframes: AnnotationKeyframe[];
  externalFieldRefs: ExternalFieldRef[];
}

export interface PerfStats {
  activeParticles: number;
  drawCalls: number;
  fieldTextureRes: [number, number];
  particleTexSize: [number, number];
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
  placementMode: FieldElement['type'] | null;
  heatmapOpacity: number;
  probeMode: boolean;
  probePoint: { x: number; y: number } | null;
  probeInfo: ProbeInfo | null;
  compareMode: boolean;
  compareSplit: number;
  snapshotField: VectorFieldData | null;
  perfPanelExpanded: boolean;
  perfStats: PerfStats;

  timelineDuration: number;
  timelineKeyframes: Keyframe[];
  timelineCurrentTime: number;
  timelineRecording: boolean;
  timelinePlaying: boolean;
  timelinePlaybackSpeed: number;
  timelineLoopRegion: LoopRegion | null;
  selectedKeyframeIds: string[];
  copiedKeyframes: Keyframe[];
  bookmarks: Bookmark[];
  annotationTemplates: AnnotationTemplate[];
  activeTemplateId: string | null;

  annotations: Annotation[];
  annotationKeyframes: AnnotationKeyframe[];
  selectedAnnotationId: string | null;
  annotationMode: AnnotationMode;
  externalFieldRefs: ExternalFieldRef[];
  missingExternalRefs: string[];
}
