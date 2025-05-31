import './App.css';
import React, { useRef, useState, useEffect } from 'react';


function App() {
  const ffmpeg = useRef<any>(null);
  const [isConverting, setIsConverting] = useState(false);

  // Video/audio quality options
  const bitsPerSecond = {
    low: 2_000_000,
    mid: 4_000_000,
    best: 8_000_000,
  };

  // Helper to load ffmpeg.wasm if not already loaded
  const loadFFmpeg = async () => {
    if (!ffmpeg.current) {
      const ffmpegModule = await import(/* @vite-ignore */ '@ffmpeg/ffmpeg');
      const createFFmpeg = ffmpegModule.createFFmpeg || ffmpegModule.default?.createFFmpeg;
      if (!createFFmpeg) {
        throw new Error('createFFmpeg is not available from @ffmpeg/ffmpeg import');
      }
      ffmpeg.current = createFFmpeg({ log: true });
      await ffmpeg.current.load();
    }
  };

  // Add state for quality, format, and resolution
  const [videoQuality, setVideoQuality] = useState('mid');
  const [audioQuality, setAudioQuality] = useState('mid');
  const [fileFormat, setFileFormat] = useState('webm');
  const [videoResolution, setVideoResolution] = useState<'fullscreen' | '1080p' | '720p' | '480p' | '360p'>('fullscreen');

  const [recording, setRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [downloadType, setDownloadType] = useState<'video' | 'audio'>('video');
  const chunks = useRef<Blob[]>([]);

  // Detect if getDisplayMedia is supported
  const [supportsDisplayMedia, setSupportsDisplayMedia] = useState(true);
  useEffect(() => {
    setSupportsDisplayMedia(typeof (navigator.mediaDevices as any).getDisplayMedia === 'function');
  }, []);

  // Add recording mode state
  const [recordingMode, setRecordingMode] = useState<'screen-only' | 'screen-audio' | 'audio-only'>('screen-audio');

  const startRecording = async () => {
    try {
      let combinedStream: MediaStream | null = null;

      // Helper to get resolution constraints
      const getResolutionConstraints = () => {
        switch (videoResolution) {
          case '1080p':
            return { width: 1920, height: 1080 };
          case '720p':
            return { width: 1280, height: 720 };
          case '480p':
            return { width: 854, height: 480 };
          case '360p':
            return { width: 640, height: 360 };
          case 'fullscreen':
          default:
            return {};
        }
      };

      // If getDisplayMedia is not supported, fallback to audio-only mode
      if (!supportsDisplayMedia || recordingMode === 'audio-only') {
        // Audio only (or mobile fallback)
        const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        combinedStream = audioStream;
      } else {
        if (recordingMode === 'screen-only') {
          // Screen only, no audio
          const screenStream = await (navigator.mediaDevices as any).getDisplayMedia({
            video: getResolutionConstraints(),
            audio: false,
          });
          combinedStream = screenStream;
        } else if (recordingMode === 'screen-audio') {
          // Screen + audio (system + mic)
          const screenStream = await (navigator.mediaDevices as any).getDisplayMedia({
            video: getResolutionConstraints(),
            audio: true,
          });

          let micStream: MediaStream | null = null;
          try {
            micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
          } catch {
            // Mic access denied or unavailable
          }

          // Merge tracks for video+audio
          const tracks = [...screenStream.getVideoTracks()];
          if (screenStream.getAudioTracks().length) tracks.push(...screenStream.getAudioTracks());
          if (micStream && micStream.getAudioTracks().length) tracks.push(...micStream.getAudioTracks());
          combinedStream = new MediaStream(tracks);
        }
      }

      if (!combinedStream) {
        alert('Could not get media stream for recording.');
        return;
      }

      const recorderOptions: MediaRecorderOptions = {};
      if (recordingMode === 'audio-only') {
        recorderOptions.mimeType = 'audio/webm';
        recorderOptions.audioBitsPerSecond = bitsPerSecond[audioQuality];
      } else {
        recorderOptions.mimeType = 'video/webm';
        recorderOptions.videoBitsPerSecond = bitsPerSecond[videoQuality];
        recorderOptions.audioBitsPerSecond = bitsPerSecond[audioQuality] / 4;
      }

      const recorder = new MediaRecorder(combinedStream, recorderOptions);
      chunks.current = [];
      recorder.ondataavailable = (e) => e.data.size > 0 && chunks.current.push(e.data);
      recorder.onstop = () => {
        if (recordingMode === 'audio-only') {
          // Create audio blob only
          const audioBlob = new Blob(chunks.current, { type: 'audio/webm' });
          setAudioUrl(URL.createObjectURL(audioBlob));
          setVideoUrl(null);
        } else {
          // Create video blob
          const videoBlob = new Blob(chunks.current, { type: 'video/webm' });
          setVideoUrl(URL.createObjectURL(videoBlob));
          // Optionally: Extract audio
          if ('MediaRecorder' in window) {
            try {
              const audioTracks = combinedStream.getAudioTracks();
              if (audioTracks.length) {
                const audioStream = new MediaStream(audioTracks);
                const audioRecorder = new MediaRecorder(audioStream);
                const audioChunks: Blob[] = [];
                audioRecorder.ondataavailable = (ev) => ev.data.size > 0 && audioChunks.push(ev.data);
                audioRecorder.onstop = () => {
                  const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                  setAudioUrl(URL.createObjectURL(audioBlob));
                };
                audioRecorder.start();
                setTimeout(() => audioRecorder.stop(), 500); // Record short audio segment for download
              }
            } catch {}
          }
        }
      };

      recorder.start();
      setMediaRecorder(recorder);
      setRecording(true);
    } catch (err) {
      alert('Could not start recording: ' + err);
    }
  };

  const stopRecording = () => {
    mediaRecorder?.stop();
    setRecording(false);
    setMediaRecorder(null);
  };

  // "Save As" handler using File System Access API or fallback
  const saveFile = async () => {
    // Only allow audio save if recording mode is audio-only
    if (downloadType === 'audio' && recordingMode !== 'audio-only') {
      alert('Audio only save is only available in Audio Only recording mode.');
      return;
    }

    const url = downloadType === 'video' ? videoUrl : audioUrl;
    if (!url) return;

    // Choose file extension and ffmpeg args based on desired format
    let extension = 'webm';
    let ffmpegArgs: string[] = [];
    if (downloadType === 'video') {
      if (fileFormat === 'mp4') {
        extension = 'mp4';
        ffmpegArgs = ['-i', 'input.webm', '-c:v', 'copy', 'output.mp4'];
      } else if (fileFormat === 'mov') {
        extension = 'mov';
        ffmpegArgs = ['-i', 'input.webm', '-c:v', 'copy', 'output.mov'];
      } else {
        extension = 'webm';
      }
    } else if (downloadType === 'audio') {
      if (fileFormat === 'mp3') {
        extension = 'mp3';
        ffmpegArgs = ['-i', 'input.webm', '-q:a', '0', '-map', 'a', 'output.mp3'];
      } else if (fileFormat === 'wav') {
        extension = 'wav';
        ffmpegArgs = ['-i', 'input.webm', '-map', 'a', 'output.wav'];
      } else {
        extension = 'webm';
      }
    }

    let outUrl = url;
    let filename =
      downloadType === 'video'
        ? `recording.${extension}`
        : `recording-audio.${extension}`;

    if (ffmpegArgs.length) {
      setIsConverting(true);
      await loadFFmpeg();

      // Fetch the recorded blob as a file
      const blob = await fetch(url).then(r => r.blob());
      const { fetchFile } = await import('@ffmpeg/ffmpeg');
      ffmpeg.current.FS('writeFile', 'input.webm', await fetchFile(blob));

      await ffmpeg.current.run(...ffmpegArgs);

      const outName = ffmpegArgs[ffmpegArgs.length - 1];
      const data = ffmpeg.current.FS('readFile', outName);

      const convertedBlob = new Blob([data.buffer], {
        type:
          downloadType === 'video'
            ? `video/${extension}`
            : `audio/${extension}`,
      });
      outUrl = URL.createObjectURL(convertedBlob);

      setIsConverting(false);
    }

    // @ts-ignore
    if (window.showSaveFilePicker) {
      try {
        // @ts-ignore
        const handle = await window.showSaveFilePicker({
          suggestedName: filename,
          types: [
            {
              description:
                downloadType === 'video' ? 'Video File' : 'Audio File',
              accept: {
                [downloadType === 'video'
                  ? `video/${extension}`
                  : `audio/${extension}`]: [`.${extension}`],
              },
            },
          ],
        });
        const writable = await handle.createWritable();
        const response = await fetch(outUrl);
        const finalBlob = await response.blob();
        await writable.write(finalBlob);
        await writable.close();
        alert('File saved!');
      } catch (err) {
        alert('Error saving file: ' + err);
      }
    } else {
      // Fallback: classic download
      const a = document.createElement('a');
      a.href = outUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      alert(
        'Your browser does not support selecting a save folder, so file was saved to your Downloads folder.'
      );
    }
  };

  return (
    <div className="App">
      <div className="App-header">
        <span className="header-subtitle">Screen Recorder App</span>
        <h1 className="header-title">Welcome to the Screen Recorder App!</h1>
        <p className="header-description">Record your screen with ease.</p>

        <div className="controls-row">
          <label className="control-label">
            Recording Mode:
            <select
              className="control-select"
              value={recordingMode}
              onChange={e => setRecordingMode(e.target.value as any)}
            >
              <option value="screen-only" disabled={!supportsDisplayMedia}>Screen Only (No Audio)</option>
              <option value="screen-audio" disabled={!supportsDisplayMedia}>Screen + Audio</option>
              <option value="audio-only">Audio Only</option>
            </select>
          </label>
          <label className="control-label">
            Video Quality:
            <select
              className="control-select"
              value={videoQuality}
              onChange={e => setVideoQuality(e.target.value)}
              disabled={recordingMode === 'audio-only'}
            >
              <option value="low">Low</option>
              <option value="mid">Mid</option>
              <option value="best">Best</option>
            </select>
          </label>
          <label className="control-label">
            Audio Quality:
            <select
              className="control-select"
              value={audioQuality}
              onChange={e => setAudioQuality(e.target.value)}
            >
              <option value="low">Low</option>
              <option value="mid">Mid</option>
              <option value="best">Best</option>
            </select>
          </label>
          <label className="control-label">
            Video Resolution:
            <select
              className="control-select"
              value={videoResolution}
              onChange={e => setVideoResolution(e.target.value as any)}
              disabled={recordingMode === 'audio-only'}
            >
              <option value="fullscreen">Fullscreen</option>
              <option value="1080p">1080p</option>
              <option value="720p">720p</option>
              <option value="480p">480p</option>
              <option value="360p">360p</option>
            </select>
          </label>
          <label className="control-label">
            File Format:
            <select
              className="control-select"
              value={fileFormat}
              onChange={e => setFileFormat(e.target.value)}
            >
              {downloadType === 'video' ? (
                <>
                  <option value="webm">WebM</option>
                  <option value="mp4">MP4</option>
                  <option value="mov">MOV</option>
                </>
              ) : (
                <>
                  <option value="webm">WebM</option>
                  <option value="mp3">MP3</option>
                  <option value="wav">WAV</option>
                </>
              )}
            </select>
          </label>
        </div>

        <div className="action-buttons">
          <button
            className="btn"
            onClick={startRecording}
            disabled={recording}
          >
            Start Recording
          </button>
          <button
            className="neon-stop"
            onClick={stopRecording}
            disabled={!recording}
          >
            Stop Recording
          </button>
        </div>

        {isConverting && (
          <div className="converting-text">Converting... Please wait.</div>
        )}

        {videoUrl && (
          <div className="preview-controls" style={{display:"flex",flexDirection:"column",alignItems:"center"}}>
            {recordingMode !== 'audio-only' && (
              <video
                src={videoUrl}
                controls
                className="video-preview"
              />
            )}
            <div className="controls-row" style={{margin: '14px 0'}}>
              <button
                className={`btn ${downloadType === 'video' ? 'btn-active' : 'btn-inactive'}`}
                onClick={() => setDownloadType('video')}
              >
                Video+Audio
              </button>
              {recordingMode === 'audio-only' && (
                <button
                  className={`btn ${downloadType === 'audio' ? 'btn-active' : 'btn-inactive'}`}
                  onClick={() => setDownloadType('audio')}
                  disabled={!audioUrl}
                >
                  Audio Only
                </button>
              )}
            </div>
            <button
              className="neon-save"
              onClick={saveFile}
            >
              {downloadType === 'video' ? 'Save Video' : 'Save Audio'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;