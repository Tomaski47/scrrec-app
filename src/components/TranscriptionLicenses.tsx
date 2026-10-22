import { useEffect, useRef, useState } from 'react';

const notices = [
  { file: 'huggingface-Apache-2.0.txt', label: 'Apache 2.0 license' },
  { file: 'onnxruntime-LICENSE.txt', label: 'ONNX Runtime MIT license' },
  { file: 'jinja-MIT.txt', label: 'Hugging Face Jinja MIT license' },
  { file: 'onnxruntime-ThirdPartyNotices.txt', label: 'ONNX Runtime additional notices' },
  { file: 'README.txt', label: 'Component versions and attribution' },
];

function LicenseNotice({ file, label }: typeof notices[number]) {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  const load = () => {
    if (text || request.current) return;
    const controller = request.current = new AbortController();
    setLoading(true); setError('');
    void fetch(`${import.meta.env.BASE_URL}licenses/${file}`, { signal: controller.signal })
      .then(response => { if (!response.ok) throw new Error('Notice unavailable'); return response.text(); })
      .then(value => { if (!controller.signal.aborted) setText(value); })
      .catch(() => { if (!controller.signal.aborted) setError('Could not load this notice. Close and reopen it to retry.'); })
      .finally(() => { if (!controller.signal.aborted) { request.current = null; setLoading(false); } });
  };
  return <details className="speech-license-notice" onToggle={event => { if (event.currentTarget.open) load(); }}>
    <summary>{label}</summary>
    {loading && <p role="status">Loading notice…</p>}
    {error && <p role="alert">{error}</p>}
    {text && <pre className="speech-license-text" tabIndex={0} aria-label={label}>{text}</pre>}
  </details>;
}

export function TranscriptionLicenses() {
  return <details className="speech-licenses">
    <summary>Open source licenses</summary>
    <ul className="speech-details-list">
      <li><strong>Whisper Tiny English, Transformers.js and Tokenizers.js:</strong> Apache 2.0.</li>
      <li><strong>ONNX Runtime and Hugging Face Jinja:</strong> MIT, with additional third-party notices.</li>
    </ul>
    {notices.map(notice => <LicenseNotice key={notice.file} {...notice} />)}
  </details>;
}
