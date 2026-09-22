import { useState } from 'react';
import type { CompletedRecording } from '../recorder/session';

function RecordingCard({ recording, notify }: { recording: CompletedRecording; notify: (message: string) => void }) {
  const [downloadStarted, setDownloadStarted] = useState(false);
  const [portrait, setPortrait] = useState(false);
  const file = () => new File([recording.blob], recording.filename, { type: recording.blob.type });
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
    try {
      if (!canShare()) { notify('This browser cannot share this file. Use Save instead.'); return; }
      await navigator.share({ title: recording.label, files: [file()] });
      notify('Recording shared. The local copy is still available.');
    } catch (error) {
      notify(error instanceof DOMException && error.name === 'AbortError'
        ? 'Share cancelled. Your recording is still available.'
        : 'Sharing failed. Your recording is still available; use Save or try again.');
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
        {canShare() && <button type="button" className="neon-save" onClick={() => void share()}>Share</button>}
      </div>
    </article>
  );
}

export function RecordingList({ recordings, notify }: { recordings: CompletedRecording[]; notify: (message: string) => void }) {
  if (!recordings.length) return null;
  return <section className="recording-library" aria-label="Completed recordings">
    <h2>Recordings</h2>
    <p>Files stay here for this tab session. Save them before closing or reloading the page.</p>
    {recordings.map(recording => <RecordingCard key={recording.id} recording={recording} notify={notify} />)}
  </section>;
}
