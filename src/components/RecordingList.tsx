import { useEffect, useRef, useState } from 'react';
import type { CompletedRecording } from '../recorder/session';

type Sharing = { active: string | null; begin: (id: string) => boolean; finish: () => void };

function RecordingCard({ recording, sharing }: { recording: CompletedRecording; sharing: Sharing }) {
  const [downloadStarted, setDownloadStarted] = useState(false);
  const [portrait, setPortrait] = useState(false);
  const [message, notify] = useState('');
  const pending = sharing.active === recording.id;
  // Native share targets identify files by their container, without encoder parameters.
  const file = () => new File([recording.blob], recording.filename, { type: recording.blob.type.split(';')[0] });
  useEffect(() => {
    if (!pending) return;
    const timeout = window.setTimeout(() => notify('Your browser has not finished sharing. If the share sheet is closed, use Save and share the downloaded file from Files or Downloads. Save all recordings before reloading this tab.'), 15_000);
    return () => window.clearTimeout(timeout);
  }, [pending]);
  const canShare = () => {
    try { return typeof navigator.share === 'function' && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file()] }); }
    catch { return false; }
  };
  const download = () => {
    try {
      const link = document.createElement('a');
      link.href = recording.url;
      link.download = recording.filename;
      document.body.append(link);
      link.click();
      link.remove();
      setDownloadStarted(true);
      notify('Download started. Check your browser downloads before clearing the recording.');
    } catch { notify('Could not start the download. Your recording is still available; please try again.'); }
  };
  const share = async () => {
    if (!sharing.begin(recording.id)) return;
    notify('Complete or cancel the share sheet. Save remains available.');
    try {
      if (!canShare()) { notify('This browser cannot share this file. Use Save instead.'); return; }
      await navigator.share({ title: recording.label, files: [file()] });
      notify('Recording shared. The local copy is still available.');
    } catch (error) {
      const name = error instanceof Error ? error.name : 'Error';
      notify(name === 'AbortError'
        ? 'Share cancelled. Your recording is still available.'
        : `Sharing could not finish (${name}). Use Save, then share the downloaded file from Files or Downloads. Your recording is still available.`);
    } finally {
      sharing.finish();
    }
  };
  return (
    <article className="recording-card">
      <h3>{recording.label}</h3>
      <p className="recording-metadata">{recording.createdAt.toLocaleString()} · {Math.round(recording.duration)}s · {(recording.blob.size / 1024 / 1024).toFixed(2)} MB · {recording.blob.type.split(';')[0] || 'Browser format'}</p>
      {recording.partial && <p role="status">Partial recording — check playback before relying on this file.</p>}
      {recording.kind === 'mic'
        ? <audio src={recording.url} controls aria-label={`${recording.label} playback`} />
        : <video src={recording.url} controls playsInline aria-label={`${recording.label} playback`}
            className={`video-preview ${portrait ? 'portrait-video' : ''}`}
            onLoadedMetadata={event => setPortrait(event.currentTarget.videoHeight > event.currentTarget.videoWidth)} />}
      <div className="save-button-container">
        <button type="button" className="neon-save" onClick={download}>{downloadStarted ? 'Download again' : 'Save'}</button>
        {canShare() && <button type="button" className="neon-save" disabled={sharing.active !== null} onClick={() => void share()}>{pending ? 'Sharing…' : 'Share'}</button>}
      </div>
      <p role="status" className="save-feedback">{message}</p>
    </article>
  );
}

export function RecordingList({ recordings, transcriptIds = [] }: { recordings: CompletedRecording[]; transcriptIds?: string[] }) {
  const lock = useRef(false);
  const [active, setActive] = useState<string | null>(null);
  const sharing: Sharing = {
    active,
    begin: id => {
      // Lock synchronously, before React renders disabled buttons.
      if (lock.current) return false;
      lock.current = true;
      setActive(id);
      return true;
    },
    finish: () => { lock.current = false; setActive(null); },
  };
  if (!recordings.length) return null;
  return <section className="recording-library" aria-label="Completed recordings">
    <h2>Recordings</h2>
    <p>Files stay here for this tab session. Save them before closing or reloading the page.</p>
    {active !== null && !recordings.some(recording => recording.id === active) && <p role="status" className="save-feedback">Your browser still has a share pending. Use Save for these files. Save all recordings before reloading this tab.</p>}
    {recordings.map(recording => <div key={recording.id}>
      {transcriptIds.includes(recording.sessionId) && <a href={`#transcript-${recording.sessionId}`}>View session transcript</a>}
      <RecordingCard recording={recording} sharing={sharing} />
    </div>)}
  </section>;
}
