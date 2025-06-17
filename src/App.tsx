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
  const isChrome = /Chrome/.test(ua) && /Google Inc/.test(navigator.vendor) && !/OPR/.test(ua) && !/Edge/.test(ua);
  const isSafari = /Safari/.test(ua) && /Apple Computer/.test(navigator.vendor) && !/Chrome/.test(ua) && !/CriOS/.test(ua);
  const isFirefox = /Firefox/.test(ua);
  const isEdge = /Edg/.test(ua);
  const isIncognito = !navigator.storage || !navigator.storage.estimate;
  const isMobileSafari = /Safari/.test(ua) && /iPhone|iPad|iPod/.test(ua) && !/Chrome/.test(ua) && !/CriOS/.test(ua);
  
  return { isChrome, isSafari, isFirefox, isEdge, isIncognito, isMobileSafari };
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
    const selectedResolution = resolution;
    const resolutionPart = selectedResolution && selectedResolution !== "fullscreen"
      ? selectedResolution.toLowerCase()
      : "";
    const resolutionTag = resolutionPart ? `screen${resolutionPart}` : "screen";
    return `${resolutionTag}_${formattedDate}_${formattedTime}.webm`;
  }

  return `${deviceName}_${formattedDate}_${formattedTime}.webm`;
};

// Get camera capabilities
const getCameraCapabilities = async (deviceId: string): Promise<string[]> => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { deviceId: { exact: deviceId } }
    });
    const track = stream.getVideoTracks()[0];
    const capabilities = track.getCapabilities ? track.getCapabilities() : null;
    track.stop();
    
    if (capabilities && capabilities.width && capabilities.height) {
      const maxWidth = capabilities.width.max;
      const maxHeight = capabilities.height.max;
      const resolutions = [];
      
      // Common resolutions to check
      const commonResolutions = [
        { width: 3840, height: 2160, label: "4K" },
        { width: 2560, height: 1440, label: "1440p" },
        { width: 1920, height: 1080, label: "1080p" },
        { width: 1280, height: 720, label: "720p" },
        { width: 854, height: 480, label: "480p" },
        { width: 640, height: 360, label: "360p" }
      ];
      
      for (const res of commonResolutions) {
        if (res.width <= maxWidth && res.height <= maxHeight) {
          resolutions.push(res.label);
        }
      }
      
      return resolutions;
    }
    return ["1080p", "720p", "480p"];
  } catch (err) {
    return ["1080p", "720p", "480p"];
  }
};

function App() {
  // Dark mode state
  const [darkMode, setDarkMode] = useState(true);
  
  // State declarations
  const [showClearConfirmation, setShowClearConfirmation] = useState(false);
  const [hasCleared, setHasCleared] = useState(false);
  const [savedStatus, setSavedStatus] = useState<{ [key: string]: boolean }>({});
  const [permissionStatus, setPermissionStatus] = useState<Record<string, string>>({});
  const [isConverting, setIsConverting] = useState(false);
  const [audioQuality, setAudioQuality] = useState('best');
  const [fileFormat, setFileFormat] = useState('webm');
  const [videoResolution, setVideoResolution] = useState<'fullscreen' | '1080p' | '720p' | '480p' | '360p'>('fullscreen');
  const [cameraResolutions, setCameraResolutions] = useState<{[deviceId: string]: string}>({});
  const [availableCameraResolutions, setAvailableCameraResolutions] = useState<{[deviceId: string]: string[]}>({});
  const [permissionError, setPermissionError] = useState<string | null>(null);
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
  const [hasRequestedPermissions, setHasRequestedPermissions] = useState(false);

  // Refs
  const ffmpeg = useRef<any>(null);
  const activeStreamsRef = useRef<MediaStream[]>([]);
  const chunks = useRef<{[key:string]: Blob[]}>({});
  const clearConfirmationRef = useRef<HTMLDivElement>(null);

  // Constants
  const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const bitsPerSecond = {
    low: 2_000_000,
    mid: 4_000_000,
    best: 8_000_000,
  };

  // Update document title
  useEffect(() => {
    document.title = "Si Recorder";
  }, []);

  // Apply dark mode class to body
  useEffect(() => {
    if (darkMode) {
      document.body.classList.add('dark-mode');
      document.body.classList.remove('light-mode');
    } else {
      document.body.classList.remove('dark-mode');
      document.body.classList.add('light-mode');
    }
  }, [darkMode]);

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

  // Check permissions without requesting
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

  // Get available devices without requesting permissions
  const getAvailableDevices = async (requestPermissions = false) => {
    try {
      if (requestPermissions && !hasRequestedPermissions) {
        // Only request permissions when explicitly needed
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
          stream.getTracks().forEach(track => track.stop());
          setHasRequestedPermissions(true);
        } catch (err) {
          console.log('Permission denied or not available');
        }
      }

      const devices = await navigator.mediaDevices.enumerateDevices();
      let videoDevices = devices.filter(device => device.kind === 'videoinput');
      let audioDevices = devices.filter(device => device.kind === 'audioinput');
      
      // Enhanced camera labeling
      const cameraLabels = new Map<string, number>();
      const frontCameras: MediaDeviceInfo[] = [];
      const rearCameras: MediaDeviceInfo[] = [];
      const unknownCameras: MediaDeviceInfo[] = [];
      
      videoDevices.forEach((device, idx) => {
        let label = device.label;
        const deviceIdLower = device.deviceId.toLowerCase();
        
        if (!label || label.trim() === "") {
          if (deviceIdLower.includes('front') || deviceIdLower.includes('user')) {
            label = `Front Camera`;
            frontCameras.push({ ...device, label });
          } else if (deviceIdLower.includes('back') || deviceIdLower.includes('environment')) {
            label = `Rear Camera`;
            rearCameras.push({ ...device, label });
          } else {
            label = `Camera ${idx + 1}`;
            unknownCameras.push({ ...device, label });
          }
        } else {
          // Categorize based on existing labels
          const labelLower = label.toLowerCase();
          if (labelLower.includes('front') || labelLower.includes('facing user') || labelLower.includes('facetime')) {
            frontCameras.push({ ...device, label: 'Front Camera' });
          } else if (labelLower.includes('back') || labelLower.includes('rear') || labelLower.includes('facing environment')) {
            rearCameras.push({ ...device, label: 'Rear Camera' });
          } else {
            unknownCameras.push(device);
          }
        }
      });
      
      // Number duplicate labels
      const numberDuplicates = (cameras: MediaDeviceInfo[], baseLabel: string) => {
        if (cameras.length > 1) {
          return cameras.map((cam, idx) => ({
            ...cam,
            label: `${baseLabel} ${idx + 1}`
          }));
        }
        return cameras;
      };
      
      const numberedFront = numberDuplicates(frontCameras, 'Front Camera');
      const numberedRear = numberDuplicates(rearCameras, 'Rear Camera');
      
      videoDevices = [...numberedFront, ...numberedRear, ...unknownCameras];
      
      // Enhanced microphone labeling
      audioDevices = audioDevices.map((device, idx) => {
        let label = device.label;
        if (!label || label.trim() === "") {
          label = `Microphone ${idx + 1}`;
        } else {
          // Try to identify front/rear mics
          const labelLower = label.toLowerCase();
          if (labelLower.includes('front') || labelLower.includes('bottom')) {
            label = 'Front Microphone';
          } else if (labelLower.includes('back') || labelLower.includes('rear') || labelLower.includes('top')) {
            label = 'Rear Microphone';
          }
        }
        return { ...device, label };
      });
      
      setCameraDevices(videoDevices);
      setMicDevices(audioDevices);
      
      // Get camera resolutions for each device
      for (const camera of videoDevices) {
        const resolutions = await getCameraCapabilities(camera.deviceId);
        setAvailableCameraResolutions(prev => ({
          ...prev,
          [camera.deviceId]: resolutions
        }));
        // Set default resolution
        setCameraResolutions(prev => ({
          ...prev,
          [camera.deviceId]: resolutions[0] || '1080p'
        }));
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

    // Clean up old video URLs to free memory
    Object.values(videoUrls).forEach(url => {
      if (url) URL.revokeObjectURL(url);
    });
    Object.values(audioUrls).forEach(url => {
      if (url) URL.revokeObjectURL(url);
    });

    setMediaRecorders({});
    setRecording(false);
    setRecordingSize(0);
  };

  // Get camera constraints based on resolution
  const getCameraConstraints = (deviceId: string, resolution: string) => {
    const constraints: any = {
      deviceId: { exact: deviceId }
    };
    
    switch (resolution) {
      case '4K':
        constraints.width = { ideal: 3840 };
        constraints.height = { ideal: 2160 };
        break;
      case '1440p':
        constraints.width = { ideal: 2560 };
        constraints.height = { ideal: 1440 };
        break;
      case '1080p':
        constraints.width = { ideal: 1920 };
        constraints.height = { ideal: 1080 };
        break;
      case '720p':
        constraints.width = { ideal: 1280 };
        constraints.height = { ideal: 720 };
        break;
      case '480p':
        constraints.width = { ideal: 854 };
        constraints.height = { ideal: 480 };
        break;
      case '360p':
        constraints.width = { ideal: 640 };
        constraints.height = { ideal: 360 };
        break;
    }
    
    return constraints;
  };

  // Start recording
  const startRecording = async () => {
    try {
      // Request permissions if not already done
      if (!hasRequestedPermissions) {
        await getAvailableDevices(true);
      }

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
      if (recordOptions.screenIds.includes('main') && supportsDisplayMedia && !isMobile) {
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
            setPermissionError('Could not get microphone: ' + (err?.message || err));
            cleanupRecording();
            return;
          }
        }
      }

      // Get camera streams if selected
      if (recordOptions.cameraIds && recordOptions.cameraIds.length > 0) {
        for (const camId of recordOptions.cameraIds) {
          try {
            const resolution = cameraResolutions[camId] || '1080p';
            const constraints = getCameraConstraints(camId, resolution);
            
            const camStream = await navigator.mediaDevices.getUserMedia({
              video: constraints
            });
            streams['camera_' + camId] = camStream;
            activeStreamsRef.current.push(camStream);
            streamKeys.push('camera_' + camId);
          } catch (err: any) {
            setPermissionError('Could not access camera: ' + (err?.message || err));
            cleanupRecording();
            return;
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
      const newVideoUrls: {[key:string]: string | null} = {};
      const newAudioUrls: {[key:string]: string | null} = {};

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
          setVideoUrls(prev => ({ ...prev, [camKey]: newVideoUrls[camKey] }));
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
          setVideoUrls(prev => ({ ...prev, screen: newVideoUrls['screen'] }));
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
            setAudioUrls(prev => ({ ...prev, [micKey]: newAudioUrls[micKey] }));
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
    recordOptions.cameraIds.forEach(camId => {
      setSavedStatus(prev => ({ ...prev, ['camera_' + camId]: false }));
    });
    recordOptions.micIds.forEach(micId => {
      setSavedStatus(prev => ({ ...prev, ['mic_' + micId]: false }));
    });
    cleanupRecording();
  };

  // Clear all handlers
  const handleClearAll = () => {
    setShowClearConfirmation(true);
  };

  const confirmClear = () => {
    // Clean up old URLs
    Object.values(videoUrls).forEach(url => {
      if (url) URL.revokeObjectURL(url);
    });
    Object.values(audioUrls).forEach(url => {
      if (url) URL.revokeObjectURL(url);
    });
    
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

  // Video preview component with proper orientation
  const VideoPreview: React.FC<{ src: string; title: string; deviceId?: string }> = ({ src, title, deviceId }) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [orientation, setOrientation] = useState<'portrait' | 'landscape'>('landscape');
    const [duration, setDuration] = useState(0);
    
    useEffect(() => {
      const video = videoRef.current;
      if (!video) return;
      
      const handleLoadedMetadata = () => {
        const { videoWidth, videoHeight } = video;
        if (videoWidth && videoHeight) {
          setOrientation(videoHeight > videoWidth ? 'portrait' : 'landscape');
        }
        setDuration(video.duration);
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
            transform: 'none',
            objectFit: 'contain'
          }}
        />
      </div>
    );
  };

  // Browser notice component
  const BrowserNotice: React.FC = () => {
    const { isSafari, isFirefox, isIncognito, isMobileSafari } = getBrowserInfo();
    
    // Don't show on mobile unless it's mobile Safari
    if (isMobile && !isMobileSafari) return null;
    
    // Only show for desktop Safari, Firefox, or incognito mode
    if (!isSafari && !isFirefox && !isIncognito) return null;
    
    return (
      <div className="browser-notice">
        {isSafari && !isMobile && (
          <p>📱 Safari detected: Limited recording support. For best experience, use Chrome or Firefox.</p>
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
    getAvailableDevices(false); // Don't request permissions on load
  }, []);

  useEffect(() => {
    setSupportsDisplayMedia(typeof (navigator.mediaDevices as any).getDisplayMedia === 'function');
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

  // Check if share is supported
  const isShareSupported = () => {
    return navigator.share !== undefined && navigator.canShare !== undefined;
  };

  // Main render
  return (
    <div className={`App ${darkMode ? 'dark-mode' : 'light-mode'}`}>
      <div className="App-header">
        <div className="theme-toggle">
          <button
            className="theme-toggle-btn"
            onClick={() => setDarkMode(!darkMode)}
            aria-label="Toggle theme"
          >
            {darkMode ? '☀️' : '🌙'}
          </button>
        </div>
        
        <span className="header-subtitle" style={{ marginBottom: '10px' }}>100% vibe coded</span>
        <h1 className="header-title" style={{ marginTop: 0, marginBottom: '14px' }}>Si Recorder</h1>
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
                          if (recording) return; // Prevent changes during recording
                          let screenIds = recordOptions.screenIds;
                          if (e.target.checked) {
                            screenIds = ['main'];
                          } else {
                            screenIds = [];
                          }
                          setRecordOptions({ ...recordOptions, screenIds });
                        }}
                        disabled={recording}
                        className="styled-checkbox"
                      />
                      Screen
                    </label>
                    {recordOptions.screenIds.length > 0 && (
                      <div className="device-submenu">
                        {!isMobile ? (
                          <>
                            {screenDevices.map((device, index) => {
                              let label = "";
                              if (device.deviceId === "main" && actualScreenResolution) {
                                label = `Screen (${actualScreenResolution})`;
                              }
                              return (
                                <label key={device.deviceId}>
                                  <input
                                    type="checkbox"
                                    checked={recordOptions.screenIds.includes(device.deviceId)}
                                    onChange={(e) => {
                                      if (recording) return;
                                      let screenIds = [...recordOptions.screenIds];
                                      if (e.target.checked) {
                                        if (!screenIds.includes(device.deviceId)) screenIds.push(device.deviceId);
                                      } else {
                                        screenIds = screenIds.filter((id) => id !== device.deviceId);
                                      }
                                      setRecordOptions({ ...recordOptions, screenIds });
                                    }}
                                    disabled={recording}
                                    className="styled-checkbox"
                                  />
                                  <span className="device-label">
                                    {label}
                                    {recordOptions.screenIds.includes(device.deviceId) && (
                                      <span className="device-permission">
                                        : {permissionStatus.screen || 'TBD'}
                                      </span>
                                    )}
                                  </span>
                                </label>
                              );
                            })}
                            {/* Resolution dropdown for screen */}
                            <div className="settings-row submenu-dropdown">
                              <div className="settings-label">Resolution:</div>
                              <select
                                className="control-select"
                                value={videoResolution}
                                onChange={e => setVideoResolution(e.target.value as any)}
                                disabled={recording}
                              >
                                <option value="fullscreen">Max ({actualScreenResolution})</option>
                                <option value="1080p">1080p</option>
                                <option value="720p">720p</option>
                                <option value="480p">480p</option>
                                <option value="360p">360p</option>
                              </select>
                            </div>
                          </>
                        ) : (
                          <p style={{ color: '#bbb', fontSize: '0.85rem', marginTop: '0.5rem' }}>
                            Screen recording is not supported on mobile devices.
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
                          if (recording) return;
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
                        disabled={recording}
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
                                if (recording) return;
                                let micIds = [...recordOptions.micIds];
                                if (e.target.checked) {
                                  if (!micIds.includes(device.deviceId)) micIds.push(device.deviceId);
                                } else {
                                  micIds = micIds.filter(id => id !== device.deviceId);
                                }
                                setRecordOptions({ ...recordOptions, micIds });
                              }}
                              disabled={recording}
                              className="styled-checkbox"
                            />
                            <span className="device-label">
                              {device.label || `Mic ${device.deviceId.slice(-4)}`}
                              {recordOptions.micIds.includes(device.deviceId) && (
                                <span className="device-permission">
                                  : {permissionStatus.microphone || 'TBD'}
                                </span>
                              )}
                            </span>
                          </label>
                        ))}
                        {/* Audio quality dropdown */}
                        <div className="settings-row submenu-dropdown">
                          <div className="settings-label">Quality:</div>
                          <select
                            className="control-select"
                            value={audioQuality}
                            onChange={e => setAudioQuality(e.target.value)}
                            disabled={recording}
                          >
                            <option value="low">Low (64kbps)</option>
                            <option value="mid">Mid (128kbps)</option>
                            <option value="best">Best (256kbps)</option>
                          </select>
                        </div>
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
                          if (recording) return;
                          if (e.target.checked) {
                            if (cameraDevices.length > 0) {
                              setRecordOptions({ ...recordOptions, cameraIds: [cameraDevices[0].deviceId] });
                            }
                          } else {
                            setRecordOptions({ ...recordOptions, cameraIds: [] });
                          }
                        }}
                        disabled={recording}
                        className="styled-checkbox"
                      />
                      Camera
                    </label>
                    {recordOptions.cameraIds.length > 0 && (
                      <div className="device-submenu">
                        {cameraDevices.map((device) => (
                          <div key={device.deviceId}>
                            <label className="device-item">
                              <input
                                type="checkbox"
                                checked={recordOptions.cameraIds.includes(device.deviceId)}
                                onChange={() => {
                                  if (recording) return;
                                  let cameraIds = [...recordOptions.cameraIds];
                                  if (cameraIds.includes(device.deviceId)) {
                                    cameraIds = cameraIds.filter(id => id !== device.deviceId);
                                  } else {
                                    cameraIds.push(device.deviceId);
                                  }
                                  setRecordOptions({ ...recordOptions, cameraIds });
                                }}
                                disabled={recording}
                              />
                              <span className="device-label">{device.label || "Camera"}</span>
                              <span className="device-permission">
                                {recordOptions.cameraIds.includes(device.deviceId) && cameraPermission === "granted" ? ": granted" : ""}
                              </span>
                            </label>
                            {/* Camera resolution dropdown */}
                            {recordOptions.cameraIds.includes(device.deviceId) && availableCameraResolutions[device.deviceId] && (
                              <div className="settings-row submenu-dropdown camera-resolution">
                                <div className="settings-label">Resolution:</div>
                                <select
                                  className="control-select"
                                  value={cameraResolutions[device.deviceId] || '1080p'}
                                  onChange={e => setCameraResolutions(prev => ({
                                    ...prev,
                                    [device.deviceId]: e.target.value
                                  }))}
                                  disabled={recording}
                                >
                                  {availableCameraResolutions[device.deviceId].map(res => (
                                    <option key={res} value={res}>{res}</option>
                                  ))}
                                </select>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="action-buttons">
          <button className="btn" onClick={startRecording} disabled={recording}>
            Start Recording
          </button>
          <button 
            className={recording ? "neon-stop" : "btn-disabled"} 
            onClick={stopRecording} 
            disabled={!recording}
          >
            Stop Recording
          </button>
        </div>

        {/* Permission error modal */}
        {permissionError && (
          <div className="custom-modal">
            <div className="modal-content">
              <p style={{ whiteSpace: "pre-line" }}>
                {permissionError}
              </p>
              <button onClick={() => setPermissionError(null)} className="btn neon-stop">
                OK
              </button>
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
              background: darkMode ? '#222' : '#f0f0f0',
              color: darkMode ? '#fff' : '#000',
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
                  color: darkMode ? '#fff' : '#000',
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
                {isShareSupported() && (
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
                        }).catch(err => console.log('Share failed:', err));
                      }
                    }}
                  >
                    Share
                  </button>
                )}
                <span className="file-size">
                  {formatSize(chunks.current['screen']?.reduce((acc, chunk) => acc + chunk.size, 0) || 0)}
                </span>
              </div>
            </div>
          )}
          {recordOptions.cameraIds.map(camId => {
            const device = cameraDevices.find(d => d.deviceId === camId);
            if (!device || !videoUrls['camera_' + camId]) return null;
            
            return (
              <div key={camId} style={{marginBottom: '20px', textAlign: 'center'}}>
                <VideoPreview 
                  src={videoUrls['camera_' + camId]} 
                  title={`${device.label || 'Camera'}`}
                  deviceId={camId}
                />
                <div className="save-button-container">
                  <button
                    className="neon-save"
                    onClick={() => handleDownload(
                      chunks.current['camera_' + camId] || [], 
                      generateFilename("cam", cameraResolutions[camId]), 
                      'camera_' + camId
                    )}
                  >
                    {savedStatus['camera_' + camId] ? 'Saved' : 'Save'}
                  </button>
                  {isShareSupported() && (
                    <button
                      className="neon-save"
                      onClick={() => {
                        const chunksArr = chunks.current['camera_' + camId] || [];
                        if (!chunksArr.length) return;
                        const blob = new Blob(chunksArr, { type: 'video/webm' });
                        const fileName = generateFilename("cam", cameraResolutions[camId]);
                        if (navigator.share && blob) {
                          const file = new File([blob], fileName, { type: blob.type });
                          navigator.share({
                            title: 'Camera Recording',
                            text: 'Check out this recording!',
                            files: [file],
                          }).catch(err => console.log('Share failed:', err));
                        }
                      }}
                    >
                      Share
                    </button>
                  )}
                  <span className="file-size">
                    {formatSize(chunks.current['camera_' + camId]?.reduce((acc, chunk) => acc + chunk.size, 0) || 0)}
                  </span>
                </div>
              </div>
            );
          })}
          {recordOptions.micIds.map(micId => {
            const device = micDevices.find(d => d.deviceId === micId);
            if (!device || !audioUrls['mic_' + micId]) return null;
            
            return (
              <div key={micId} style={{marginBottom: '20px', textAlign: 'center'}}>
                <h3>{device.label || `Mic ${micId.slice(-4)}`}</h3>
                <audio
                  src={audioUrls['mic_' + micId] || undefined}
                  controls
                />
                <div className="save-button-container">
                  <button
                    className="neon-save"
                    onClick={() => handleDownload(
                      chunks.current['mic_' + micId] || [], 
                      generateFilename("mic", audioQuality), 
                      'mic_' + micId
                    )}
                  >
                    {savedStatus['mic_' + micId] ? 'Saved' : 'Save'}
                  </button>
                  {isShareSupported() && (
                    <button
                      className="neon-save"
                      onClick={() => {
                        const chunksArr = chunks.current['mic_' + micId] || [];
                        if (!chunksArr.length) return;
                        const blob = new Blob(chunksArr, { type: 'audio/webm' });
                        const fileName = generateFilename("mic", audioQuality);
                        if (navigator.share && blob) {
                          const file = new File([blob], fileName, { type: blob.type });
                          navigator.share({
                            title: 'Audio Recording',
                            text: 'Check out this recording!',
                            files: [file],
                          }).catch(err => console.log('Share failed:', err));
                        }
                      }}
                    >
                      Share
                    </button>
                  )}
                  <span className="file-size">
                    {formatSize(chunks.current['mic_' + micId]?.reduce((acc, chunk) => acc + chunk.size, 0) || 0)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
        
        {/* Clear All button */}
        {(recordedChunks.length > 0 || Object.values(videoUrls).some(Boolean) || Object.values(audioUrls).some(Boolean)) && (
          <>
            <button
              className="clear-button"
              onClick={handleClearAll}
            >
              Clear All
            </button>
            {showClearConfirmation && (
              <div className="modal confirmation-modal-center">
                <div className="modal-content" ref={clearConfirmationRef}>
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