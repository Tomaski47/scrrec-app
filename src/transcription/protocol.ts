export const MODELS = {
  // These companion-app exports include cross-attention outputs for word timing.
  tiny: { id: 'Xenova/whisper-tiny.en', revision: '79fb389fc764e7c395bd330e9531d9d32ada7049' },
  base: { id: 'Xenova/whisper-base.en', revision: '95bf40a508535962c6483ead40270b2e32267508' },
} as const;
export const RETIRED_MODELS = [
  { id: 'onnx-community/whisper-tiny.en', revision: '2575352d61be1bf7225cf8f8b268a4678025fc58' },
  { id: 'onnx-community/whisper-base.en', revision: '51eefc0af78b103839eda9e7e4f4186acc6517fe' },
] as const;
export type Model = keyof typeof MODELS;
export type Device = 'wasm' | 'webgpu';
export type Request = { type: 'load'; model: Model; device: Device }
  | { type: 'transcribe'; id: number; audio: Float32Array; overlap: number };
export type Response = { type: 'progress'; file: string; loaded: number; total: number }
  | { type: 'ready'; ms: number }
  | { type: 'result'; id: number; text: string; ms: number; words: Word[]; retried: boolean; review: boolean }
  | { type: 'error'; message: string };
export interface Segment { id: number; start: number; end: number; audio: Float32Array; utterance: number; overlap: number; final: boolean }
export interface Word { text: string; start: number; end: number }
export interface Transcript { id: number; start: number; end: number; text: string; inferenceMs: number; words: Word[]; final: boolean; revisions: number; boundaryReview: boolean; recognitionReview?: boolean }
