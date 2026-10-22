import { useEffect, useRef, useState } from 'react';
import { emptySpeech, TranscriptionController } from './controller';

export function useLocalTranscription() {
  const controller = useRef<TranscriptionController | null>(null);
  const [speech, setSpeech] = useState(emptySpeech);
  useEffect(() => {
    const engine = new TranscriptionController({ revision: import.meta.env.VITE_BUILD_REVISION });
    controller.current = engine;
    const unsubscribe = engine.subscribe(setSpeech);
    return () => { unsubscribe(); engine.dispose(); controller.current = null; };
  }, []);
  return { controller, speech };
}
