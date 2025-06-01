import React, { useState, useEffect, useRef } from 'react';
import './App.css';

// Utility function to get the full native screen resolution (physical pixels)
const getDeviceResolution = () => {
  const width = Math.floor(window.screen.width * window.devicePixelRatio);
  const height = Math.floor(window.screen.height * window.devicePixelRatio);
  return { width, height };
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
    // deviceName = resolution ? `screen${resolution}` : "screen"; // (removed old line)
  }

  return `${deviceName}_${formattedDate}_${formattedTime}.webm`;
};

// All hooks and related functions must be inside the App component!


function App() {
  // Camera facing mode selection state (user = front, environment = rear)
  const [cameraFacingMode, setCameraFacingMode] = useState<"user" | "environment">("user");
  // -- BEGIN: Top-level state for "Clear All" modal --
  const [showClearConfirmation, setShowClearConfirmation] = useState(false);
  const [hasCleared, setHasCleared] = useState(false);
  // Download helper function for blobs (video/audio)
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
      // Delay status update by 5 seconds to simulate confirmation
      setTimeout(() => {
        if (deviceName) {
          setSavedStatus(prev => ({ ...prev, [deviceName]: true }));
        }
      }, 2500);
    } catch (error) {
      console.error("Download failed:", error);
    }
  };
  // Track saved status for each device (screen, camera, mic)
  const [savedStatus, setSavedStatus] = useState<{ [key: string]: boolean }>({});
  // Mobile device detection
  const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  // Permission status state
  const [permissionStatus, setPermissionStatus] = useState<Record<string, string>>({});

  // Helper function to check permission status for camera and microphone
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
  // Check permission status on mount
  useEffect(() => {
    checkPermissions();
    // eslint-disable-next-line
  }, []);

  // Manual permission retry function
  const retryPermissions = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      stream.getTracks().forEach(track => track.stop()); // Stop immediately
      alert("Permissions granted. Please start recording again.");
      await checkPermissions();
    } catch (err: any) {
      alert("Still couldn't access camera or mic. Try restarting the browser or exiting incognito/guest mode.\n\nError: " + (err?.message || err));
      await checkPermissions();
    }
  };
  const ffmpeg = useRef<any>(null);
  const dirHandleRef = useRef<any>(null);
  // Track all active media streams for cleanup
  const activeStreamsRef = useRef<MediaStream[]>([]);

  const [isConverting, setIsConverting] = useState(false);

  // Video/audio quality options
  const bitsPerSecond = {
    low: 2_000_000,
    mid: 4_000_000,
    best: 8_000_000,
  };

  // --- Screen resolution label for UI ---
  // Always use device's full physical resolution (device pixels)
  const screenResolution = `${Math.floor(window.screen.width * window.devicePixelRatio)}x${Math.floor(window.screen.height * window.devicePixelRatio)}`;
  // For dropdowns, use this for "Max" option
  const screenResolutions = [`Max (${screenResolution})`, "1080p", "720p"];

  // Example: availableScreenResolutions state (for future use)
  const [availableScreenResolutions, setAvailableScreenResolutions] = useState<string[]>([]);
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
  const [permissionError, setPermissionError] = useState<string | null>(null);
  // Ensure selectedOption state is declared in the component body
  const [selectedOption, setSelectedOption] = useState<string | null>(null);

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
  // Utility: get the full native screen resolution (physical pixels)
  function getFullScreenResolutionLabel(): string {
    const width = Math.floor(window.screen.width * window.devicePixelRatio);
    const height = Math.floor(window.screen.height * window.devicePixelRatio);
    return `${width}x${height}`;
  }
  // Detect full screen resolution (physical screen, not browser window)
  const [fullScreenResolution, setFullScreenResolution] = useState<string>('');
  useEffect(() => {
    setFullScreenResolution(getFullScreenResolutionLabel());
  }, []);

  // Actual screen resolution in physical pixels (not CSS pixels)
  const [actualScreenResolution, setActualScreenResolution] = useState("");
  useEffect(() => {
    const screenWidth = Math.floor(window.screen.width * window.devicePixelRatio);
    const screenHeight = Math.floor(window.screen.height * window.devicePixelRatio);
    setActualScreenResolution(`${screenWidth}x${screenHeight}`);
  }, []);

  // Placeholder for future multi-screen support, label updated below
  // Now include width and height in the screenDevices state
  const [screenDevices, setScreenDevices] = useState<{ deviceId: string; label?: string; width?: number; height?: number }[]>([]);
  useEffect(() => {
    // Set up the label to include the actual detected screen resolution
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

  // Camera stream initialization with facingMode constraint
  useEffect(() => {
    // Example: initialize camera preview stream using cameraFacingMode
    // (This is a placeholder; adapt as needed for your actual preview logic)
    let cameraStream: MediaStream | null = null;
    const cameraConstraints = {
      video: { facingMode: cameraFacingMode }
    };
    async function initCamera() {
      try {
        cameraStream = await navigator.mediaDevices.getUserMedia(cameraConstraints);
        // TODO: Attach cameraStream to a video element for preview if needed
      } catch (err) {
        // Handle error if desired
      }
    }
    // Only run if camera preview is needed (not during actual recording)
    // Uncomment the next line to enable camera preview initialization:
    // initCamera();
    return () => {
      if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
      }
    };
  }, [cameraFacingMode]);

  // Helper to detect video orientation from a MediaStream
  const detectVideoOrientation = (stream: MediaStream): 'portrait' | 'landscape' => {
    const videoTrack = stream.getVideoTracks()[0];
    const settings = videoTrack.getSettings();
    if (settings.width && settings.height) {
      return settings.height > settings.width ? 'portrait' : 'landscape';
    }
    return 'landscape';
  };

  // Compute maxResolutionLabel based on detected screen resolution
  // Use "4k" for height >= 2160, "1440p" for height >= 1440, otherwise fallback to "1080p", etc.
  const [maxResolutionLabel, setMaxResolutionLabel] = useState("1080p");
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

  const startRecording = async () => {
    try {
      // First clean up any existing recording state
      cleanupRecording();
      // Always clear activeStreamsRef on new start
      activeStreamsRef.current = [];
      
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
          // Track this stream for cleanup
          activeStreamsRef.current.push(streams.screen);
          streamKeys.push('screen');
        } catch (err: any) {
          setPermissionError('Could not get screen stream.\nError: ' + (err?.message || err));
          cleanupRecording();
          return;
        }
      }

      // Get camera streams if selected
      if (recordOptions.cameraIds && recordOptions.cameraIds.length > 0) {
        for (const camId of recordOptions.cameraIds) {
          try {
            const cameraConstraints = {
              video: { deviceId: { exact: camId }, facingMode: cameraFacingMode }
            };
            const camStream = await navigator.mediaDevices.getUserMedia(cameraConstraints);
            streams['camera_' + camId] = camStream;
            // Track this stream for cleanup
            activeStreamsRef.current.push(camStream);
            streamKeys.push('camera_' + camId);
          } catch (err: any) {
            if (err.name === 'OverconstrainedError') {
              try {
                const cameraConstraints = {
                  video: { facingMode: cameraFacingMode }
                };
                const fallbackStream = await navigator.mediaDevices.getUserMedia(cameraConstraints);
                setPermissionError('Selected camera device is not available or does not support required constraints. Falling back to default camera.');
                streams['camera_' + camId] = fallbackStream;
                // Track fallback stream for cleanup
                activeStreamsRef.current.push(fallbackStream);
                streamKeys.push('camera_' + camId);
              } catch (fallbackErr: any) {
                setPermissionError('Could not get any camera stream.\nError: ' + (fallbackErr?.message || fallbackErr));
                cleanupRecording();
                return;
              }
            } else {
              setPermissionError('Could not get camera stream for device: ' + camId + '\nError: ' + (err?.message || err));
              cleanupRecording();
              return;
            }
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
            // Track this mic stream for cleanup
            activeStreamsRef.current.push(micStream);
          } catch (err: any) {
            try {
              await navigator.mediaDevices.getUserMedia({ audio: true });
              // Retry with specific mic
              const micStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                  deviceId: { exact: micId },
                  echoCancellation: true,
                  noiseSuppression: true,
                },
                video: false,
              });
              micStreams['mic_' + micId] = micStream;
              // Track this mic stream for cleanup
              activeStreamsRef.current.push(micStream);
            } catch (finalErr: any) {
              setPermissionError('Could not get microphone audio stream for device: ' + micId + '\nError: ' + (finalErr?.message || finalErr));
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
          // Track this combined stream for cleanup
          activeStreamsRef.current.push(combinedStream);
        }
        const recorderOptions: MediaRecorderOptions = {
          mimeType: 'video/webm',
          videoBitsPerSecond: bitsPerSecond['best'],
          audioBitsPerSecond: recordOptions.mic ? bitsPerSecond[audioQuality] : 0,
        };
        newChunks[camKey] = [];
        const recorder = new MediaRecorder(finalStream, {
          ...recorderOptions,
          timeslice: 1000, // Get data every second
        });
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
        recorder.start(1000); // <-- Only here, not in a later loop
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
          // Track this combined stream for cleanup
          activeStreamsRef.current.push(combinedStream);
        }
        const recorderOptions: MediaRecorderOptions = {
          mimeType: 'video/webm',
          videoBitsPerSecond: bitsPerSecond['best'],
          audioBitsPerSecond: recordOptions.mic ? bitsPerSecond[audioQuality] : 0,
        };
        newChunks['screen'] = [];
        const recorder = new MediaRecorder(finalStream, recorderOptions); // Remove timeslice here
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
        recorder.start(1000); // <-- Only here, not in a later loop
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
          recorder.start(1000); // <-- Only here, not in a later loop
        }
      }

      setMediaRecorders(newMediaRecorders);
      chunks.current = newChunks;
      setRecording(true);
    } catch (err) {
      console.error('Recording error:', err);
      cleanupRecording(); // Clean up on error
      setPermissionError('Could not start recording: ' + err);
    }
  };

  const stopRecording = () => {
    // Reset saved status for all relevant device types (screen, camera, mic)
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

  // UI feedback state for sharing/downloading
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  // "Save As" handler using File System Access API or fallback, with mobile sharing
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
      const isMobileTemp = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
      // Default to rear if we can't detect
      filename = (isMobileTemp ? 'cam-rear' : 'cam') + '.' + extension;
    }

    let blob: Blob | null = null;
    if (ffmpegArgs.length) {
      setIsConverting(true);
      await loadFFmpeg();

      // Fetch the recorded blob as a file
      blob = await fetch(url).then(r => r.blob());
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
      blob = convertedBlob;
      setIsConverting(false);
    } else {
      blob = await fetch(url).then(r => r.blob());
    }

    // --- Mobile sharing logic ---
    // Create file object for sharing
    const file = new File([blob], filename, { type: blob.type });
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    const shareSupported = !!navigator.canShare && navigator.canShare({ files: [file] });

    if (isMobile && shareSupported) {
      try {
        await navigator.share({
          title: filename,
          text: 'Screen recording',
          files: [file],
        });
        setSaveMessage('Video shared successfully!');
        console.log('Video shared successfully');
        return;
      } catch (error) {
        console.error('Sharing failed, falling back to download:', error);
        // If sharing fails, continue to download fallback
      }
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
        await writable.write(blob);
        await writable.close();
        setSaveMessage('File saved!');
      } catch (err) {
        if (!(err instanceof DOMException && err.name === 'AbortError')) {
          setSaveMessage('Error saving file: ' + err);
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
      setSaveMessage(
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

  // Add with your other state declarations
  const [recordingSize, setRecordingSize] = useState(0);

  // Replace your formatSize function with this:
  function formatSize(bytes: number) {
    const mb = bytes / (1024 * 1024);
    if (mb < 1 && mb > 0) {
      return `${mb.toFixed(2)} MB`;
    }
    return `${Math.round(mb)} MB`;
  }

  // Add this helper function near your other format functions
  function getFileSize(url: string | null): number {
    if (!url) return 0;
    const videoElement = document.createElement('video');
    videoElement.src = url;
    return videoElement.duration * (videoElement.videoWidth * videoElement.videoHeight * 3) / 8;
  }

  // (Optional) Adjust calculateEstimatedSize for more realistic webm bitrates:
  function calculateEstimatedSize(seconds: number, options: {
    hasVideo: boolean,
    videoResolution: string,
    hasAudio: boolean,
    audioQuality: string
  }): number {
    let totalBitsPerSecond = 0;

    // Use more typical MediaRecorder bitrates for webm/vp8
    if (options.hasVideo) {
      switch (options.videoResolution) {
        case '1080p':
          totalBitsPerSecond += 1_500_000; // 1.5 Mbps
          break;
        case '720p':
          totalBitsPerSecond += 1_000_000; // 1 Mbps
          break;
        case '480p':
          totalBitsPerSecond += 600_000; // 600 kbps
          break;
        case '360p':
          totalBitsPerSecond += 400_000; // 400 kbps
          break;
        default: // fullscreen
          totalBitsPerSecond += 1_200_000; // 1.2 Mbps
          break;
      }
    }

    // Audio bitrate (webm/opus is usually 64-128kbps)
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

  // Add this cleanup function at the top of your App component
  const cleanupRecording = () => {
    console.log("Cleaning up recording...");

    // Stop each active recorder (only if its state is "recording")
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

    // Stop all tracks from all active streams
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

    // Reset state variables
    setMediaRecorders({});
    setRecording(false);
    setRecordingSize(0);
  };

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

  // Add recordedChunks and handleClearAll for the Clear All button
  const [recordedChunks, setRecordedChunks] = useState<Blob[]>([]);
  // Populate recordedChunks whenever previews are available
  useEffect(() => {
    // Gather all chunks from current previews
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
  // Handler to clear all previews and chunks
  const handleClearAll = () => {
    setShowClearConfirmation(true);
  };
  // Confirm and cancel clear handlers for "Clear All" modal
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
  return (
    <div className="App">
      {/* Main App Container */}
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
                        className="styled-checkbox"
                      />
                      {/* Show the label as just "Screen" */}
                      Screen
                    </label>
                    {recordOptions.screenIds.length > 0 && (
                      <div className="device-submenu">
                        {/* Multi-screen dynamic rendering, mobile support */}
                    {!isMobile ? (
                      screenDevices.map((device, index) => {
                        // Prefer width/height from device, fallback to parsing label, fallback to undefined
                        let width: number | undefined = device.width, height: number | undefined = device.height;
                        if ((width === undefined || height === undefined) && device.label) {
                          const match = device.label.match(/(\d+)x(\d+)/);
                          if (match) {
                            width = parseInt(match[1], 10);
                            height = parseInt(match[2], 10);
                          }
                        }
                        // Compose the new label: always include resolution if available
                        let label = "";
                        if (device.label) {
                          // Remove any existing "(WxH)" part from label
                          label = device.label.replace(/\s*\(\d+x\d+\)/, "");
                        } else {
                          label = `Screen ${index + 1}`;
                        }
                        if (width && height) {
                          label += ` (${width}x${height})`;
                        }
                        // Update: show actualScreenResolution in label if present
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
                        className="styled-checkbox"
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
                              className="styled-checkbox"
                            />
                            <span className="device-label">
                              {device.label || `Camera ${device.deviceId.slice(-4)}`}
                              {recordOptions.cameraIds.includes(device.deviceId) && (
                                <span
                                  className={`device-permission ${
                                    permissionStatus.camera === 'denied'
                                      ? 'status-denied'
                                      : permissionStatus.camera === 'granted'
                                      ? 'status-granted'
                                      : 'status-unknown'
                                  }`}
                                >
                                  : {permissionStatus.camera || 'TBD'}
                                </span>
                              )}
                            </span>
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
                {(() => {
                  // Build availableResolutions as per instructions
                  const availableResolutions = [
                    { label: "720p", width: 1280, height: 720, value: "720p" },
                    { label: "1080p", width: 1920, height: 1080, value: "1080p" },
                  ];
                  // Use physical pixels for gating 1440p/4k
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
                  // Always add 480p and 360p for compatibility
                  const extraResolutions = [
                    { label: "480p", width: 854, height: 480, value: "480p" },
                    { label: "360p", width: 640, height: 360, value: "360p" },
                  ];
                  // Remove duplicates by value
                  const allResolutions = [
                    ...availableResolutions,
                    ...extraResolutions.filter(er => !availableResolutions.some(r => r.value === er.value)),
                  ];
                  // For dropdown, "fullscreen" (Max) should be first, then descending order
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


        {/* Modal for permission error, after permission status */}
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
              <h3>Screen Video</h3>
              <video
                src={videoUrls.screen}
                controls
                className="video-preview"
              />
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
                <div className="save-button-container">
                  <button
                    className="neon-save"
                    onClick={() => handleDownload(chunks.current['camera_' + camId] || [], generateFilename("cam", videoResolution), 'camera')}
                    style={{marginTop: '8px'}}
                  >
                    {savedStatus['camera'] ? 'Saved' : 'Save'}
                  </button>
                  <button
                    className="neon-save"
                    onClick={() => {
                      const chunksArr = chunks.current['camera_' + camId] || [];
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
                    {formatSize(chunks.current['camera_' + camId]?.reduce((acc, chunk) => acc + chunk.size, 0) || 0)}
                  </span>
                </div>
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
        {/* Updated Clear All button and modal logic */}
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
  // Example function for starting camera recording with updated constraints and orientation detection
  // You may need to integrate this function as needed in your codebase
  const startCameraRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: cameraFacingMode,
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: true,
      });
      const orientation = detectVideoOrientation(stream);
      console.log('Video orientation:', orientation);
      // ...the rest of your camera recording logic here...
    } catch (err) {
      console.error('Error starting camera recording:', err);
    }
  };