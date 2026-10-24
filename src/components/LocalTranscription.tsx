import { useEffect, useId, useRef, useState } from 'react';
import { sessionText, type SpeechSession, type SpeechSnapshot } from '../transcription/controller';
import { MODELS, RETIRED_MODELS } from '../transcription/protocol';
import { TranscriptionLicenses } from './TranscriptionLicenses';
import './LocalTranscription.css';

interface Props { enabled: boolean; setEnabled: (enabled: boolean) => void; recording: boolean; hasMic: boolean; speech: SpeechSnapshot; prepare: () => void; unload: () => void; resume: () => void }
export function LocalTranscription({ enabled, setEnabled, recording, hasMic, speech, prepare, unload, resume }: Props) {
  const [cacheMessage, setCacheMessage] = useState('');
  const [removing, setRemoving] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const panelId = useId();
  const paused = recording && enabled && speech.sessions.some(session => session.capturing && session.paused);
  const modelLabel = speech.modelStatus === 'ready' ? 'Loaded' : speech.modelStatus === 'loading' ? 'Loading' : speech.modelStatus === 'error' ? 'Error' : 'Not loaded';
  const removeCache = async () => {
    unload();
    setRemoving(true);
    setCacheMessage('Removing downloaded transcription model…');
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
      setCacheMessage(removed ? 'Cached transcription model files removed.' : 'No downloaded transcription model was found.');
    } catch { setCacheMessage('Could not remove the downloaded transcription model in this browser.'); }
    finally { setRemoving(false); }
  };
  return <div className="transcription-control">
    <section className={`option-block transcription-option${enabled ? ' has-submenu' : ''}`} aria-labelledby="speech-heading">
      <label className="options-checkbox"><input className="styled-checkbox" type="checkbox" aria-label="Local transcription" checked={enabled} disabled={recording || removing} onChange={event => { setCacheMessage(''); setEnabled(event.target.checked); }} />
        <span id="speech-heading">Local transcription</span>
      </label>
      <button type="button" className="speech-expand" aria-label={`Transcription settings. Model ${modelLabel.toLowerCase()}`} aria-expanded={expanded} aria-controls={panelId} onClick={() => setExpanded(value => !value)}>
        <span className="speech-model-label" aria-live="polite"><span className="speech-model-prefix">Local </span>model: {modelLabel.toLowerCase()}</span>
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" style={{ transform: expanded ? 'rotate(90deg)' : undefined }}><path d="M4 2l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>
      </button>
      <div id={panelId} className="device-submenu speech-setup" hidden={!expanded}>
        {enabled && <p>Audio and text stay on your device.</p>}
        {enabled && !hasMic && <p className="speech-hint">Select Mic above for transcription.</p>}
        <div className="speech-actions">
          {recording && enabled
            ? <button className="mini-action" onClick={() => setEnabled(false)}>Stop transcription</button>
            : speech.modelStatus === 'ready' || speech.modelStatus === 'loading'
              ? <button className="mini-action" onClick={unload}>{speech.modelStatus === 'loading' ? 'Cancel preparation' : 'Unload model'}</button>
              : <button className="mini-action" disabled={recording || removing} onClick={prepare}>{speech.modelStatus === 'error' ? 'Retry preparation' : 'Load model'}</button>}
          {!recording && <button className="mini-action" disabled={removing} onClick={() => void removeCache()}>Remove model</button>}
        </div>
        {speech.message && (speech.modelStatus === 'error' || (speech.modelStatus === 'ready' && (enabled || recording))) && <p className={`speech-status${speech.modelStatus === 'error' ? ' speech-warning' : ''}`} role={speech.modelStatus === 'error' ? 'alert' : 'status'}>{speech.message}</p>}
        <details className="speech-info">
          <summary>About transcription</summary>
          <ul className="speech-details-list">
            <li><strong>Speech model:</strong> <a href={`https://huggingface.co/${MODELS.tiny.id}`} target="_blank" rel="noreferrer">Whisper Tiny (English)</a> <span className="speech-model-id">{MODELS.tiny.id}</span></li>
            <li><strong>First download:</strong> About 60 MB from Hugging Face, cached on this device when available.</li>
            <li><strong>Model controls:</strong> Unload frees memory. Remove also deletes its cached download.</li>
            <li><strong>On iPhone/iPad:</strong> Locking the screen may pause transcription. On return, it tries to resume; if needed, tap Resume transcription. Missed speech is marked and is not filled in automatically.</li>
            <li><strong>Your text:</strong> Review important details and save recordings and transcripts before closing this tab.</li>
          </ul>
          <TranscriptionLicenses />
        </details>
        {cacheMessage && <p className="speech-cache-message speech-footnote" role="status">{cacheMessage}</p>}
      </div>
    </section>
    {paused && <div className="speech-interruption" role="status">
      <p>Transcription paused. Resume after unlocking. Check the saved recording for any missing audio.</p>
      <button className="mini-action" onClick={resume}>Resume transcription</button>
    </div>}
    {recording && enabled && speech.modelStatus === 'error' && <p className="speech-interruption" role="alert">Transcription stopped. {speech.message}</p>}
  </div>;
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
    <div className="speech-title"><h3>Session transcript</h3><span>{session.paused ? 'Paused' : session.capturing ? 'Listening' : session.incomplete ? 'Incomplete' : session.finished ? 'Finished' : 'Finishing…'}</span></div>
    <p>{new Date(session.createdAt).toLocaleString()} · {session.source}</p>
    {session.incomplete && <p role="status">{session.incomplete}</p>}
    {session.interruptions.length > 0 && <ul className="speech-gap-list" aria-label="Transcription interruptions">
      {session.interruptions.map((gap, index) => <li key={index}>{time(gap.start)}{gap.end === undefined ? ' onward' : `–${time(gap.end)}`} · Speech may be missing.</li>)}
    </ul>}
    <div className="transcript-text" ref={textRef} onScroll={event => {
      const text = event.currentTarget;
      follow.current = text.scrollHeight - text.clientHeight - text.scrollTop < 60;
    }}>
      {session.blocks.length > visible && <button className="mini-action" onClick={() => { follow.current = false; setVisible(value => value + 20); }}>Show earlier paragraphs</button>}
      {session.blocks.slice(-visible).map(block => <p key={block.id}><span className="speech-time">{time(block.start)}{(block.boundaryReview || block.recognitionReview) && ' · review'}</span>{block.text.trim()}</p>)}
      {session.draft && <p className="speech-draft"><span className="speech-time">Draft ending · may change</span>{session.draft}</p>}
      {!session.blocks.length && !session.draft && <p>Text appears after a phrase or about 12 seconds of continuous speech.</p>}
    </div>
    <div className="speech-actions">
      <button className="mini-action" onClick={() => {
        if (!navigator.clipboard?.writeText) { setFeedback('Copy unavailable. Use Save TXT.'); return; }
        void navigator.clipboard.writeText(sessionText(session)).then(() => setFeedback('Copied.'), () => setFeedback('Copy unavailable. Use Save TXT.'));
      }}>Copy text</button>
      <button className="mini-action" onClick={() => download(false)}>Save TXT</button>
      <button className="mini-action" onClick={() => download(true)}>Save JSON</button>
    </div>
    <span role="status">{feedback}</span>
  </article>;
}
export function SessionTranscripts({ sessions }: { sessions: SpeechSession[] }) {
  return <div className="session-transcripts">{sessions.map(session => <TranscriptCard key={session.id} session={session} />)}</div>;
}
