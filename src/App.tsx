import React, { useState, useEffect, useRef } from 'react';
import './App.css';

// Utility function to get the full native screen resolution (physical pixels)
const getDeviceResolution = () => {
  const width = Math.floor(window.screen.width * window.devicePixelRatio);
  const height = Math.floor(window.screen.height * window.devicePixelRatio);
  return { width, height };
};

// Utility function to detect browser type
const getBrowserInfo = () => {
  const ua = navigator.userAgent;
  const isChrome = /Chrome/.test(ua) && /Google Inc/.test(navigator.vendor);
  const isSafari = /Safari/.test(ua) && /Apple Computer/.test(navigator.vendor);
  const isFirefox = /Firefox/.test(ua);
  const isEdge = /Edg/.test(ua);
  const isIncognito = !navigator.storage || !navigator.storage.estimate;
  
  return { isChrome, isSafari, isFirefox, isEdge, isIncognito };
};

// Utility function to generate a filename for recordings
const generateFilename = (streamType: string, resolution?: string): string => {
  const now = new Date();
  const formattedDate = now.toLocaleDateString("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "2-digit",
  }).replace(/\//g, "-");

  const formattedTime = now.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).toLowerCase().replace(":", "").replace(" ", "");

  let deviceName = "recording";
  if (streamType === "cam") {
    deviceName = "cam";
  } else if (streamType === "mic") {
    deviceName = "mic";
  } else if (streamType === "screen") {
    // Use improved logic for screen filename with resolution
    const selectedResolution = resolution;
    const resolutionPart = selectedResolution && selectedResolution !== "fullscreen"
      ? selectedResolution.toLowerCase()
      : "";
    const resolutionTag = resolutionPart ? `screen${resolutionPart}` : "screen";
    return `${resolutionTag}_${formattedDate}_${formattedTime}.webm`;
  }

  return `${deviceName}_${formattedDate}_${formattedTime}.webm`;
};

function App() {
  // State declarations
  const [showClearConfirmation, setShowClearConfirmation] = useState(false);
  const [hasCleared, setHasCleared] = useState(false);
  const [savedStatus, setSavedStatus] = useState<{ [key: string]: boolean }>({});
  const [permissionStatus, setPermissionStatus] = useState<Record<string, string>>({});
  const [isConverting, setIsConverting] = useState(false);
  const [audioQuality, setAudioQuality] = useState('best');
  const [fileFormat, setFileFormat] = useState('webm');
  const [videoResolution, setVideoResolution] = useState<'fullscreen' | '1080p' | '720p' | '480p' | '360p'>('fullscreen');
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [mediaRecorders, setMediaRecorders] = useState<{[key:string]: MediaRecorder | null}>({});
  const [videoUrls, setVideoUrls] = useState<{[key:string]: string | null}>({});
  const [audioUrls, setAudioUrls] = useState<{[key:string]: string | null}>({});
  const [supportsDisplayMedia, setSupportsDisplayMedia] = useState(true);
  const [recordOptions, setRecordOptions] = useState({
    screenIds: [] as string[],
    cameraIds: [] as string[],
    mic: false,
    micIds: [] as string[],
  });
  const [cameraDevices, setCameraDevices] = useState<MediaDeviceInfo[]>([]);
  const [micDevices, setMicDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedCamera, setSelectedCamera] = useState<MediaDeviceInfo | null>(null);
  const [cameraPermission, setCameraPermission] = useState<string>("unknown");
  const [fullScreenResolution, setFullScreenResolution] = useState<string>('');
  const [actualScreenResolution, setActualScreenResolution] = useState("");
  const [screenDevices, setScreenDevices] = useState<{ deviceId: string; label?: string; width?: number; height?: number }[]>([]);
  const [availableScreenResolutions, setAvailableScreenResolutions] = useState<string[]>([]);
  const [maxResolutionLabel, setMaxResolutionLabel] = useState("1080p");
  const [recordingTime, setRecordingTime] = useState(0);
  const [recordingSize, setRecordingSize] = useState(0);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [recordedChunks, setRecordedChunks] = useState<Blob[]>([]);

  // Refs
  const ffmpeg = useRef<any>(null);
  const dirHandleRef = useRef<any>(null);
  const activeStreamsRef = useRef<MediaStream[]>([]);
  const chunks = useRef<{[key:string]: Blob[]}>({});

  // Constants
  const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const bitsPerSecond = {
    low: 2_000_000,
    mid: 4_000_000,
    best: 8_000_000,
  };
  const screenResolution = `${Math.floor(window.screen.width * window.devicePixelRatio)}x${Math.floor(window.screen.height * window.devicePixelRatio)}`;
  const screenResolutions = [`Max (${screenResolution})`, "1080p", "720p"];

  // Download helper function
  const handleDownload = (blobOrChunks: Blob[] | Blob, fileName: string, deviceName?: string) => {
    let blob: Blob;
    if (Array.isArray(blobOrChunks)) {
      blob = new Blob(blobOrChunks, { type: 'video/webm' });
    } else {
      blob = blobOrChunks;
    }
    try {
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = fileName;
      link.click();
      setTimeout(() => {
        URL.revokeObjectURL(link.href);
      }, 1000);
      setTimeout(() => {
        if (deviceName) {
          setSavedStatus(prev => ({ ...prev, [deviceName]: true }));
        }
      }, 2500);
    } catch (error) {
      console.error("Download failed:", error);
    }
  };

  // Check permissions
  const checkPermissions = async () => {
    const types = ['camera', 'microphone'];
    const statuses: Record<string, string> = {};
    for (const type of types) {
      try {
        const status = await navigator.permissions.query({ name: type as PermissionName });
        statuses[type] = status.state;
      } catch {
        statuses[type] = 'unknown';
      }
    }
    setPermissionStatus(statuses);
  };

  // Retry permissions
  const retryPermissions = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      stream.getTracks().forEach(track => track.stop());
      alert("Permissions granted. Please start recording again.");
      await checkPermissions();
    } catch (err: any) {
      alert("Still couldn't access camera or mic. Try restarting the browser or exiting incognito/guest mode.\n\nError: " + (err?.message || err));
      await checkPermissions();
    }
  };

  // Load FFmpeg
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

  // Get full screen resolution label
  function getFullScreenResolutionLabel(): string {
    const width = Math.floor(window.screen.width * window.devicePixelRatio);
    const height = Math.floor(window.screen.height * window.devicePixelRatio);
    return `${width}x${height}`;
  }

  // Get available devices
  const getAvailableDevices = async () => {
    try {
      // First, request permissions to ensure we can see device labels
      await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
        .then(stream => {
          stream.getTracks().forEach(track => track.stop());
        })
        .catch(() => {
          // Silent catch - permissions might be denied
        });

      const devices = await navigator.mediaDevices.enumerateDevices();
      let videoDevices = devices.filter(device => device.kind === 'videoinput');
      let audioDevices = devices.filter(device => device.kind === 'audioinput');
      
      // Enhanced camera labeling for mobile
      videoDevices = videoDevices.map((device, idx) => {
        let label = device.label;
        
        if (!label || label.trim() === "") {
          const deviceIdLower = device.deviceId.toLowerCase();
          if (deviceIdLower.includes('front') || deviceIdLower.includes('user')) {
            label = `Front Camera`;
          } else if (deviceIdLower.includes('back') || deviceIdLower.includes('environment')) {
            label = `Rear Camera`;
          } else {
            label = `Camera ${idx + 1}`;
          }
        } else {
          if (label.toLowerCase().includes('front') || label.toLowerCase().includes('facing user')) {
            label = 'Front Camera';
          } else if (label.toLowerCase().includes('back') || label.toLowerCase().includes('facing environment')) {
            label = 'Rear Camera';
          }
        }
        
        return { ...device, label };
      });
      
      setCameraDevices(videoDevices);
      setMicDevices(audioDevices);
      
      // If on mobile and we have multiple cameras, set default to rear camera
      if (isMobile && videoDevices.length > 1) {
        const rearCamera = videoDevices.find(d => 
          d.label.toLowerCase().includes('rear') || 
          d.label.toLowerCase().includes('back')
        );
        if (rearCamera) {
          setSelectedCamera(rearCamera);
          setRecordOptions(prev => ({ ...prev, cameraIds: [rearCamera.deviceId] }));
        }
      }
    } catch (error) {
      console.error('Error enumerating devices:', error);
    }
  };

  // Get recorder options
  const getRecorderOptions = (hasVideo: boolean, hasAudio: boolean) => {
    const { isSafari, isFirefox } = getBrowserInfo();
    
    const videoMimeTypes = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm;codecs=h264,opus',
      'video/webm',
      'video/mp4'
    ];
    
    const audioMimeTypes = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/mp4',
      'audio/aac'
    ];
    
    let mimeType = '';
    const mimeTypes = hasVideo ? videoMimeTypes : audioMimeTypes;
    
    for (const type of mimeTypes) {
      if (MediaRecorder.isTypeSupported(type)) {
        mimeType = type;
        break;
      }
    }
    
    if (!mimeType) {
      mimeType = hasVideo ? 'video/webm' : 'audio/webm';
    }
    
    const options: MediaRecorderOptions = {
      mimeType,
      videoBitsPerSecond: hasVideo ? bitsPerSecond['best'] : undefined,
      audioBitsPerSecond: hasAudio ? bitsPerSecond[audioQuality] : undefined,
    };
    
    return options;
  };

  // Detect video orientation
  const detectVideoOrientation = (stream: MediaStream): 'portrait' | 'landscape' => {
    const videoTrack = stream.getVideoTracks()[0];
    const settings = videoTrack.getSettings();
    if (settings.width && settings.height) {
      return settings.height > settings.width ? 'portrait' : 'landscape';
    }
    return 'landscape';
  };

  // Format time
  function formatTime(sec: number) {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    else return `${m}:${s.toString().padStart(2, '0')}`;
  }

  // Format size
  function formatSize(bytes: number) {
    const mb = bytes / (1024 * 1024);
    if (mb < 1 && mb > 0) {
      return `${mb.toFixed(2)} MB`;
    }
    return `${Math.round(mb)} MB`;
  }

  // Calculate estimated size
  function calculateEstimatedSize(seconds: number, options: {
    hasVideo: boolean,
    videoResolution: string,
    hasAudio: boolean,
    audioQuality: string
  }): number {
    let totalBitsPerSecond = 0;

    if (options.hasVideo) {
      switch (options.videoResolution) {
        case '1080p':
          totalBitsPerSecond += 1_500_000;
          break;
        case '720p':
          totalBitsPerSecond += 1_000_000;
          break;
        case '480p':
          totalBitsPerSecond += 600_000;
          break;
        case '360p':
          totalBitsPerSecond += 400_000;
          break;
        default:
          totalBitsPerSecond += 1_200_000;
          break;
      }
    }

    if (options.hasAudio) {
      switch (options.audioQuality) {
        case 'best':
          totalBitsPerSecond += 128_000;
          break;
        case 'mid':
          totalBitsPerSecond += 96_000;
          break;
        case 'low':
          totalBitsPerSecond += 64_000;
          break;
      }
    }

    const bytesPerSecond = totalBitsPerSecond / 8;
    return Math.round(bytesPerSecond * seconds);
  }

  // Calculate total recording size
  function calculateTotalRecordingSize() {
    let total = 0;
    if (chunks.current) {
      Object.values(chunks.current).forEach(arr => {
        if (Array.isArray(arr)) {
          total += arr.reduce((acc, chunk) => acc + (chunk.size || 0), 0);
        }
      });
    }
    return total;
  }

  // Cleanup recording
  const cleanupRecording = () => {
    console.log("Cleaning up recording...");

    Object.keys(mediaRecorders).forEach(key => {
      const recorder = mediaRecorders[key];
      if (recorder && recorder.state === "recording") {
        try {
          recorder.stop();
          console.log(`Stopped recorder ${key}`);
        } catch (error) {
          console.error(`Error stopping recorder ${key}:`, error);
        }
      }
    });

    activeStreamsRef.current.forEach((stream, idx) => {
      stream.getTracks().forEach(track => {
        try {
          track.stop();
          console.log(`Stopped ${track.kind} track from stream #${idx}`);
        } catch (err) {
          console.warn('Error stopping track:', err);
        }
      });
    });
    activeStreamsRef.current = [];

    setMediaRecorders({});
    setRecording(false);
    setRecordingSize(0);
  };

  // Start recording
  const startRecording = async () => {
    try {
      cleanupRecording();
      activeStreamsRef.current = [];
      
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

      const streams: {[key:string]: MediaStream} = {};
      const streamKeys: string[] = [];

      // Get screen stream if selected
      if (recordOptions.screenIds.includes('main') && supportsDisplayMedia) {
        try {
          streams.screen = await (navigator.mediaDevices as any).getDisplayMedia({
            video: getResolutionConstraints(),
          });
          activeStreamsRef.current.push(streams.screen);
          streamKeys.push('screen');
        } catch (err: any) {
          setPermissionError('Could not get screen stream.\nError: ' + (err?.message || err));
          cleanupRecording();
          return;
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
            activeStreamsRef.current.push(micStream);
          } catch (err: any) {
            try {
              await navigator.mediaDevices.getUserMedia({ audio: true });
              const micStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                  deviceId: { exact: micId },
                  echoCancellation: true,
                  noiseSuppression: true,
                },
                video: false,
              });
              micStreams['mic_' + micId] = micStream;
              activeStreamsRef.current.push(micStream);
            } catch (finalErr: any) {
              setPermissionError('Could not get microphone audio stream for device: ' + micId + '\nError: ' + (finalErr?.message || finalErr));
              cleanupRecording();
              return;
            }
          }
        }
      }

      // Get camera streams if selected
      if (recordOptions.cameraIds && recordOptions.cameraIds.length > 0) {
        for (const camId of recordOptions.cameraIds) {
          try {
            const selectedDevice = cameraDevices.find(d => d.deviceId === camId);
            const isRearCamera = selectedDevice?.label.toLowerCase().includes('rear') || 
                                selectedDevice?.label.toLowerCase().includes('back');
            
            const cameraConstraints: MediaStreamConstraints = {
              video: {
                deviceId: { exact: camId },
                ...(isMobile && {
                  facingMode: isRearCamera ? 'environment' : 'user',
                  width: { ideal: 1920 },
                  height: { ideal: 1080 }
                })
              }
            };
            
            const camStream = await navigator.mediaDevices.getUserMedia(cameraConstraints);
            streams['camera_' + camId] = camStream;
            activeStreamsRef.current.push(camStream);
            streamKeys.push('camera_' + camId);
          } catch (err: any) {
            try {
              const fallbackConstraints: MediaStreamConstraints = {
                video: {
                  facingMode: 'user',
                  width: { ideal: 1920 },
                  height: { ideal: 1080 }
                }
              };
              const fallbackStream = await navigator.mediaDevices.getUserMedia(fallbackConstraints);
              streams['camera_' + camId] = fallbackStream;
              activeStreamsRef.current.push(fallbackStream);
              streamKeys.push('camera_' + camId);
            } catch (fallbackErr: any) {
              setPermissionError('Could not access camera: ' + (fallbackErr?.message || fallbackErr));
              cleanupRecording();
              return;
            }
          }
        }
      }

      if (
        (!recordOptions.screenIds || !recordOptions.screenIds.includes('main')) &&
        (!recordOptions.cameraIds || recordOptions.cameraIds.length === 0) &&
        (!recordOptions.mic || !recordOptions.micIds || recordOptions.micIds.length === 0)
      ) {
        setPermissionError('No recording options selected.');
        return;
      }

      const newMediaRecorders: {[key:string]: MediaRecorder} = {};
      const newChunks: {[key:string]: Blob[]} = {};
      const newVideoUrls: {[key:string]: string | null} = {...videoUrls};
      const newAudioUrls: {[key:string]: string | null} = {...audioUrls};

      // For each camera stream
      for (const camKey of Object.keys(streams).filter(k => k.startsWith('camera_'))) {
        const camStream = streams[camKey];
        let finalStream = camStream;
        if (recordOptions.mic && recordOptions.micIds && recordOptions.micIds.length > 0) {
          const audioTracks = recordOptions.micIds.flatMap(mid =>
            micStreams['mic_' + mid]?.getAudioTracks() ?? []
          );
          const combinedStream = new MediaStream([
            ...camStream.getVideoTracks(),
            ...audioTracks,
          ]);
          finalStream = combinedStream;
          activeStreamsRef.current.push(combinedStream);
        }
        const recorderOptions = getRecorderOptions(true, recordOptions.mic);
        newChunks[camKey] = [];
        const recorder = new MediaRecorder(finalStream, recorderOptions);
        recorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) {
            newChunks[camKey].push(e.data);
            setRecordingSize(prevSize => prevSize + e.data.size);
          }
        };
        recorder.onstop = () => {
          const videoBlob = new Blob(newChunks[camKey], { type: 'video/webm' });
          newVideoUrls[camKey] = URL.createObjectURL(videoBlob);
          setVideoUrls({ ...newVideoUrls });
        };
        newMediaRecorders[camKey] = recorder;
        recorder.start(1000);
      }

      // For screen stream
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
          activeStreamsRef.current.push(combinedStream);
        }
        const recorderOptions = getRecorderOptions(true, recordOptions.mic);
        newChunks['screen'] = [];
        const recorder = new MediaRecorder(finalStream, recorderOptions);
        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) {
            newChunks['screen'].push(e.data);
            setRecordingSize(prevSize => prevSize + e.data.size);
          }
        };
        recorder.onstop = () => {
          const videoBlob = new Blob(newChunks['screen'], { type: 'video/webm' });
          newVideoUrls['screen'] = URL.createObjectURL(videoBlob);
          setVideoUrls({...newVideoUrls});
        };
        newMediaRecorders['screen'] = recorder;
        recorder.start(1000);
      }

      // For each mic stream, record audio-only
      if (recordOptions.mic && recordOptions.micIds && recordOptions.micIds.length > 0) {
        for (const micId of recordOptions.micIds) {
          const micKey = 'mic_' + micId;
          const micStream = micStreams[micKey];
          if (!micStream) continue;
          const recorderOptions = getRecorderOptions(false, true);
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
          recorder.start(1000);
        }
      }

      setMediaRecorders(newMediaRecorders);
      chunks.current = newChunks;
      setRecording(true);
    } catch (err) {
      console.error('Recording error:', err);
      cleanupRecording();
      setPermissionError('Could not start recording: ' + err);
    }
  };

  // Stop recording
  const stopRecording = () => {
    if (recordOptions.screenIds.includes('main')) {
      setSavedStatus(prev => ({ ...prev, screen: false }));
    }
    if (recordOptions.cameraIds && recordOptions.cameraIds.length > 0) {
      setSavedStatus(prev => ({ ...prev, camera: false }));
    }
    if (recordOptions.mic && recordOptions.micIds && recordOptions.micIds.length > 0) {
      setSavedStatus(prev => ({ ...prev, mic: false }));
    }
    cleanupRecording();
  };

  // Clear all handlers
  const handleClearAll = () => {
    setShowClearConfirmation(true);
  };

  const confirmClear = () => {
    setRecordedChunks([]);
    setVideoUrls({});
    setAudioUrls({});
    chunks.current = {};
    setSavedStatus({});
    setShowClearConfirmation(false);
    setHasCleared(true);
  };

  const cancelClear = () => {
    setShowClearConfirmation(false);
  };

  // Video preview component
  const VideoPreview: React.FC<{ src: string; title: string }> = ({ src, title }) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [orientation, setOrientation] = useState<'portrait' | 'landscape'>('landscape');
    
    useEffect(() => {
      const video = videoRef.current;
      if (!video) return;
      
      const handleLoadedMetadata = () => {
        const { videoWidth, videoHeight } = video;
        if (videoWidth && videoHeight) {
          setOrientation(videoHeight > videoWidth ? 'portrait' : 'landscape');
        }
      };
      
      video.addEventListener('loadedmetadata', handleLoadedMetadata);
      return () => {
        video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      };
    }, [src]);
    
    return (
      <div style={{ marginBottom: '20px', textAlign: 'center' }}>
        <h3>{title}</h3>
        <video
          ref={videoRef}
          src={src}
          controls
          className={`video-preview ${orientation === 'portrait' ? 'portrait-video' : ''}`}
          style={{
            maxWidth: orientation === 'portrait' ? '300px' : '100%',
            transform: 'none'
          }}
        />
      </div>
    );
  };

  // Browser notice component
  const BrowserNotice: React.FC = () => {
    const { isSafari, isFirefox, isIncognito } = getBrowserInfo();
    
    if (!isSafari && !isFirefox && !isIncognito) return null;
    
    return (
      <div style={{
        background: '#2a2a2a',
        border: '1px solid #ff61f4',
        borderRadius: '8px',
        padding: '12px',
        marginBottom: '20px',
        fontSize: '0.9rem',
        color: '#fff'
      }}>
        {isSafari && (
          <p>📱 Safari detected: Screen recording is not supported. Camera and microphone recording available.</p>
        )}
        {isFirefox && (
          <p>🦊 Firefox detected: Full support available. Grant permissions when prompted.</p>
        )}
        {isIncognito && (
          <p>🕵️ Private browsing detected: Some features may be limited. Exit private mode for full functionality.</p>
        )}
      </div>
    );
  };

  // Effects
  useEffect(() => {
    checkPermissions();
  }, []);

  useEffect(() => {
    setSupportsDisplayMedia(typeof (navigator.mediaDevices as any).getDisplayMedia === 'function');
  }, []);

  useEffect(() => {
    const screenWidth = window.screen.width;
    const screenHeight = window.screen.height;
    setAvailableScreenResolutions([
      `${screenWidth}x${screenHeight}`,
      "1920x1080",
      "1280x720",
      "640x480",
    ]);
  }, []);

  useEffect(() => {
    setFullScreenResolution(getFullScreenResolutionLabel());
  }, []);

  useEffect(() => {
    const screenWidth = Math.floor(window.screen.width * window.devicePixelRatio);
    const screenHeight = Math.floor(window.screen.height * window.devicePixelRatio);
    setActualScreenResolution(`${screenWidth}x${screenHeight}`);
  }, []);

  useEffect(() => {
    const width = window.screen.width;
    const height = window.screen.height;
    setScreenDevices([
      {
        deviceId: "main",
        label: actualScreenResolution
          ? `Screen (${actualScreenResolution})`
          : "Screen (Detecting...)",
        width,
        height,
      }
    ]);
  }, [actualScreenResolution]);

  useEffect(() => {
    getAvailableDevices();
    (async () => {
      try {
        const status = await navigator.permissions.query({ name: "camera" as PermissionName });
        setCameraPermission(status.state);
      } catch {
        setCameraPermission("unknown");
      }
    })();
  }, []);

  useEffect(() => {
    const width = window.screen.width;
    const height = window.screen.height;
    let label = "";
    if (height >= 2160 || width >= 3840) {
      label = "4k";
    } else if (height >= 1440 || width >= 2560) {
      label = "1440p";
    } else if (height >= 1080 || width >= 1920) {
      label = "1080p";
    } else if (height >= 720 || width >= 1280) {
      label = "720p";
    } else if (height >= 480 || width >= 854) {
      label = "480p";
    } else if (height >= 360 || width >= 640) {
      label = "360p";
    } else {
      label = `${width}x${height}`;
    }
    setMaxResolutionLabel(label);
  }, [fullScreenResolution]);

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

  useEffect(() => {
    let allChunks: Blob[] = [];
    if (chunks.current) {
      Object.values(chunks.current).forEach(arr => {
        if (Array.isArray(arr)) {
          allChunks = allChunks.concat(arr);
        }
      });
    }
    setRecordedChunks(allChunks);
  }, [videoUrls, audioUrls]);

  // Main render
  return (
    <div className="App">
      <div className="App-header">
        <span className="header-subtitle" style={{ marginBottom: '10px' }}>100% vibe coded</span>
        <h1 className="header-title" style={{ marginTop: 0, marginBottom: '14px' }}>Screen Recorder App</h1>
        <p className="header-description" style={{ marginTop: '0', marginBottom: '18px' }}>
          Capture your devices with ease!
        </p>
        <BrowserNotice />
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
            <div className="settings-control" style={{ flex: 1 }}>
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
                        className="styled-checkbox"
                      />
                      Screen
                    </label>
                    {recordOptions.screenIds.length > 0 && (
                      <div className="device-submenu">
                        {!isMobile ? (
                          screenDevices.map((device, index) => {
                            let width: number | undefined = device.width, height: number | undefined = device.height;
                            if ((width === undefined || height === undefined) && device.label) {
                              const match = device.label.match(/(\d+)x(\d+)/);
                              if (match) {
                                width = parseInt(match[1], 10);
                                height = parseInt(match[2], 10);
                              }
                            }
                            let label = "";
                            if (device.label) {
                              label = device.label.replace(/\s*\(\d+x\d+\)/, "");
                            } else {
                              label = `Screen ${index + 1}`;
                            }
                            if (width && height) {
                              label += ` (${width}x${height})`;
                            }
                            if (device.deviceId === "main" && actualScreenResolution) {
                              label = `Screen (${actualScreenResolution})`;
                            }
                            return (
                              <label key={device.deviceId}>
                                <input
                                  type="checkbox"
                                  checked={recordOptions.screenIds.includes(device.deviceId)}
                                  onChange={(e) => {
                                    let screenIds = [...recordOptions.screenIds];
                                    if (e.target.checked) {
                                      if (!screenIds.includes(device.deviceId)) screenIds.push(device.deviceId);
                                    } else {
                                      screenIds = screenIds.filter((id) => id !== device.deviceId);
                                    }
                                    setRecordOptions({ ...recordOptions, screenIds });
                                  }}
                                  className="styled-checkbox"
                                />
                                <span className="device-label">
                                  {label}
                                  {recordOptions.screenIds.includes(device.deviceId) && (
                                    <span
                                      className={`device-permission ${
                                        permissionStatus.screen === 'denied'
                                          ? 'status-denied'
                                          : permissionStatus.screen === 'granted'
                                          ? 'status-granted'
                                          : 'status-unknown'
                                      }`}
                                    >
                                      : {permissionStatus.screen || 'TBD'}
                                    </span>
                                  )}
                                </span>
                              </label>
                            );
                          })
                        ) : (
                          <p style={{ color: '#bbb', fontSize: '0.85rem', marginTop: '0.5rem' }}>
                            Screen recording is not supported on mobile devices. Please try on desktop.
                          </p>
                        )}
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
                        className="styled-checkbox"
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
                              className="styled-checkbox"
                            />
                            <span className="device-label">
                              {device.label || `Mic ${device.deviceId.slice(-4)}`}
                              {recordOptions.micIds.includes(device.deviceId) && (
                                <span
                                  className={`device-permission ${
                                    permissionStatus.microphone === 'denied'
                                      ? 'status-denied'
                                      : permissionStatus.microphone === 'granted'
                                      ? 'status-granted'
                                      : 'status-unknown'
                                  }`}
                                >
                                  : {permissionStatus.microphone || 'TBD'}
                                </span>
                              )}
                            </span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                  {/* Camera */}
                  <div className={`option-block${selectedCamera ? ' has-submenu' : ''}`}>
                    <label className="options-checkbox">
                      <input
                        type="checkbox"
                        checked={!!selectedCamera}
                        onChange={e => {
                          if (e.target.checked) {
                            if (cameraDevices.length > 0) {
                              setSelectedCamera(cameraDevices[0]);
                              setRecordOptions({ ...recordOptions, cameraIds: [cameraDevices[0].deviceId] });
                            }
                          } else {
                            setSelectedCamera(null);
                            setRecordOptions({ ...recordOptions, cameraIds: [] });
                          }
                        }}
                        className="styled-checkbox"
                      />
                      Camera
                    </label>
                    {selectedCamera && (
                      <div className="device-submenu">
                        {cameraDevices.map((device) => (
                          <label key={device.deviceId} className="device-item">
                            <input
                              type="radio"
                              name="cameraSelection"
                              checked={selectedCamera?.deviceId === device.deviceId}
                              onChange={() => {
                                setSelectedCamera(device);
                                setRecordOptions({ ...recordOptions, cameraIds: [device.deviceId] });
                              }}
                            />
                            <span className="device-label">{device.label || "Camera"}</span>
                            <span className={`device-permission${cameraPermission === "granted" ? " granted" : ""}`}>{cameraPermission === "granted" ? ":granted" : ""}</span>
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

        {/* Settings */}
        <div className="settings-group">
          <div className="settings-grid">
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
                {(() => {
                  const availableResolutions = [
                    { label: "720p", width: 1280, height: 720, value: "720p" },
                    { label: "1080p", width: 1920, height: 1080, value: "1080p" },
                  ];
                  const physicalHeight = Math.floor(window.screen.height * window.devicePixelRatio);
                  if (physicalHeight >= 1440) {
                    availableResolutions.push({ label: "1440p", width: 2560, height: 1440, value: "1440p" });
                  }
                  if (physicalHeight >= 2160) {
                    availableResolutions.push({ label: "4k", width: 3840, height: 2160, value: "4k" });
                  }
                  availableResolutions.push({
                    label: `Max (${window.screen.width}×${window.screen.height})`,
                    width: window.screen.width,
                    height: window.screen.height,
                    value: "fullscreen"
                  });
                  const extraResolutions = [
                    { label: "480p", width: 854, height: 480, value: "480p" },
                    { label: "360p", width: 640, height: 360, value: "360p" },
                  ];
                  const allResolutions = [
                    ...availableResolutions,
                    ...extraResolutions.filter(er => !availableResolutions.some(r => r.value === er.value)),
                  ];
                  const sortedResolutions = [
                    ...allResolutions.filter(r => r.value === "fullscreen"),
                    ...allResolutions.filter(r => r.value !== "fullscreen").sort((a, b) => b.height - a.height),
                  ];
                  return (
                    <select
                      className="control-select"
                      value={videoResolution}
                      onChange={e => setVideoResolution(e.target.value as any)}
                      style={{ width: "200px" }}
                    >
                      {sortedResolutions.map(r => (
                        <option key={r.value} value={r.value}>
                          {r.value === "fullscreen" ? `Max (${actualScreenResolution})` : r.label}
                        </option>
                      ))}
                    </select>
                  );
                })()}
              </div>
            </div>
          </div>
        </div>

        <div className="action-buttons">
          <button className="btn" onClick={startRecording} disabled={recording}>
            Start Recording
          </button>
          <button className="neon-stop" onClick={stopRecording} disabled={!recording}>
            Stop Recording
          </button>
        </div>

        {/* Permission error modal */}
        {permissionError && (
          <div className="custom-modal">
            <div className="modal-content">
              <p style={{ whiteSpace: "pre-line" }}>
                {permissionError === "No recording options selected."
                  ? "Please select a recording device."
                  : permissionError}
              </p>
              {permissionError === "No recording options selected." ? (
                <button onClick={() => setPermissionError(null)} className="btn neon-stop">
                  OK
                </button>
              ) : (
                <>
                  <button onClick={retryPermissions} className="btn" style={{ marginRight: "8px" }}>
                    Retry Permissions
                  </button>
                  <button onClick={() => setPermissionError(null)} className="btn neon-stop">
                    Resume
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {isConverting && (
          <div className="converting-text">Converting... Please wait.</div>
        )}

        {recording && (
          <>
            <div className="recording-timer">
              ⏺ Recording: {formatTime(recordingTime)}
            </div>
            <div className={`recording-size${
              recordingSize > 1024 * 1024 * 1024 ? ' danger' : 
              recordingSize > 500 * 1024 * 1024 ? ' warning' : ''
            }`}>
              {formatSize(calculateTotalRecordingSize() || calculateEstimatedSize(recordingTime, {
                hasVideo: recordOptions.screenIds.length > 0 || recordOptions.cameraIds.length > 0,
                videoResolution,
                hasAudio: recordOptions.mic && recordOptions.micIds.length > 0,
                audioQuality
              }))}
              {recordingSize > 1024 * 1024 * 1024 && " ⚠️ Recording may become unstable"}
              {recordingSize > 500 * 1024 * 1024 && recordingSize <= 1024 * 1024 * 1024 && " ⚠️ Large file size"}
            </div>
          </>
        )}

        {/* Previews */}
        <div className="preview-controls" style={{display:"flex",flexDirection:"column",alignItems:"center"}}>
          {saveMessage && (
            <div className="save-toast" style={{
              background: '#222',
              color: '#fff',
              padding: '10px 22px',
              borderRadius: '8px',
              margin: '12px 0',
              boxShadow: '0 2px 12px #0007',
              fontWeight: 500,
              zIndex: 1000,
            }}>
              {saveMessage}
              <button
                style={{
                  marginLeft: 18,
                  background: 'transparent',
                  color: '#fff',
                  border: 'none',
                  fontSize: '1.2em',
                  cursor: 'pointer'
                }}
                onClick={() => setSaveMessage(null)}
                aria-label="Close"
              >×</button>
            </div>
          )}
          {recordOptions.screenIds.includes('main') && videoUrls.screen && (
            <div style={{marginBottom: '20px', textAlign: 'center'}}>
              <VideoPreview src={videoUrls.screen} title="Screen Video" />
              <div className="save-button-container">
                <button
                  className="neon-save"
                  onClick={() => handleDownload(chunks.current['screen'] || [], generateFilename("screen", videoResolution), 'screen')}
                >
                  {savedStatus['screen'] ? 'Saved' : 'Save'}
                </button>
                <button
                  className="neon-save"
                  onClick={() => {
                    const chunksArr = chunks.current['screen'] || [];
                    if (!chunksArr.length) return;
                    const blob = new Blob(chunksArr, { type: 'video/webm' });
                    const fileName = generateFilename("screen", videoResolution);
                    if (navigator.share && blob) {
                      const file = new File([blob], fileName, { type: blob.type });
                      navigator.share({
                        title: 'Screen Recording',
                        text: 'Check out this recording!',
                        files: [file],
                      });
                    } else {
                      handleDownload(blob, fileName, 'screen');
                    }
                  }}
                >
                  Share
                </button>
                <span className="file-size">
                  {formatSize(chunks.current['screen']?.reduce((acc, chunk) => acc + chunk.size, 0) || 0)}
                </span>
              </div>
            </div>
          )}
          {selectedCamera && videoUrls['camera_' + selectedCamera.deviceId] && (
            <div key={selectedCamera.deviceId} style={{marginBottom: '20px', textAlign: 'center'}}>
              <VideoPreview 
                src={videoUrls['camera_' + selectedCamera.deviceId]} 
                title={`Camera ${selectedCamera.label || `Camera ${selectedCamera.deviceId.slice(-4)}`}`}
              />
              <div className="save-button-container">
                <button
                  className="neon-save"
                  onClick={() => handleDownload(chunks.current['camera_' + selectedCamera.deviceId] || [], generateFilename("cam", videoResolution), 'camera')}
                  style={{marginTop: '8px'}}
                >
                  {savedStatus['camera'] ? 'Saved' : 'Save'}
                </button>
                <button
                  className="neon-save"
                  onClick={() => {
                    const chunksArr = chunks.current['camera_' + selectedCamera.deviceId] || [];
                    if (!chunksArr.length) return;
                    const blob = new Blob(chunksArr, { type: 'video/webm' });
                    const fileName = generateFilename("cam", videoResolution);
                    if (navigator.share && blob) {
                      const file = new File([blob], fileName, { type: blob.type });
                      navigator.share({
                        title: 'Screen Recording',
                        text: 'Check out this recording!',
                        files: [file],
                      });
                    } else {
                      handleDownload(blob, fileName, 'camera');
                    }
                  }}
                  style={{marginTop: '8px'}}
                >
                  Share
                </button>
                <span className="file-size">
                  {formatSize(chunks.current['camera_' + selectedCamera.deviceId]?.reduce((acc, chunk) => acc + chunk.size, 0) || 0)}
                </span>
              </div>
            </div>
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
                <div className="save-button-container">
                  <button
                    className="neon-save"
                    onClick={() => handleDownload(chunks.current['mic_' + micId] || [], generateFilename("mic", videoResolution), 'mic')}
                  >
                    {savedStatus['mic'] ? 'Saved' : 'Save'}
                  </button>
                  <button
                    className="neon-save"
                    onClick={() => {
                      const chunksArr = chunks.current['mic_' + micId] || [];
                      if (!chunksArr.length) return;
                      const blob = new Blob(chunksArr, { type: 'video/webm' });
                      const fileName = generateFilename("mic", videoResolution);
                      if (navigator.share && blob) {
                        const file = new File([blob], fileName, { type: blob.type });
                        navigator.share({
                          title: 'Screen Recording',
                          text: 'Check out this recording!',
                          files: [file],
                        });
                      } else {
                        handleDownload(blob, fileName, 'mic');
                      }
                    }}
                  >
                    Share
                  </button>
                  <span className="file-size">
                    {formatSize(chunks.current['mic_' + micId]?.reduce((acc, chunk) => acc + chunk.size, 0) || 0)}
                  </span>
                </div>
              </div>
            ) : null
          )}
        </div>
        
        {/* Clear All button */}
        {(recordedChunks.length > 0 || videoUrls.screen || Object.values(videoUrls).some(Boolean) || Object.values(audioUrls).some(Boolean)) && (
          <>
            <button
              className="clear-button"
              onClick={handleClearAll}
            >
              Clear All
            </button>
            {showClearConfirmation && (
              <div className="modal">
                <div className="modal-content">
                  <p>Are you sure you want to delete current recordings?</p>
                  <div className="popup-buttons">
                    <button className="popup-button confirm" onClick={confirmClear}>Yes</button>
                    <button className="popup-button cancel" onClick={cancelClear}>No</button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
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