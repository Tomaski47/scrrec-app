export const MODELS = {
  tiny: { id: 'onnx-community/whisper-tiny.en', revision: '2575352d61be1bf7225cf8f8b268a4678025fc58' },
  base: { id: 'onnx-community/whisper-base.en', revision: '51eefc0af78b103839eda9e7e4f4186acc6517fe' },
} as const;
export type Model = keyof typeof MODELS;
export type Device = 'wasm' | 'webgpu';
export type Request = { type: 'load'; model: Model; device: Device }
  | { type: 'transcribe'; id: number; audio: Float32Array };
export type Response = { type: 'progress'; file: string; loaded: number; total: number }
  | { type: 'ready'; ms: number }
  | { type: 'result'; id: number; text: string; ms: number }
  | { type: 'error'; message: string };
export interface Segment { id: number; start: number; end: number; audio: Float32Array }
export interface Transcript { id: number; start: number; end: number; text: string; inferenceMs: number }
