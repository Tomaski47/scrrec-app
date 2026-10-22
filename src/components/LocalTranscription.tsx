import { useEffect, useRef, useState } from 'react';
import { sessionText, type SpeechSession, type SpeechSnapshot } from '../transcription/controller';
import { MODELS, RETIRED_MODELS } from '../transcription/protocol';
import './LocalTranscription.css';

interface Props { enabled: boolean; setEnabled: (enabled: boolean) => void; recording: boolean; hasMic: boolean; speech: SpeechSnapshot; prepare: () => void; unload: () => void }
export function LocalTranscription({ enabled, setEnabled, recording, hasMic, speech, prepare, unload }: Props) {
  const [cacheMessage, setCacheMessage] = useState('');
  const removeCache = async () => {
    try {
      let removed = 0;
      for (const name of await caches.keys()) {
        const cache = await caches.open(name);
        for (const request of await cache.keys()) {
          const url = new URL(request.url);
          if (url.hostname === 'huggingface.co' && [...Object.values(MODELS), ...RETIRED_MODELS].some(model => url.pathname.startsWith(`/${model.id}/resolve/${model.revision}/`))) {
            if (await cache.delete(request)) removed++;
          }
        }
      }
      setCacheMessage(`Removed ${removed} cached model files. Browser runtime caching is separate.`);
    } catch { setCacheMessage('Could not remove cached models in this browser.'); }
  };
  return <section className="local-transcription" aria-labelledby="speech-heading">
    <label className="speech-toggle"><input type="checkbox" checked={enabled} disabled={recording} onChange={event => setEnabled(event.target.checked)} />
      <span id="speech-heading">Local transcription <small>Optional · English · Beta</small></span>
    </label>
    {enabled && <div className="speech-setup">
      <p>Get a transcript alongside your recording using the selected microphone{hasMic ? '' : ' — select Mic above'}. Audio and text stay on this device. Keep this tab open and in the foreground.</p>
      <p>Tiny speech model · about 60 MB on first preparation, downloaded from Hugging Face and cached when available. Recording works independently.</p>
      <div className="speech-actions">
        <button className="speech-button" disabled={recording || speech.modelStatus === 'loading' || speech.modelStatus === 'ready'} onClick={prepare}>{speech.modelStatus === 'loading' ? 'Preparing…' : speech.modelStatus === 'ready' ? 'Model ready' : 'Prepare local transcription'}</button>
        {(speech.modelStatus === 'ready' || speech.modelStatus === 'loading') && <button className="speech-button" onClick={unload}>{recording ? 'Stop transcription' : 'Unload model'}</button>}
        {!recording && speech.modelStatus !== 'ready' && speech.modelStatus !== 'loading' && <button className="speech-button" onClick={() => void removeCache()}>Remove cached models</button>}
      </div>
      <p className="speech-status" role="status">{speech.message}{cacheMessage && ` ${cacheMessage}`}</p>
      <p className="speech-footnote">Review names and important details. Save recordings and transcripts before closing this tab. <a href={`${import.meta.env.BASE_URL}licenses/README.txt`} target="_blank" rel="noreferrer">Speech engine notices</a></p>
    </div>}
  </section>;
}

const time = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
function TranscriptCard({ session }: { session: SpeechSession }) {
  const [visible, setVisible] = useState(20);
  const [feedback, setFeedback] = useState('');
  const textRef = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
  useEffect(() => {
    const text = textRef.current;
    if (text && follow.current) text.scrollTop = text.scrollHeight;
  }, [session.blocks, session.draft]);
  const download = (json: boolean) => {
    const body = json ? JSON.stringify({ ...session, runtime: 'transformers.js 4.3.0', text: sessionText(session) }, null, 2) : sessionText(session);
    const url = URL.createObjectURL(new Blob([body], { type: json ? 'application/json' : 'text/plain;charset=utf-8' }));
    const anchor = document.createElement('a'); anchor.href = url;
    anchor.download = `transcript-${session.createdAt.replace(/[:.]/g, '-')}.${json ? 'json' : 'txt'}`; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  };
  return <article className="local-transcription transcript-card" id={`transcript-${session.id}`}>
    <div className="speech-title"><h3>Session transcript</h3><span>{session.incomplete ? 'Incomplete' : session.finished ? 'Finished' : session.capturing ? 'Listening' : 'Finishing…'}</span></div>
    <p>{new Date(session.createdAt).toLocaleString()} · {session.source}</p>
    {session.incomplete && <p role="status">{session.incomplete}</p>}
    <div className="transcript-text" ref={textRef} onScroll={event => {
      const text = event.currentTarget;
      follow.current = text.scrollHeight - text.clientHeight - text.scrollTop < 60;
    }}>
      {session.blocks.length > visible && <button className="speech-button" onClick={() => { follow.current = false; setVisible(value => value + 20); }}>Show earlier paragraphs</button>}
      {session.blocks.slice(-visible).map(block => <p key={block.id}><span className="speech-time">{time(block.start)}{(block.boundaryReview || block.recognitionReview) && ' · review'}</span>{block.text.trim()}</p>)}
      {session.draft && <p className="speech-draft"><span className="speech-time">Draft ending · may change</span>{session.draft}</p>}
      {!session.blocks.length && !session.draft && <p>Text appears after a phrase or about 12 seconds of continuous speech.</p>}
    </div>
    <div className="speech-actions">
      <button className="speech-button" onClick={() => {
        if (!navigator.clipboard?.writeText) { setFeedback('Copy unavailable. Use Save TXT.'); return; }
        void navigator.clipboard.writeText(sessionText(session)).then(() => setFeedback('Copied.'), () => setFeedback('Copy unavailable. Use Save TXT.'));
      }}>Copy text</button>
      <button className="speech-button" onClick={() => download(false)}>Save TXT</button>
      <button className="speech-button" onClick={() => download(true)}>Save JSON</button>
    </div>
    <span role="status">{feedback}</span>
  </article>;
}
export function SessionTranscripts({ sessions }: { sessions: SpeechSession[] }) {
  return <div className="session-transcripts">{sessions.map(session => <TranscriptCard key={session.id} session={session} />)}</div>;
}
