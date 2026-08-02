import React, { useState, useEffect, useRef } from 'react';
import './App.css';

type WebkitAudioWindow = Window & typeof globalThis & {
  webkitAudioContext?: typeof AudioContext;
};

type VideoResolution = 'fullscreen' | '1080p' | '720p' | '480p' | '360p';

const getErrorMessage = (err: unknown) => (
  err instanceof Error ? err.message : String(err)
);

const getAudioContextCtor = () => (
  window.AudioContext || (window as WebkitAudioWindow).webkitAudioContext
);

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

const getDisplayCaptureErrorMessage = (screenLabel: string, err: unknown) => {
  const technicalError = getErrorMessage(err);

  if (!technicalError.toLowerCase().includes('timeout starting video source')) {
    return `Could not get ${screenLabel} stream.\nError: ${technicalError}`;
  }

  const { isChrome, isSafari, isFirefox, isEdge } = getBrowserInfo();
  const browserName = isChrome
    ? 'Chrome'
    : isEdge
      ? 'Microsoft Edge'
      : isSafari
        ? 'Safari'
        : isFirefox
          ? 'Firefox'
          : 'The browser';
  const restartTarget = browserName === 'The browser' ? 'your browser' : browserName;
  const isMac = /Macintosh|Mac OS X/.test(navigator.userAgent);
  const quitShortcut = isMac ? ' (⌘Q)' : '';
  const permissionHelp = isMac
    ? `If it still fails, open System Settings → Privacy & Security → Screen & System Audio Recording and make sure ${restartTarget} is enabled.`
    : 'If it still fails, restart your computer and verify that your browser has permission to capture the screen.';

  return `${browserName} could not finish starting ${screenLabel} capture.\n\nFully quit ${restartTarget}${quitShortcut}, reopen it, and try again. Opening a new tab will not reset the shared capture process.\n\n${permissionHelp}\n\nTechnical error: ${technicalError}`;
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
  } catch {
    return ["1080p", "720p", "480p"];
  }
};

type LegalDocument = 'privacy' | 'terms';

const legalDocuments: Record<LegalDocument, {
  title: string;
  updated: string;
  sections: { heading: string; body: string }[];
}> = {
  privacy: {
    title: 'Privacy Policy',
    updated: 'June 9, 2026',
    sections: [
      {
        heading: 'Overview',
        body: 'Sadilek Screen Recorder is designed as a browser-based recording tool. Recordings are created through your browser media APIs and are not intentionally uploaded, stored, reviewed, or sold by Sadilek Innovation through this app.',
      },
      {
        heading: 'Information the app may access',
        body: 'The app may access your screen, camera, and microphone only after you select recording options and approve browser permission prompts. You can revoke those permissions in your browser or operating system settings.',
      },
      {
        heading: 'Recordings',
        body: 'Recorded files remain in your browser session until you choose to save or share them. If you use browser share or download features, your browser, operating system, or selected destination may process that file.',
      },
      {
        heading: 'Site and hosting data',
        body: 'Our hosting, security, or analytics providers may process standard technical data such as IP address, browser type, timestamps, requested pages, and performance or security events. We use that information to operate, secure, and improve the site.',
      },
      {
        heading: 'Children and third parties',
        body: 'This app is not directed to children under 13. Links to third-party sites are governed by those sites\' own policies.',
      },
      {
        heading: 'Contact',
        body: 'Questions about this policy can be sent through sadilekinnovation.com.',
      },
    ],
  },
  terms: {
    title: 'Terms of Service',
    updated: 'June 9, 2026',
    sections: [
      {
        heading: 'Use of the app',
        body: 'Sadilek Screen Recorder is provided as a lightweight browser utility for capturing screen, camera, and microphone recordings. You are responsible for using it lawfully and only recording content, conversations, or people when you have the right and consent to do so.',
      },
      {
        heading: 'Your recordings',
        body: 'You control your recordings. Sadilek Innovation does not claim ownership of recordings you create with the app.',
      },
      {
        heading: 'Acceptable use',
        body: 'Do not use the app to violate privacy rights, intellectual property rights, workplace policies, platform rules, or applicable recording consent laws.',
      },
      {
        heading: 'Availability and compatibility',
        body: 'Browser recording support varies by device, browser, and permission settings. The app is provided as is, without a guarantee that every recording will complete, save, or play back as expected.',
      },
      {
        heading: 'Limitation of liability',
        body: 'To the fullest extent allowed by law, Sadilek Innovation is not liable for lost recordings, failed captures, misuse of the app, or indirect damages arising from use of the app.',
      },
      {
        heading: 'Changes',
        body: 'We may update the app or these terms from time to time. Continued use of the app after updates means you accept the updated terms.',
      },
    ],
  },
};

const projectTimeline = [
  {
    date: 'May 30, 2025',
    body: 'Clean React/Vite app initialized, then Docker and nginx static fallback were added for deployment.',
  },
  {
    date: 'May 30-31, 2025',
    body: 'Media packaging experiments, mobile audio fallback, recording format controls, and resolution options landed.',
  },
  {
    date: 'May 31, 2025',
    body: 'Mic/camera startup fixes, file-size readouts, inline permission status, save-state polish, and device-specific filenames were added.',
  },
  {
    date: 'June 1, 2025',
    body: 'The v1.3 branch refined camera submenus, selected camera labels, portrait preview handling, submenu colors, and vertical layout.',
  },
  {
    date: 'June 1-24, 2025',
    body: 'Main carried a Claude Opus 4 review pass and follow-up cleanup before this 2026 Sadilek Innovation refresh.',
  },
  {
    date: 'June 10, 2026',
    body: 'Functional pass stabilized multi-screen capture, exact microphone selection, input metering, mobile camera fallbacks, and local dev access for desktop and phone testing.',
  },
];

const technicalWins = [
  'Frontend-only capture flow: files are created in the browser session and saved or shared only when the user chooses.',
  'Separate screen, camera, and mic outputs with per-source save/share actions and generated filenames.',
  'Multiple screen slots can be captured as separate files through repeated browser display-picker prompts.',
  'Microphone capture now keeps OS default, named physical inputs, and browser-default fallback paths distinct so exact device selection stays stable.',
  'Input gain and live dBFS metering help tune levels while echo cancellation, noise suppression, and auto gain remain user-controlled.',
  'MediaDeviceInfo objects are normalized with explicit deviceId, groupId, kind, and label copying so browser-provided device IDs are not lost during UI labeling.',
  'Mobile camera behavior favors reliability: front/rear fallback cameras are single-choice when the browser does not expose stable per-camera IDs.',
  'Continuity/iPhone inputs are tracked as browser-dependent future work without weakening the stable desktop mic path.',
];

const stackDetails = [
  'React 18, TypeScript, and Vite 6 for the frontend app shell.',
  'Browser MediaDevices, getDisplayMedia, getUserMedia, and MediaRecorder APIs for capture.',
  'Web Audio API GainNode and AnalyserNode support microphone gain and peak-level metering.',
  'file-saver and mime support download/export handling.',
  'Docker and nginx are included for static deployment hosting.',
  'Tailwind/PostCSS tooling exists in the project, while the 2026 refresh and functional controls are primarily custom CSS.',
  'Vite local serving currently defaults to port 5174, with LAN/Tailscale host access available for phone-device testing.',
];

const toolNotes = [
  'Confirmed from repo history: the project began from a Bolt DIY build.',
  'Recording files are generated on your computer and stay in your browser session until you save or share them.',
  'The app is free and open source, built in May 2025 from a Bolt DIY start, refined through June, and finished with a 2026 design pass.',
  'Development notes from this pass: early work used free OpenRouter credits through Bolt DIY, with extra help from ChatGPT through a Cursor/VS Code workflow.',
  'Confirmed from a June 1 commit: a Claude Opus 4 review pass influenced later refinements.',
  'The June 2026 design and functional refresh was edited in Codex through iterative local browser testing.',
  'The repo now tracks known issues and future work for Continuity/iPhone microphones, mobile multi-camera capture, and recording-flow polish.',
  'Other exact model/editor details are not recorded in this repo, so they are not claimed here.',
];

const githubUrl = 'https://github.com/Tomaski47/scrrec-app';

type ScreenDevice = {
  deviceId: string;
  label: string;
};

type PermissionTarget = 'all' | 'audio' | 'video';
const defaultAudioDeviceId = 'default';
const unlockAudioDeviceId = '__allow_microphone_access__';
const genericAudioDeviceId = '__generic_microphone__';
const genericFrontCameraId = '__front_camera__';
const genericRearCameraId = '__rear_camera__';
const genericCameraId = '__camera__';

const createSyntheticAudioDevice = (deviceId: string, label: string) => ({
  deviceId,
  groupId: '',
  kind: 'audioinput',
  label,
  toJSON: () => ({}),
} as MediaDeviceInfo);

const copyMediaDevice = (
  device: MediaDeviceInfo,
  overrides: Partial<Pick<MediaDeviceInfo, 'deviceId' | 'groupId' | 'kind' | 'label'>> = {}
) => ({
  deviceId: overrides.deviceId ?? device.deviceId ?? '',
  groupId: overrides.groupId ?? device.groupId ?? '',
  kind: overrides.kind ?? device.kind,
  label: overrides.label ?? device.label ?? '',
  toJSON: () => ({}),
} as MediaDeviceInfo);

const getDeviceIdentity = (device: MediaDeviceInfo, index: number) => (
  device.deviceId || `${device.kind}-${device.groupId || 'unknown'}-${index}`
);

const getDeviceDedupeKey = (device: MediaDeviceInfo) => (
  device.deviceId || `${device.kind}-${device.groupId || 'unknown'}`
);

const dedupeMediaDevices = (devices: MediaDeviceInfo[]) => {
  const seen = new Set<string>();

  return devices.filter((device) => {
    if (!device.deviceId) return true;

    const identity = getDeviceDedupeKey(device);
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
};

const isBuiltInMic = (device: MediaDeviceInfo) => {
  const label = `${device.label} ${device.deviceId}`.toLowerCase();
  return label.includes('built-in') ||
    label.includes('internal') ||
    label.includes('macbook');
};

const getBuiltInMicId = (devices: MediaDeviceInfo[]) => {
  const builtInMic = devices.find(isBuiltInMic);

  return builtInMic?.deviceId ?? '';
};

const getMicDisplayLabel = (device: MediaDeviceInfo, index: number) => {
  const rawLabel = (device.label || '').trim();
  const deviceId = (device.deviceId || '').toLowerCase();

  if (deviceId === 'default') {
    if (rawLabel.toLowerCase().startsWith('default')) {
      const routedDevice = rawLabel.replace(/^default\s*[-:]\s*/i, '').trim();
      return routedDevice ? `System default (${routedDevice})` : 'System default microphone';
    }
    return rawLabel || 'System default microphone';
  }

  if (deviceId === 'communications') {
    if (rawLabel.toLowerCase().startsWith('communications')) {
      const routedDevice = rawLabel.replace(/^communications\s*[-:]\s*/i, '').trim();
      return routedDevice ? `Communications (${routedDevice})` : 'Communications microphone';
    }
    return rawLabel || 'Communications microphone';
  }

  return rawLabel || `Microphone ${index + 1}`;
};

const getMicDeviceNote = (device: MediaDeviceInfo) => {
  const deviceId = (device.deviceId || '').toLowerCase();
  if (deviceId === unlockAudioDeviceId) return 'unlock first';
  if (deviceId === genericAudioDeviceId) return 'uses browser default';
  if (!deviceId) return 'not selectable';
  if (deviceId === 'default') return 'uses OS default';
  if (deviceId === 'communications') return 'uses communications default';
  return '';
};

const getMicSortRank = (device: MediaDeviceInfo) => {
  const deviceId = (device.deviceId || '').toLowerCase();
  if (deviceId === 'default') return 0;
  if (isBuiltInMic(device)) return 1;
  if (deviceId === genericAudioDeviceId) return 2;
  if (deviceId === 'communications') return 3;
  if (deviceId === unlockAudioDeviceId) return 5;
  if (!deviceId) return 6;
  return 4;
};

const micNeedsExplicitPermission = (device: MediaDeviceInfo) => {
  const deviceId = (device.deviceId || '').toLowerCase();
  return !deviceId;
};

const getPreferredMicId = (devices: MediaDeviceInfo[]) => {
  const selectableDevices = devices.filter(device => (
    !micNeedsExplicitPermission(device) &&
    device.deviceId !== unlockAudioDeviceId
  ));
  const defaultMic = selectableDevices.find(device => (
    (device.deviceId || '').toLowerCase() === defaultAudioDeviceId
  ));
  const realSelectableDevices = selectableDevices.filter(device => device.deviceId !== genericAudioDeviceId);
  const builtInMicId = getBuiltInMicId(realSelectableDevices);
  const firstSelectableMic = realSelectableDevices.find(device => device.deviceId);
  const genericMic = selectableDevices.find(device => device.deviceId === genericAudioDeviceId);

  return defaultMic?.deviceId || builtInMicId || firstSelectableMic?.deviceId || genericMic?.deviceId || '';
};

const reconcileSelectedMicIds = (devices: MediaDeviceInfo[], currentIds: string[]) => {
  const refreshedMicIds = new Set(
    devices
      .filter(device => !micNeedsExplicitPermission(device) && !isMicUnlockId(device.deviceId))
      .map(device => device.deviceId)
  );
  const preferredMicId = getPreferredMicId(devices);
  const retainedMicIds = currentIds.filter(id => (
    refreshedMicIds.has(id) && !isMicUnlockId(id)
  ));

  if (
    retainedMicIds.some(isGenericMicId) &&
    preferredMicId &&
    !isGenericMicId(preferredMicId) &&
    !isMicUnlockId(preferredMicId)
  ) {
    return [
      preferredMicId,
      ...retainedMicIds.filter(id => !isGenericMicId(id) && id !== preferredMicId),
    ];
  }

  return retainedMicIds;
};

const normalizeAudioDevices = (devices: MediaDeviceInfo[], hasAudioAccess: boolean) => {
  const labeledDevices = dedupeMediaDevices(devices.map((device, idx) => (
    copyMediaDevice(device, { label: getMicDisplayLabel(device, idx) })
  )));
  const selectableDevices = labeledDevices.filter(device => device.deviceId);
  const unavailableDevices = labeledDevices.filter(device => !device.deviceId && device.label);

  if (selectableDevices.length > 0) {
    const hasDefaultAlias = selectableDevices.some(device => (
      device.deviceId === defaultAudioDeviceId || device.deviceId === genericAudioDeviceId
    ));
    const selectableList = [
      ...selectableDevices,
      ...(hasAudioAccess && !hasDefaultAlias
        ? [createSyntheticAudioDevice(genericAudioDeviceId, 'Browser default microphone')]
        : []),
    ].sort((a, b) => getMicSortRank(a) - getMicSortRank(b));

    return [
      ...selectableList,
      ...unavailableDevices,
    ];
  }

  if (!hasAudioAccess) {
    return [
      createSyntheticAudioDevice(
        unlockAudioDeviceId,
        'Allow microphone access'
      ),
    ];
  }

  return [
    createSyntheticAudioDevice(genericAudioDeviceId, 'Browser default microphone'),
    ...unavailableDevices,
  ];
};

const isGenericMicId = (micId: string) => micId === genericAudioDeviceId;
const isMicUnlockId = (micId: string) => micId === unlockAudioDeviceId;

const isGenericCameraId = (cameraId: string) => (
  cameraId === genericFrontCameraId ||
  cameraId === genericRearCameraId ||
  cameraId === genericCameraId
);

const getCameraFallbackId = (device: MediaDeviceInfo) => {
  const label = `${device.label || ''} ${device.deviceId || ''}`.toLowerCase();
  if (label.includes('front') || label.includes('user') || label.includes('facetime')) return genericFrontCameraId;
  if (label.includes('rear') || label.includes('back') || label.includes('environment')) return genericRearCameraId;
  return genericCameraId;
};

const getCameraFallbackLabel = (cameraId: string) => {
  if (cameraId === genericFrontCameraId) return 'Front Camera';
  if (cameraId === genericRearCameraId) return 'Rear Camera';
  return 'Camera';
};

const shouldUseSingleMobileCamera = (cameraIds: string[]) => (
  cameraIds.some(isGenericCameraId)
);

const buildNextCameraIds = (currentIds: string[], nextId: string, checked: boolean) => {
  if (!checked) {
    return currentIds.filter(id => id !== nextId);
  }

  if (shouldUseSingleMobileCamera([...currentIds, nextId])) {
    return [nextId];
  }

  return currentIds.includes(nextId) ? currentIds : [...currentIds, nextId];
};

const normalizeCameraDevices = (devices: MediaDeviceInfo[]) => {
  const seen = new Set<string>();

  return devices
    .map((device) => {
      if (device.deviceId) return device;
      const fallbackId = getCameraFallbackId(device);
      return copyMediaDevice(device, {
        deviceId: fallbackId,
        label: getCameraFallbackLabel(fallbackId),
      });
    })
    .filter((device) => {
      const identity = device.deviceId || device.label || device.groupId;
      if (seen.has(identity)) return false;
      seen.add(identity);
      return true;
    });
};

const createScreenDevice = (slotNumber: number): ScreenDevice => ({
  deviceId: `screen_${slotNumber}`,
  label: `Screen ${slotNumber}`,
});

const getScreenSlotNumber = (screenId: string): number => {
  const match = screenId.match(/(\d+)$/);
  return match ? Number(match[1]) : 1;
};

function App() {
  // Dark mode state
  const [darkMode, setDarkMode] = useState(true);
  const [legalModal, setLegalModal] = useState<LegalDocument | null>(null);
  
  // State declarations
  const [showClearConfirmation, setShowClearConfirmation] = useState(false);
  const [savedStatus, setSavedStatus] = useState<{ [key: string]: boolean }>({});
  const [permissionStatus, setPermissionStatus] = useState<Record<string, string>>({});
  const [audioQuality, setAudioQuality] = useState('best');
  const [videoResolution, setVideoResolution] = useState<VideoResolution>('fullscreen');
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
  const [audioProcessing, setAudioProcessing] = useState({
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    gain: 1,
  });
  const [micLevelDb, setMicLevelDb] = useState<number | null>(null);
  const [micLevelPercent, setMicLevelPercent] = useState(0);
  const [cameraDevices, setCameraDevices] = useState<MediaDeviceInfo[]>([]);
  const [micDevices, setMicDevices] = useState<MediaDeviceInfo[]>([]);
  const [screenDevices, setScreenDevices] = useState<ScreenDevice[]>([createScreenDevice(1)]);
  const [recordingTime, setRecordingTime] = useState(0);
  const [recordingSize, setRecordingSize] = useState(0);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [recordedChunks, setRecordedChunks] = useState<Blob[]>([]);
  const [hasRequestedAudioPermission, setHasRequestedAudioPermission] = useState(false);
  const [hasRequestedVideoPermission, setHasRequestedVideoPermission] = useState(false);

  // Refs
  const activeStreamsRef = useRef<MediaStream[]>([]);
  const audioContextsRef = useRef<AudioContext[]>([]);
  const audioGainRef = useRef(audioProcessing.gain);
  const micMeterRequestRef = useRef(0);
  const micMeterRef = useRef<{
    stream: MediaStream;
    context: AudioContext;
    analyser: AnalyserNode;
    source: MediaStreamAudioSourceNode;
    rafId: number | null;
  } | null>(null);
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
    document.title = "Screen Recorder | Sadilek Innovation";
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
  const handleDownload = (blobOrChunks: Blob[] | Blob, fileName: string, deviceName?: string, mimeType = 'video/webm') => {
    let blob: Blob;
    if (Array.isArray(blobOrChunks)) {
      blob = new Blob(blobOrChunks, { type: mimeType });
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

  const loadCameraResolutions = async (devices: MediaDeviceInfo[]) => {
    for (const camera of devices) {
      if (availableCameraResolutions[camera.deviceId]) continue;

      if (isGenericCameraId(camera.deviceId)) {
        const fallbackResolutions = ['1080p', '720p', '480p', '360p'];
        setAvailableCameraResolutions(prev => ({
          ...prev,
          [camera.deviceId]: fallbackResolutions
        }));
        setCameraResolutions(prev => ({
          ...prev,
          [camera.deviceId]: prev[camera.deviceId] || '1080p'
        }));
        continue;
      }

      const resolutions = await getCameraCapabilities(camera.deviceId);
      setAvailableCameraResolutions(prev => ({
        ...prev,
        [camera.deviceId]: resolutions
      }));
      setCameraResolutions(prev => ({
        ...prev,
        [camera.deviceId]: prev[camera.deviceId] || resolutions[0] || '1080p'
      }));
    }
  };

  // Get available devices without requesting permissions
  const getAvailableDevices = async (
    requestPermissions = false,
    permissionTarget: PermissionTarget = 'all',
    hasFreshAudioAccess = false,
    forcePermissionRefresh = false
  ) => {
    try {
      const needsAudio = permissionTarget === 'all' || permissionTarget === 'audio';
      const needsVideo = permissionTarget === 'all' || permissionTarget === 'video';
      const alreadyRequested =
        (!needsAudio || hasRequestedAudioPermission) &&
        (!needsVideo || hasRequestedVideoPermission);

      const grantedThisRequest = {
        audio: false,
        video: false,
      };

      if (requestPermissions && (!alreadyRequested || forcePermissionRefresh)) {
        // Only request permissions when explicitly needed
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: needsVideo,
            audio: needsAudio,
          });
          stream.getTracks().forEach(track => track.stop());
          if (needsAudio) {
            setHasRequestedAudioPermission(true);
            grantedThisRequest.audio = true;
          }
          if (needsVideo) {
            setHasRequestedVideoPermission(true);
            grantedThisRequest.video = true;
          }
          setPermissionStatus(prev => ({
            ...prev,
            ...(needsAudio ? { microphone: 'granted' } : {}),
            ...(needsVideo ? { camera: 'granted' } : {}),
          }));
        } catch {
          console.log('Permission denied or not available');
          await checkPermissions();
        }
      }

      const devices = await navigator.mediaDevices.enumerateDevices();
      let videoDevices = devices.filter(device => device.kind === 'videoinput');
      let audioDevices = devices.filter(device => device.kind === 'audioinput');
      
      // Enhanced camera labeling
      const frontCameras: MediaDeviceInfo[] = [];
      const rearCameras: MediaDeviceInfo[] = [];
      const unknownCameras: MediaDeviceInfo[] = [];
      
      videoDevices.forEach((device, idx) => {
        let label = device.label;
        const deviceIdLower = device.deviceId.toLowerCase();
        
        if (!label || label.trim() === "") {
          if (deviceIdLower.includes('front') || deviceIdLower.includes('user')) {
            label = `Front Camera`;
            frontCameras.push(copyMediaDevice(device, { label }));
          } else if (deviceIdLower.includes('back') || deviceIdLower.includes('environment')) {
            label = `Rear Camera`;
            rearCameras.push(copyMediaDevice(device, { label }));
          } else {
            label = `Camera ${idx + 1}`;
            unknownCameras.push(copyMediaDevice(device, { label }));
          }
        } else {
          // Categorize based on existing labels
          const labelLower = label.toLowerCase();
          if (labelLower.includes('front') || labelLower.includes('facing user') || labelLower.includes('facetime')) {
            frontCameras.push(copyMediaDevice(device, { label: 'Front Camera' }));
          } else if (labelLower.includes('back') || labelLower.includes('rear') || labelLower.includes('facing environment')) {
            rearCameras.push(copyMediaDevice(device, { label: 'Rear Camera' }));
          } else {
            unknownCameras.push(copyMediaDevice(device));
          }
        }
      });
      
      // Number duplicate labels
      const numberDuplicates = (cameras: MediaDeviceInfo[], baseLabel: string) => {
        if (cameras.length > 1) {
          return cameras.map((cam, idx) => copyMediaDevice(cam, {
            label: `${baseLabel} ${idx + 1}`
          }));
        }
        return cameras;
      };
      
      const numberedFront = numberDuplicates(frontCameras, 'Front Camera');
      const numberedRear = numberDuplicates(rearCameras, 'Rear Camera');
      
      videoDevices = normalizeCameraDevices(dedupeMediaDevices([...numberedFront, ...numberedRear, ...unknownCameras]));
      
      audioDevices = normalizeAudioDevices(
        audioDevices,
        hasFreshAudioAccess || grantedThisRequest.audio || hasRequestedAudioPermission || permissionStatus.microphone === 'granted'
      );
      
      setCameraDevices(videoDevices);
      setMicDevices(audioDevices);
      
      if (requestPermissions || hasRequestedVideoPermission) {
        await loadCameraResolutions(videoDevices);
      }

      return { videoDevices, audioDevices };
    } catch (error) {
      console.error('Error enumerating devices:', error);
      return { videoDevices: [] as MediaDeviceInfo[], audioDevices: [] as MediaDeviceInfo[] };
    }
  };

  // Get recorder options
  const getRecorderOptions = (hasVideo: boolean, hasAudio: boolean) => {
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

    audioContextsRef.current.forEach((context) => {
      if (context.state !== 'closed') {
        context.close().catch(err => console.warn('Error closing audio context:', err));
      }
    });
    audioContextsRef.current = [];

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
    const constraints: MediaTrackConstraints = {};

    if (deviceId === genericFrontCameraId) {
      constraints.facingMode = { ideal: 'user' };
    } else if (deviceId === genericRearCameraId) {
      constraints.facingMode = { ideal: 'environment' };
    } else if (!isGenericCameraId(deviceId)) {
      constraints.deviceId = { exact: deviceId };
    }
    
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

  const addScreenSource = () => {
    if (recording) return;
    const nextSlotNumber = screenDevices.length + 1;
    const nextDevice = createScreenDevice(nextSlotNumber);
    setScreenDevices(prev => [...prev, nextDevice]);
    setRecordOptions(prev => ({
      ...prev,
      screenIds: [...prev.screenIds, nextDevice.deviceId],
    }));
  };

  const removeLastScreenSource = () => {
    if (recording || screenDevices.length <= 1) return;
    const lastDevice = screenDevices[screenDevices.length - 1];
    setScreenDevices(prev => prev.slice(0, -1));
    setRecordOptions(prev => ({
      ...prev,
      screenIds: prev.screenIds.filter(id => id !== lastDevice.deviceId),
    }));
  };

  const generateScreenFilename = (screenId: string, resolution?: string) => {
    const baseName = generateFilename("screen", resolution);
    return baseName.replace(/^screen/, `screen${getScreenSlotNumber(screenId)}`);
  };

  const getMicConstraints = (micId: string): MediaTrackConstraints => {
    const constraints: MediaTrackConstraints = {
      echoCancellation: audioProcessing.echoCancellation,
      noiseSuppression: audioProcessing.noiseSuppression,
      autoGainControl: audioProcessing.autoGainControl,
    };

    if (micId && !isGenericMicId(micId) && micId !== defaultAudioDeviceId) {
      constraints.deviceId = { exact: micId };
    }

    return constraints;
  };

  const requestGenericMicAccess = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: getMicConstraints(genericAudioDeviceId),
        video: false,
      });
      stream.getTracks().forEach(track => track.stop());
      setHasRequestedAudioPermission(true);
      setPermissionStatus(prev => ({
        ...prev,
        microphone: 'granted',
      }));
      return true;
    } catch (err) {
      console.warn('Could not unlock microphone access:', err);
      await checkPermissions();
      setPermissionError('Could not get microphone access. Check browser and system microphone permissions, then try selecting the microphone again.');
      return false;
    }
  };

  const applyMicGain = (stream: MediaStream) => {
    if (audioProcessing.gain === 1) return stream;

    const AudioContextCtor = getAudioContextCtor();
    if (!AudioContextCtor) return stream;

    const context = new AudioContextCtor();
    const source = context.createMediaStreamSource(stream);
    const gainNode = context.createGain();
    const destination = context.createMediaStreamDestination();

    gainNode.gain.value = audioProcessing.gain;
    source.connect(gainNode);
    gainNode.connect(destination);
    audioContextsRef.current.push(context);

    return destination.stream;
  };

  const stopMicMeter = (invalidatePendingRequest = true) => {
    if (invalidatePendingRequest) {
      micMeterRequestRef.current += 1;
    }

    const meter = micMeterRef.current;
    if (meter?.rafId) {
      cancelAnimationFrame(meter.rafId);
    }
    meter?.stream.getTracks().forEach(track => track.stop());
    if (meter?.context.state !== 'closed') {
      meter?.context.close().catch(err => console.warn('Error closing mic meter context:', err));
    }

    micMeterRef.current = null;
    setMicLevelDb(null);
    setMicLevelPercent(0);
  };

  const startMicMeter = async (micId: string) => {
    const requestId = micMeterRequestRef.current + 1;
    micMeterRequestRef.current = requestId;
    stopMicMeter(false);

    const AudioContextCtor = getAudioContextCtor();
    if (!AudioContextCtor) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: getMicConstraints(micId),
        video: false,
      });

      if (requestId !== micMeterRequestRef.current) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }

      const context = new AudioContextCtor() as AudioContext;
      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0;
      source.connect(analyser);

      const data = new Float32Array(analyser.fftSize);
      const meter = {
        stream,
        context,
        analyser,
        source,
        rafId: null as number | null,
      };
      micMeterRef.current = meter;

      const updateMeter = () => {
        analyser.getFloatTimeDomainData(data);
        let peak = 0;
        for (let i = 0; i < data.length; i += 1) {
          peak = Math.max(peak, Math.abs(data[i]));
        }

        const adjustedPeak = Math.min(1, peak * audioGainRef.current);
        const db = adjustedPeak > 0 ? Math.max(-60, 20 * Math.log10(adjustedPeak)) : -60;
        const percent = Math.min(100, Math.max(0, ((db + 60) / 60) * 100));

        setMicLevelDb(Number.isFinite(db) ? Math.round(db) : -60);
        setMicLevelPercent(percent);
        meter.rafId = requestAnimationFrame(updateMeter);
      };

      updateMeter();
    } catch (err) {
      console.warn('Could not start microphone level meter:', err);
      setMicLevelDb(null);
      setMicLevelPercent(0);
    }
  };

  const resolveSelectableMic = (device: MediaDeviceInfo) => {
    return device;
  };

  const getMicSelectionId = (device: MediaDeviceInfo) => {
    return device.deviceId || '';
  };

  const getMicNote = (device: MediaDeviceInfo) => {
    return getMicDeviceNote(device);
  };

  const handleMicDeviceChange = async (device: MediaDeviceInfo, shouldSelect: boolean) => {
    if (recording) return;

    const selectableMic = shouldSelect ? resolveSelectableMic(device) : device;
    const selectableMicId = selectableMic?.deviceId || getMicSelectionId(device);

    if (shouldSelect && isMicUnlockId(selectableMicId)) {
      const didUnlockMic = await requestGenericMicAccess();
      if (!didUnlockMic) return;

      await getAvailableDevices(false, 'audio', true);
      setRecordOptions(prev => ({
        ...prev,
        mic: true,
        micIds: prev.micIds.filter(id => !isMicUnlockId(id)),
      }));
      stopMicMeter();
      return;
    }

    if (!selectableMicId || isMicUnlockId(selectableMicId) || micNeedsExplicitPermission(device)) {
      const attemptedMic = device.label || 'that microphone';
      setPermissionError(`"${attemptedMic}" is visible, but this browser did not expose a selectable device ID for it. Use Browser default microphone for the current OS/default input, or choose a named mic with a real device ID.`);
      return;
    }

    let micIds = [...recordOptions.micIds];
    if (shouldSelect) {
      if (selectableMicId !== genericAudioDeviceId) {
        micIds = micIds.filter(id => !isGenericMicId(id));
      }
      if (!micIds.includes(selectableMicId)) micIds.push(selectableMicId);
    } else {
      micIds = micIds.filter(id => id !== selectableMicId);
    }

    setRecordOptions({ ...recordOptions, mic: true, micIds });
    if (micIds.length > 0) {
      void startMicMeter(shouldSelect ? selectableMicId : micIds[0]);
    } else {
      stopMicMeter();
    }
  };

  // Start recording
  const startRecording = async () => {
    try {
      stopMicMeter();

      const needsMicPermission = recordOptions.mic && recordOptions.micIds.length > 0;
      const needsCameraPermission = recordOptions.cameraIds.length > 0;

      if (needsMicPermission || needsCameraPermission) {
        const permissionTarget: PermissionTarget = needsMicPermission && needsCameraPermission
          ? 'all'
          : needsMicPermission
            ? 'audio'
            : 'video';
        await getAvailableDevices(true, permissionTarget);
      } else {
        await getAvailableDevices(false);
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
      const selectedScreenIds = recordOptions.screenIds.filter(screenId =>
        screenDevices.some(device => device.deviceId === screenId)
      );

      // Get screen streams if selected. Browsers expose screens through the picker, not enumeration.
      if (selectedScreenIds.length > 0) {
        if (!supportsDisplayMedia) {
          setPermissionError('This browser does not expose screen capture. Screen recording may be unavailable on this device.');
          cleanupRecording();
          return;
        }

        for (const screenId of selectedScreenIds) {
          const screenLabel = screenDevices.find(device => device.deviceId === screenId)?.label || 'Screen';
          try {
            streams[screenId] = await navigator.mediaDevices.getDisplayMedia({
              video: getResolutionConstraints(),
            });
            activeStreamsRef.current.push(streams[screenId]);
            streamKeys.push(screenId);
          } catch (err) {
            setPermissionError(getDisplayCaptureErrorMessage(screenLabel, err));
            cleanupRecording();
            return;
          }
        }
      }

      // Get mic streams if selected
      const micStreams: {[key: string]: MediaStream} = {};
      if (recordOptions.mic && recordOptions.micIds && recordOptions.micIds.length > 0) {
        for (const micId of recordOptions.micIds) {
          try {
            const micStream = await navigator.mediaDevices.getUserMedia({
              audio: getMicConstraints(micId),
              video: false,
            });
            activeStreamsRef.current.push(micStream);
            const processedMicStream = applyMicGain(micStream);
            if (processedMicStream !== micStream) {
              activeStreamsRef.current.push(processedMicStream);
            }
            micStreams['mic_' + micId] = processedMicStream;
          } catch (err) {
            setPermissionError('Could not get microphone: ' + getErrorMessage(err));
            cleanupRecording();
            return;
          }
        }
      }

      // Get camera streams if selected
      if (recordOptions.cameraIds && recordOptions.cameraIds.length > 0) {
        if (
          shouldUseSingleMobileCamera(recordOptions.cameraIds) &&
          recordOptions.cameraIds.length > 1
        ) {
          setPermissionError('Mobile browsers usually allow one active camera stream at a time. Choose either Front Camera or Rear Camera, then start recording.');
          cleanupRecording();
          return;
        }

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
          } catch (err) {
            setPermissionError('Could not access camera: ' + getErrorMessage(err));
            cleanupRecording();
            return;
          }
        }
      }

      if (
        selectedScreenIds.length === 0 &&
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

      // For each screen stream
      for (const screenKey of selectedScreenIds.filter(screenId => streams[screenId])) {
        let finalStream = streams[screenKey];
        if (recordOptions.mic && recordOptions.micIds && recordOptions.micIds.length > 0) {
          const audioTracks = recordOptions.micIds.flatMap(mid =>
            micStreams['mic_' + mid]?.getAudioTracks() ?? []
          );
          const combinedStream = new MediaStream([
            ...streams[screenKey].getVideoTracks(),
            ...audioTracks,
          ]);
          finalStream = combinedStream;
          activeStreamsRef.current.push(combinedStream);
        }
        const recorderOptions = getRecorderOptions(true, recordOptions.mic);
        newChunks[screenKey] = [];
        const recorder = new MediaRecorder(finalStream, recorderOptions);
        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) {
            newChunks[screenKey].push(e.data);
            setRecordingSize(prevSize => prevSize + e.data.size);
          }
        };
        recorder.onstop = () => {
          const videoBlob = new Blob(newChunks[screenKey], { type: 'video/webm' });
          newVideoUrls[screenKey] = URL.createObjectURL(videoBlob);
          setVideoUrls(prev => ({ ...prev, [screenKey]: newVideoUrls[screenKey] }));
        };
        newMediaRecorders[screenKey] = recorder;
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
      setPermissionError('Could not start recording: ' + getErrorMessage(err));
    }
  };

  // Stop recording
  const stopRecording = () => {
    recordOptions.screenIds.forEach(screenId => {
      setSavedStatus(prev => ({ ...prev, [screenId]: false }));
    });
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
  };

  const cancelClear = () => {
    setShowClearConfirmation(false);
  };

  // Video preview component with proper orientation
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
          <p>Safari detected: recording support may be limited. Chrome and Firefox usually work best.</p>
        )}
        {isFirefox && (
          <p>Firefox detected: recording support is available. Grant permissions when prompted.</p>
        )}
        {isIncognito && (
          <p>Private browsing detected: some recording features may be limited.</p>
        )}
      </div>
    );
  };

  // Effects
  useEffect(() => {
    checkPermissions();
    getAvailableDevices(false); // Don't request permissions on load
    // Run once on mount so the browser can list any already exposed devices.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    audioGainRef.current = audioProcessing.gain;
  }, [audioProcessing.gain]);

  useEffect(() => () => stopMicMeter(), []);

  useEffect(() => {
    setSupportsDisplayMedia(typeof navigator.mediaDevices.getDisplayMedia === 'function');
  }, []);

  useEffect(() => {
    setScreenDevices(prev => (
      prev.length > 0 ? prev : [createScreenDevice(1)]
    ));
  }, []);

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

  const activeLegalDocument = legalModal ? legalDocuments[legalModal] : null;

  // Main render
  return (
    <div className={`App ${darkMode ? 'dark-mode' : 'light-mode'}`}>
      <main className="app-shell">
        <section className="site-intro" aria-labelledby="site-title">
          <div className="brand-row">
            <span className="brand-kicker">Sadilek Innovation Lab</span>
            <div className="theme-toggle">
              <button
                className="theme-toggle-btn"
                onClick={() => setDarkMode(!darkMode)}
                aria-label={`Switch to ${darkMode ? 'light' : 'dark'} mode`}
                title={`Switch to ${darkMode ? 'light' : 'dark'} mode`}
              >
                {darkMode ? (
                  <span className="theme-icon theme-icon-moon" aria-hidden="true" />
                ) : (
                  <svg
                    className="theme-icon theme-icon-sun-svg"
                    aria-hidden="true"
                    viewBox="0 0 24 24"
                    fill="none"
                  >
                    <circle cx="12" cy="12" r="4" />
                    <path d="M12 2v2.5M12 19.5V22M4.93 4.93l1.77 1.77M17.3 17.3l1.77 1.77M2 12h2.5M19.5 12H22M4.93 19.07l1.77-1.77M17.3 6.7l1.77-1.77" />
                  </svg>
                )}
              </button>
            </div>
          </div>
          <h1 id="site-title">
            <span className="title-word title-word-screen">Screen</span>{" "}
            <span className="title-word title-word-recorder">Recorder</span>
          </h1>
          <p>
            A local-first, frontend-only capture flow for recording screen, mic, and camera input
            directly in your browser.
          </p>
          <div className="intro-meta" aria-label="Recorder highlights">
            <span>Free + open source</span>
            <span>Browser-only frontend</span>
            <span>Data stays local</span>
          </div>
          <details className="project-notes">
            <summary>
              <span>Technical details</span>
              <span>Expand to see stack, milestones, build notes</span>
            </summary>
            <div className="project-notes-body">
              <section>
                <h2>Milestones</h2>
                <ol className="timeline-list">
                  {projectTimeline.map(item => (
                    <li key={`${item.date}-${item.body}`}>
                      <span>{item.date}</span>
                      {item.body}
                    </li>
                  ))}
                </ol>
              </section>
              <section>
                <h2>Features</h2>
                <ul>
                  {technicalWins.map(item => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </section>
              <section>
                <h2>Stack</h2>
                <ul>
                  {stackDetails.map(item => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </section>
              <section>
                <h2>Build tools</h2>
                <ul>
                  {toolNotes.map(item => (
                    <li key={item}>{item}</li>
                  ))}
                  <li>
                    Source repo:{' '}
                    <a href={githubUrl} target="_blank" rel="noopener noreferrer">
                      github.com/Tomaski47/scrrec-app
                    </a>
                  </li>
                </ul>
              </section>
            </div>
          </details>
        </section>

        <div className="App-header recorder-panel">
          <div className="recorder-heading">
            <span className="panel-kicker">Recorder setup</span>
            <h2>Choose Sources</h2>
            <p>
              Select screen, mic, camera, or any combination.
            </p>
          </div>
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
                              screenIds = screenDevices.length > 0
                                ? screenDevices.map(device => device.deviceId)
                                : [createScreenDevice(1).deviceId];
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
                          {supportsDisplayMedia ? (
                            <>
                              {screenDevices.map((device) => (
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
                                    {device.label}
                                  </span>
                                </label>
                              ))}
                              <div className="screen-slot-actions">
                                <button
                                  type="button"
                                  className="mini-action"
                                  onClick={addScreenSource}
                                  disabled={recording}
                                >
                                  Add screen
                                </button>
                                {screenDevices.length > 1 && (
                                  <button
                                    type="button"
                                    className="mini-action secondary"
                                    onClick={removeLastScreenSource}
                                    disabled={recording}
                                  >
                                    Remove screen
                                  </button>
                                )}
                              </div>
                              <p className="submenu-hint">
                                Add one slot per display, then pick each exact screen in the browser prompt.
                              </p>
                              {isMobile && (
                                <p className="submenu-hint">
                                  Screen capture usually is not available on mobile browsers, but this app will try when the browser exposes it.
                                </p>
                              )}
                              {/* Resolution dropdown for screen */}
                              <div className="settings-row submenu-dropdown">
                                <div className="settings-label">Resolution:</div>
                                <select
                                  className="control-select"
                                  value={videoResolution}
                                  onChange={e => setVideoResolution(e.target.value as VideoResolution)}
                                  disabled={recording}
                                >
                                  <option value="fullscreen">Max available</option>
                                  <option value="1080p">1080p</option>
                                  <option value="720p">720p</option>
                                  <option value="480p">480p</option>
                                  <option value="360p">360p</option>
                                </select>
                              </div>
                            </>
                          ) : (
                            <p className="submenu-hint">
                              This browser does not expose screen capture, so screen recording may be unavailable here.
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                    
                    {/* Mic */}
                    <div className={`option-block${recordOptions.mic ? ' has-submenu' : ''}`}>
                      <label className="options-checkbox">
                        <input
                          type="checkbox"
                          checked={recordOptions.mic}
                          onChange={async e => {
                            if (recording) return;
                            if (e.target.checked) {
                              const refreshedDevices = await getAvailableDevices(false, 'audio');
                              const availableMics = refreshedDevices.audioDevices.length > 0
                                ? refreshedDevices.audioDevices
                                : micDevices;
                              const preferredMicId = getPreferredMicId(availableMics);
                              const shouldAutoSelectMic = (
                                preferredMicId &&
                                !isGenericMicId(preferredMicId) &&
                                !isMicUnlockId(preferredMicId)
                              );
                              const micIds = recordOptions.micIds.length > 0
                                ? recordOptions.micIds
                                : shouldAutoSelectMic ? [preferredMicId] : [];
                              setRecordOptions({ ...recordOptions, mic: true, micIds });
                            } else {
                              stopMicMeter();
                              setRecordOptions({ ...recordOptions, mic: false, micIds: [] });
                            }
                          }}
                          disabled={recording}
                          className="styled-checkbox"
                        />
                        Mic
                      </label>
                      {recordOptions.mic && (
                        <div className="device-submenu">
                          {micDevices.length > 0 ? micDevices.map((device, index) => (
                            <label
                              key={getDeviceIdentity(device, index)}
                              className={micNeedsExplicitPermission(device) ? 'device-unavailable' : undefined}
                            >
                              <input
                                type="checkbox"
                                checked={Boolean(getMicSelectionId(device)) && recordOptions.micIds.includes(getMicSelectionId(device))}
                                onChange={e => {
                                  void handleMicDeviceChange(device, e.target.checked);
                                }}
                                disabled={recording || micNeedsExplicitPermission(device)}
                                className="styled-checkbox"
                              />
                              <span className="device-label">
                                {device.label || (device.deviceId ? `Mic ${device.deviceId.slice(-4)}` : `Microphone ${index + 1}`)}
                                {getMicNote(device) && (
                                  <span className="device-permission">
                                    : {getMicNote(device)}
                                  </span>
                                )}
                                {Boolean(getMicSelectionId(device)) && recordOptions.micIds.includes(getMicSelectionId(device)) && (
                                  <span className="device-permission">
                                    : {permissionStatus.microphone || 'TBD'}
                                  </span>
                                )}
                              </span>
                            </label>
                          )) : (
                            <p className="submenu-hint">
                              No microphone list yet. Refresh mics checks the browser list without opening a mic.
                            </p>
                          )}
                          <div className="screen-slot-actions">
                            <button
                              type="button"
                              className="mini-action"
                              onClick={async () => {
                                if (recording) return;
                                const refreshedDevices = await getAvailableDevices(false, 'audio');
                                setRecordOptions(prev => ({
                                  ...prev,
                                  mic: true,
                                  micIds: reconcileSelectedMicIds(refreshedDevices.audioDevices, prev.micIds),
                                }));
                              }}
                              disabled={recording}
                            >
                              Refresh mics
                            </button>
                            {/* Continuity/iPhone mics appeared during testing, but Chrome/macOS did not always expose stable IDs. Keep this as an optional scan path so the core mic flow stays stable. */}
                            <button
                              type="button"
                              className="mini-action secondary"
                              onClick={async () => {
                                if (recording) return;
                                const refreshedDevices = await getAvailableDevices(true, 'audio', true, true);
                                setRecordOptions(prev => ({
                                  ...prev,
                                  mic: true,
                                  micIds: reconcileSelectedMicIds(refreshedDevices.audioDevices, prev.micIds),
                                }));
                              }}
                              disabled={recording}
                            >
                              Scan inputs
                            </button>
                          </div>
                          <p className="submenu-hint">
                            {isMobile
                              ? 'Tap the phone microphone to allow browser mic access and start the level meter.'
                              : 'Refresh is quiet. Scan inputs briefly opens mic access and may reveal Continuity, USB, or phone inputs when the browser exposes them.'}
                          </p>
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
                          <div className="audio-processing-controls">
                            <div className="settings-row submenu-dropdown gain-row">
                              <div className="settings-label">Gain:</div>
                              <div className="gain-control">
                                <input
                                  className="control-range"
                                  type="range"
                                  min="0.25"
                                  max="2.5"
                                  step="0.05"
                                  value={audioProcessing.gain}
                                  onChange={e => setAudioProcessing(prev => ({
                                    ...prev,
                                    gain: Number(e.target.value)
                                  }))}
                                  disabled={recording}
                                  aria-label="Microphone gain"
                                />
                                <span className="gain-value">{Math.round(audioProcessing.gain * 100)}%</span>
                              </div>
                            </div>
                            <div className="mic-meter" aria-label="Microphone input level">
                              <div className="mic-meter-copy">
                                <span>Peak level</span>
                                <strong>{micLevelDb === null ? 'Select mic' : `${micLevelDb} dBFS`}</strong>
                              </div>
                              <div className="mic-meter-track">
                                <span className="mic-meter-target" />
                                <span className="mic-meter-fill" style={{ width: `${micLevelPercent}%` }} />
                              </div>
                              <div className="mic-meter-scale" aria-hidden="true">
                                <span style={{ left: '0%' }}>-60</span>
                                <span style={{ left: '40%' }}>-36</span>
                                <span style={{ left: '70%' }}>-18</span>
                                <span style={{ left: '80%' }}>-12</span>
                                <span style={{ left: '100%' }}>0</span>
                              </div>
                              <p className="mic-meter-note">Aim voice peaks around -18 to -12 dBFS.</p>
                            </div>
                            <label className="processing-toggle">
                              <input
                                type="checkbox"
                                checked={audioProcessing.noiseSuppression}
                                onChange={e => setAudioProcessing(prev => ({
                                  ...prev,
                                  noiseSuppression: e.target.checked
                                }))}
                                disabled={recording}
                              />
                              Noise suppression
                            </label>
                            <label className="processing-toggle">
                              <input
                                type="checkbox"
                                checked={audioProcessing.echoCancellation}
                                onChange={e => setAudioProcessing(prev => ({
                                  ...prev,
                                  echoCancellation: e.target.checked
                                }))}
                                disabled={recording}
                              />
                              Echo cancellation
                            </label>
                            <label className="processing-toggle">
                              <input
                                type="checkbox"
                                checked={audioProcessing.autoGainControl}
                                onChange={e => setAudioProcessing(prev => ({
                                  ...prev,
                                  autoGainControl: e.target.checked
                                }))}
                                disabled={recording}
                              />
                              Auto gain
                            </label>
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
                          onChange={async e => {
                            if (recording) return;
                            if (e.target.checked) {
                              const refreshedDevices = await getAvailableDevices(true, 'video');
                              const availableCameras = refreshedDevices.videoDevices.length > 0
                                ? refreshedDevices.videoDevices
                                : cameraDevices;
                              if (availableCameras.length > 0) {
                                const selectedCamera = availableCameras[0];
                                setRecordOptions({ ...recordOptions, cameraIds: [selectedCamera.deviceId] });
                                void loadCameraResolutions([selectedCamera]);
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
                          <div className="screen-slot-actions">
                            <button
                              type="button"
                              className="mini-action"
                              onClick={async () => {
                                if (recording) return;
                                const refreshedDevices = await getAvailableDevices(true, 'video');
                                if (recordOptions.cameraIds.length === 0 && refreshedDevices.videoDevices.length > 0) {
                                  const selectedCamera = refreshedDevices.videoDevices[0];
                                  setRecordOptions(prev => ({ ...prev, cameraIds: [selectedCamera.deviceId] }));
                                  void loadCameraResolutions([selectedCamera]);
                                }
                              }}
                              disabled={recording}
                            >
                              Refresh cameras
                            </button>
                          </div>
                          <p className="submenu-hint">
                            If the browser exposes real camera devices, you can try selecting several. Front/Rear fallback cameras record one at a time on mobile.
                          </p>
                          {cameraDevices.map((device) => (
                            <div key={device.deviceId}>
                              <label className="device-item">
                                <input
                                  type="checkbox"
                                  checked={recordOptions.cameraIds.includes(device.deviceId)}
                                  onChange={(e) => {
                                    if (recording) return;
                                    const cameraIds = buildNextCameraIds(
                                      recordOptions.cameraIds,
                                      device.deviceId,
                                      e.target.checked
                                    );
                                    if (e.target.checked) {
                                      void loadCameraResolutions([device]);
                                    }
                                    setRecordOptions({ ...recordOptions, cameraIds });
                                  }}
                                  disabled={recording}
                                />
                                <span className="device-label">{device.label || "Camera"}</span>
                                <span className="device-permission">
                                  {recordOptions.cameraIds.includes(device.deviceId) && permissionStatus.camera === "granted" ? ": granted" : ""}
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
          <button
            className="btn"
            onClick={startRecording}
            disabled={recording}
          >
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

        {recording && (
          <>
            <div className="recording-timer">
              Recording: {formatTime(recordingTime)}
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
              {recordingSize > 1024 * 1024 * 1024 && " Recording may become unstable"}
              {recordingSize > 500 * 1024 * 1024 && recordingSize <= 1024 * 1024 * 1024 && " Large file size"}
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
          {recordOptions.screenIds.map(screenId => {
            if (!videoUrls[screenId]) return null;
            const screenLabel = screenDevices.find(device => device.deviceId === screenId)?.label || `Screen ${getScreenSlotNumber(screenId)}`;

            return (
              <div key={screenId} style={{marginBottom: '20px', textAlign: 'center'}}>
                <VideoPreview src={videoUrls[screenId]} title={`${screenLabel} Video`} />
                <div className="save-button-container">
                  <button
                    className="neon-save"
                    onClick={() => handleDownload(
                      chunks.current[screenId] || [],
                      generateScreenFilename(screenId, videoResolution),
                      screenId
                    )}
                  >
                    {savedStatus[screenId] ? 'Saved' : 'Save'}
                  </button>
                  {isShareSupported() && (
                    <button
                      className="neon-save"
                      onClick={() => {
                        const chunksArr = chunks.current[screenId] || [];
                        if (!chunksArr.length) return;
                        const blob = new Blob(chunksArr, { type: 'video/webm' });
                        const fileName = generateScreenFilename(screenId, videoResolution);
                        if (navigator.share && blob) {
                          const file = new File([blob], fileName, { type: blob.type });
                          navigator.share({
                            title: `${screenLabel} Recording`,
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
                    {formatSize(chunks.current[screenId]?.reduce((acc, chunk) => acc + chunk.size, 0) || 0)}
                  </span>
                </div>
              </div>
            );
          })}
          {recordOptions.cameraIds.map(camId => {
            const device = cameraDevices.find(d => d.deviceId === camId);
            if (!device || !videoUrls['camera_' + camId]) return null;
            
            return (
              <div key={camId} style={{marginBottom: '20px', textAlign: 'center'}}>
                <VideoPreview 
                  src={videoUrls['camera_' + camId]} 
                  title={`${device.label || 'Camera'}`}
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
            const micLabel = device?.label || (isGenericMicId(micId) ? 'Phone microphone' : `Mic ${micId.slice(-4)}`);
            if (!audioUrls['mic_' + micId]) return null;
            
            return (
              <div key={micId} style={{marginBottom: '20px', textAlign: 'center'}}>
                <h3>{micLabel}</h3>
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
                      'mic_' + micId,
                      'audio/webm'
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

        <footer className="app-footer">
          <div className="copyright">
            © 2026{' '}
            <a
              href="https://www.sadilekinnovation.com"
              target="_blank"
              rel="noopener noreferrer"
              className="footer-link footer-brand-link"
            >
              Sadilek Innovation
            </a>
          </div>
          <div className="footer-actions">
            <a
              href={githubUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="footer-link"
            >
              GitHub
            </a>
            <button className="footer-link footer-button" onClick={() => setLegalModal('privacy')}>
              Privacy Policy
            </button>
            <button className="footer-link footer-button" onClick={() => setLegalModal('terms')}>
              Terms of Service
            </button>
          </div>
        </footer>
      </main>

      {activeLegalDocument && (
        <div className="legal-modal-backdrop" role="presentation" onClick={() => setLegalModal(null)}>
          <section
            className="legal-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="legal-modal-title"
            onClick={event => event.stopPropagation()}
          >
            <div className="legal-modal-header">
              <div>
                <span className="legal-eyebrow">Legal</span>
                <h2 id="legal-modal-title">{activeLegalDocument.title}</h2>
                <p>Last updated: {activeLegalDocument.updated}</p>
              </div>
              <button className="legal-close" onClick={() => setLegalModal(null)} aria-label="Close legal document">
                <span aria-hidden="true">&times;</span>
              </button>
            </div>
            <div className="legal-content">
              {activeLegalDocument.sections.map(section => (
                <section key={section.heading}>
                  <h3>{section.heading}</h3>
                  <p>{section.body}</p>
                </section>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

export default App;
