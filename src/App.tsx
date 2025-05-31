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
  const [audioQuality, setAudioQuality] = useState('best');
  const [fileFormat, setFileFormat] = useState('webm');
  const [videoResolution, setVideoResolution] = useState<'fullscreen' | '1080p' | '720p' | '480p' | '360p'>('fullscreen');

  const [recording, setRecording] = useState(false);
  const [mediaRecorders, setMediaRecorders] = useState<{[key:string]: MediaRecorder | null}>({});
  const [videoUrls, setVideoUrls] = useState<{[key:string]: string | null}>({});
  const [audioUrls, setAudioUrls] = useState<{[key:string]: string | null}>({});
  const chunks = useRef<{[key:string]: Blob[]}>({});

  // Detect if getDisplayMedia is supported
  const [supportsDisplayMedia, setSupportsDisplayMedia] = useState(true);
  useEffect(() => {
    setSupportsDisplayMedia(typeof (navigator.mediaDevices as any).getDisplayMedia === 'function');
  }, []);

  // Replace recordingMode with recordOptions
  const [recordOptions, setRecordOptions] = useState({
    screenIds: [] as string[],
    cameraIds: [] as string[],
    mic: false,
    micIds: [] as string[],
  });

  // Camera/mic device detection state
  const [cameraDevices, setCameraDevices] = useState<MediaDeviceInfo[]>([]);
  const [micDevices, setMicDevices] = useState<MediaDeviceInfo[]>([]);

  useEffect(() => {
    navigator.mediaDevices.enumerateDevices().then(devices => {
      const videoInputs = devices.filter(device => device.kind === 'videoinput');
      setCameraDevices(videoInputs);
      const audioInputs = devices.filter(device => device.kind === 'audioinput');
      setMicDevices(audioInputs);
      // Reset all sub-device selections and parent checkboxes on device detection
      setRecordOptions({
        screenIds: [],
        cameraIds: [],
        mic: false,
        micIds: [],
      });
    });
  }, []);

  const getMaxResolutionLabel = () => {
    const width = window.screen.width * window.devicePixelRatio;
    const height = window.screen.height * window.devicePixelRatio;
    if (width >= 3840 || height >= 2160) return 'Max 4K';
    if (width >= 1920 || height >= 1080) return 'Max 1080p';
    if (width >= 1280 || height >= 720) return 'Max 720p';
    return 'Max 480p';
  };

  const startRecording = async () => {
    try {
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

      // Streams to record
      const streams: {[key:string]: MediaStream} = {};
      const streamKeys: string[] = [];

      // Get screen stream if selected
      if (recordOptions.screenIds.includes('main') && supportsDisplayMedia) {
        try {
          streams.screen = await (navigator.mediaDevices as any).getDisplayMedia({
            video: getResolutionConstraints(),
          });
          streamKeys.push('screen');
        } catch {
          alert('Could not get screen stream.');
          return;
        }
      }

      // Get camera streams if selected
      if (recordOptions.cameraIds && recordOptions.cameraIds.length > 0) {
        for (const camId of recordOptions.cameraIds) {
          try {
            const camStream = await navigator.mediaDevices.getUserMedia({
              video: { deviceId: { exact: camId } },
              audio: false,
            });
            streams['camera_' + camId] = camStream;
            streamKeys.push('camera_' + camId);
          } catch {
            alert('Could not get camera stream for device: ' + camId);
            return;
          }
        }
      }

      // Get mic streams if selected
      let micStreams: {[key: string]: MediaStream} = {};
      if (recordOptions.mic && recordOptions.micIds && recordOptions.micIds.length > 0) {
        for (const micId of recordOptions.micIds) {
          try {
            const micStream = await navigator.mediaDevices.getUserMedia({
              audio: {
                deviceId: { exact: micId },
                echoCancellation: true,
                noiseSuppression: true,
              },
              video: false,
            });
            micStreams['mic_' + micId] = micStream;
          } catch {
            alert('Could not get microphone audio stream for device: ' + micId);
            return;
          }
        }
      }

      if (
        (!recordOptions.screenIds || !recordOptions.screenIds.includes('main')) &&
        (!recordOptions.cameraIds || recordOptions.cameraIds.length === 0) &&
        (!recordOptions.mic || !recordOptions.micIds || recordOptions.micIds.length === 0)
      ) {
        alert('No recording options selected.');
        return;
      }

      const newMediaRecorders: {[key:string]: MediaRecorder} = {};
      const newChunks: {[key:string]: Blob[]} = {};
      const newVideoUrls: {[key:string]: string | null} = {...videoUrls};
      const newAudioUrls: {[key:string]: string | null} = {...audioUrls};

      // For each camera stream, combine with selected mics if enabled
      for (const camKey of Object.keys(streams).filter(k => k.startsWith('camera_'))) {
        const camStream = streams[camKey];
        let finalStream = camStream;
        if (recordOptions.mic && recordOptions.micIds && recordOptions.micIds.length > 0) {
          // Combine all selected mic tracks with video
          const audioTracks = recordOptions.micIds.flatMap(mid =>
            micStreams['mic_' + mid]?.getAudioTracks() ?? []
          );
          const combinedStream = new MediaStream([
            ...camStream.getVideoTracks(),
            ...audioTracks,
          ]);
          finalStream = combinedStream;
        }
        const recorderOptions: MediaRecorderOptions = {
          mimeType: 'video/webm',
          videoBitsPerSecond: bitsPerSecond['best'],
          audioBitsPerSecond: recordOptions.mic ? bitsPerSecond[audioQuality] : 0,
        };
        newChunks[camKey] = [];
        const recorder = new MediaRecorder(finalStream, recorderOptions);
        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) {
            newChunks[camKey].push(e.data);
          }
        };
        recorder.onstop = () => {
          const videoBlob = new Blob(newChunks[camKey], { type: 'video/webm' });
          newVideoUrls[camKey] = URL.createObjectURL(videoBlob);
          setVideoUrls({...newVideoUrls});
        };
        newMediaRecorders[camKey] = recorder;
      }

      // For each screen stream, combine with selected mics if enabled
      if (recordOptions.screenIds.includes('main') && streams.screen) {
        let finalStream = streams.screen;
        if (recordOptions.mic && recordOptions.micIds && recordOptions.micIds.length > 0) {
          const audioTracks = recordOptions.micIds.flatMap(mid =>
            micStreams['mic_' + mid]?.getAudioTracks() ?? []
          );
          const combinedStream = new MediaStream([
            ...streams.screen.getVideoTracks(),
            ...audioTracks,
          ]);
          finalStream = combinedStream;
        }
        const recorderOptions: MediaRecorderOptions = {
          mimeType: 'video/webm',
          videoBitsPerSecond: bitsPerSecond['best'],
          audioBitsPerSecond: recordOptions.mic ? bitsPerSecond[audioQuality] : 0,
        };
        newChunks['screen'] = [];
        const recorder = new MediaRecorder(finalStream, recorderOptions);
        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) {
            newChunks['screen'].push(e.data);
          }
        };
        recorder.onstop = () => {
          const videoBlob = new Blob(newChunks['screen'], { type: 'video/webm' });
          newVideoUrls['screen'] = URL.createObjectURL(videoBlob);
          setVideoUrls({...newVideoUrls});
        };
        newMediaRecorders['screen'] = recorder;
      }

      // For each mic stream, record audio-only
      if (recordOptions.mic && recordOptions.micIds && recordOptions.micIds.length > 0) {
        for (const micId of recordOptions.micIds) {
          const micKey = 'mic_' + micId;
          const micStream = micStreams[micKey];
          if (!micStream) continue;
          const recorderOptions: MediaRecorderOptions = {
            mimeType: 'audio/webm',
            audioBitsPerSecond: bitsPerSecond[audioQuality],
          };
          newChunks[micKey] = [];
          const recorder = new MediaRecorder(micStream, recorderOptions);
          recorder.ondataavailable = (e) => {
            if (e.data.size > 0) {
              newChunks[micKey].push(e.data);
            }
          };
          recorder.onstop = () => {
            const audioBlob = new Blob(newChunks[micKey], { type: 'audio/webm' });
            newAudioUrls[micKey] = URL.createObjectURL(audioBlob);
            setAudioUrls({...newAudioUrls});
          };
          newMediaRecorders[micKey] = recorder;
        }
      }

      // Start all recorders
      for (const key of Object.keys(newMediaRecorders)) {
        newMediaRecorders[key].start();
      }

      setMediaRecorders(newMediaRecorders);
      chunks.current = newChunks;
      setRecording(true);
    } catch (err) {
      alert('Could not start recording: ' + err);
    }
  };

  // Directory handle cache for saving files in a session
  const dirHandleRef = useRef<any>(null);

  const stopRecording = () => {
    // Stop all recorders
    Object.values(mediaRecorders).forEach(recorder => {
      if (recorder && recorder.state !== 'inactive') {
        recorder.stop();
      }
    });
    setRecording(false);
    setMediaRecorders({});

    // Stop all media tracks to release mic/camera
    Object.values(mediaRecorders).forEach(recorder => {
      const stream = recorder?.stream;
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    });
    // Do NOT auto-save files here! User must save manually via UI buttons.
    // (saveAllFiles(); call removed/commented out)
  };

  // "Save As" handler using File System Access API or fallback
  const saveFile = async (type: 'screen' | 'camera' | 'mic', isAudio: boolean) => {
    const url = isAudio ? audioUrls[type] : videoUrls[type];
    if (!url) return;

    // Choose file extension and ffmpeg args based on desired format
    let extension = 'webm';
    let ffmpegArgs: string[] = [];
    if (!isAudio) {
      if (fileFormat === 'mp4') {
        extension = 'mp4';
        ffmpegArgs = ['-i', 'input.webm', '-c:v', 'copy', 'output.mp4'];
      } else if (fileFormat === 'mov') {
        extension = 'mov';
        ffmpegArgs = ['-i', 'input.webm', '-c:v', 'copy', 'output.mov'];
      } else {
        extension = 'webm';
      }
    } else {
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
    let filename = '';
    if (isAudio) {
      filename = 'audio.' + extension;
    } else if (type === 'screen') {
      filename = 'video.' + extension;
    } else if (type === 'camera') {
      const isMobile = /Mobi|Android/i.test(navigator.userAgent);
      // Default to rear if we can't detect
      filename = (isMobile ? 'cam-rear' : 'cam') + '.' + extension;
    }

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
          !isAudio
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
                !isAudio ? 'Video File' : 'Audio File',
              accept: {
                [!isAudio
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
        if (!(err instanceof DOMException && err.name === 'AbortError')) {
          alert('Error saving file: ' + err);
        }
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

  const [recordingTime, setRecordingTime] = useState(0);
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (recording) {
      interval = setInterval(() => {
        setRecordingTime((t) => t + 1);
      }, 1000);
    } else {
      setRecordingTime(0);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [recording]);

  function formatTime(sec: number) {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    else return `${m}:${s.toString().padStart(2, '0')}`;
  }

  return (
    <div className="App">
      <div className="App-header">
        <span className="header-subtitle" style={{ marginBottom: '10px' }}>100% vibe coded</span>
        <h1 className="header-title" style={{ marginTop: 0, marginBottom: '14px' }}>Screen Recorder App</h1>
        <p className="header-description" style={{ marginTop: '0', marginBottom: '18px' }}>
          Capture your devices with ease!
        </p>

        <div className="settings-row" style={{ margin: "0 auto", display: "flex", justifyContent: "center" }}>
          <div
            className="settings-grid"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "24px",
              width: "100%",
              maxWidth: "650px",
            }}
          >
            {/* Options row */}
            {/*
            <div
              className="settings-label"
              style={{
                minWidth: "110px",
                width: "110px",
                textAlign: "left",
                display: "flex",
                alignItems: "baseline"
              }}
            >
              Options:
            </div>
            */}
            <div
              className="settings-label options-placeholder"
              style={{
                minWidth: "110px",
                width: "110px",
                textAlign: "left",
                display: "flex",
                alignItems: "baseline"
              }}
            >
              Options:
            </div>
            <div className="settings-control" style={{ flex: 1 }}>
              {/* Centered options checkboxes */}
              <div className="display-center">
                <div className="checkbox-group">
                  {/* Screen */}
                  <div className={`option-block${recordOptions.screenIds.length > 0 ? ' has-submenu' : ''}`}>
                    <label className="options-checkbox">
                      <input
                        type="checkbox"
                        checked={recordOptions.screenIds.length > 0}
                        onChange={e => {
                          let screenIds = recordOptions.screenIds;
                          if (e.target.checked) {
                            screenIds = ['main'];
                          } else {
                            screenIds = [];
                          }
                          setRecordOptions({ ...recordOptions, screenIds });
                        }}
                      />
                      Screen
                    </label>
                    {recordOptions.screenIds.length > 0 && (
                      <div className="device-submenu">
                        <label>
                          <input
                            type="checkbox"
                            checked={recordOptions.screenIds.includes('main')}
                            onChange={e => {
                              let screenIds = [...recordOptions.screenIds];
                              if (e.target.checked && !screenIds.includes('main')) {
                                screenIds.push('main');
                              } else if (!e.target.checked) {
                                screenIds = screenIds.filter(id => id !== 'main');
                              }
                              setRecordOptions({ ...recordOptions, screenIds });
                            }}
                          />
                          Main Screen
                        </label>
                      </div>
                    )}
                  </div>
                  {/* Mic */}
                  <div className={`option-block${recordOptions.mic && micDevices.length > 0 ? ' has-submenu' : ''}`}>
                    <label className="options-checkbox">
                      <input
                        type="checkbox"
                        checked={recordOptions.mic}
                        onChange={e => {
                          if (e.target.checked) {
                            let micIds = recordOptions.micIds;
                            if (micIds.length === 0 && micDevices.length > 0) {
                              micIds = [micDevices[0].deviceId];
                            }
                            setRecordOptions({ ...recordOptions, mic: true, micIds });
                          } else {
                            setRecordOptions({ ...recordOptions, mic: false, micIds: [] });
                          }
                        }}
                      />
                      Mic
                    </label>
                    {recordOptions.mic && micDevices.length > 0 && (
                      <div className="device-submenu">
                        {micDevices.map(device => (
                          <label key={device.deviceId}>
                            <input
                              type="checkbox"
                              checked={recordOptions.micIds.includes(device.deviceId)}
                              onChange={e => {
                                let micIds = [...recordOptions.micIds];
                                if (e.target.checked) {
                                  if (!micIds.includes(device.deviceId)) micIds.push(device.deviceId);
                                } else {
                                  micIds = micIds.filter(id => id !== device.deviceId);
                                }
                                setRecordOptions({ ...recordOptions, micIds });
                              }}
                            />
                            {device.label || `Mic ${device.deviceId.slice(-4)}`}
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                  {/* Camera */}
                  <div className={`option-block${recordOptions.cameraIds.length > 0 ? ' has-submenu' : ''}`}>
                    <label className="options-checkbox">
                      <input
                        type="checkbox"
                        checked={recordOptions.cameraIds.length > 0}
                        onChange={e => {
                          if (e.target.checked) {
                            let cameraIds = recordOptions.cameraIds;
                            if (cameraIds.length === 0 && cameraDevices.length > 0) {
                              cameraIds = [cameraDevices[0].deviceId];
                            }
                            setRecordOptions({ ...recordOptions, cameraIds });
                          } else {
                            setRecordOptions({ ...recordOptions, cameraIds: [] });
                          }
                        }}
                      />
                      Camera
                    </label>
                    {recordOptions.cameraIds.length > 0 && (
                      <div className="device-submenu">
                        {cameraDevices.map(device => (
                          <label key={device.deviceId}>
                            <input
                              type="checkbox"
                              checked={recordOptions.cameraIds.includes(device.deviceId)}
                              onChange={e => {
                                let cameraIds = [...recordOptions.cameraIds];
                                if (e.target.checked) {
                                  if (!cameraIds.includes(device.deviceId)) cameraIds.push(device.deviceId);
                                } else {
                                  cameraIds = cameraIds.filter(id => id !== device.deviceId);
                                }
                                setRecordOptions({ ...recordOptions, cameraIds });
                              }}
                            />
                            {device.label || `Camera ${device.deviceId.slice(-4)}`}
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Centered settings group */}
        <div className="settings-group">
          <div className="settings-grid">
            {/* Dropdowns */}
            <div className="settings-row">
              <div className="settings-label">Audio:</div>
              <div className="settings-control">
                <select
                  className="control-select"
                  value={audioQuality}
                  onChange={e => setAudioQuality(e.target.value)}
                  style={{ width: "200px" }}
                >
                  <option value="low">Low (64kbps)</option>
                  <option value="mid">Mid (128kbps)</option>
                  <option value="best">Best (256kbps)</option>
                </select>
              </div>
            </div>
            <div className="settings-row">
              <div className="settings-label">Resolution:</div>
              <div className="settings-control">
                <select
                  className="control-select"
                  value={videoResolution}
                  onChange={e => setVideoResolution(e.target.value as any)}
                  style={{ width: "200px" }}
                >
                  <option value="fullscreen">{getMaxResolutionLabel()}</option>
                  <option value="1080p">1080p</option>
                  <option value="720p">720p</option>
                  <option value="480p">480p</option>
                  <option value="360p">360p</option>
                </select>
              </div>
            </div>
          </div>
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

        {recording && (
          <div className="recording-timer">
            ⏺ Recording: {formatTime(recordingTime)}
          </div>
        )}

        <div className="preview-controls" style={{display:"flex",flexDirection:"column",alignItems:"center"}}>
          {recordOptions.screenIds.includes('main') && videoUrls.screen && (
            <div style={{marginBottom: '20px', textAlign: 'center'}}>
              <h3>Screen Video</h3>
              <video
                src={videoUrls.screen}
                controls
                className="video-preview"
              />
              <button
                className="neon-save"
                onClick={() => saveFile('screen', false)}
                style={{marginTop: '8px'}}
              >
                Save Screen Recording
              </button>
            </div>
          )}
          {recordOptions.cameraIds && recordOptions.cameraIds.map(camId =>
            videoUrls['camera_' + camId] ? (
              <div key={camId} style={{marginBottom: '20px', textAlign: 'center'}}>
                <h3>
                  Camera&nbsp;
                  {cameraDevices.find(d => d.deviceId === camId)?.label ||
                    `Camera ${camId.slice(-4)}`}
                </h3>
                <video
                  src={videoUrls['camera_' + camId] || undefined}
                  controls
                  className="video-preview"
                />
                <button
                  className="neon-save"
                  onClick={() => saveFile('camera_' + camId, false)}
                  style={{marginTop: '8px'}}
                >
                  Save Camera Recording
                </button>
              </div>
            ) : null
          )}
          {recordOptions.mic && recordOptions.micIds && recordOptions.micIds.map(micId =>
            audioUrls['mic_' + micId] ? (
              <div key={micId} style={{marginBottom: '20px', textAlign: 'center'}}>
                <h3>
                  Audio&nbsp;
                  {micDevices.find(d => d.deviceId === micId)?.label ||
                    `Mic ${micId.slice(-4)}`}
                </h3>
                <audio
                  src={audioUrls['mic_' + micId] || undefined}
                  controls
                />
                <button
                  className="neon-save"
                  onClick={() => saveFile('mic_' + micId, true)}
                  style={{marginTop: '8px'}}
                >
                  Save Microphone Audio
                </button>
              </div>
            ) : null
          )}
        </div>
      </div>

      <div className="app-footer">
        <div className="copyright">
          © 2025 Sadilek Innovation
        </div>
        <a
          href="https://www.sadilekinnovation.com"
          target="_blank"
          rel="noopener noreferrer"
          className="footer-link"
        >
          sadilekinnovation.com
        </a>
      </div>
    </div>
  );
}

export default App;