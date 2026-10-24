import React, { useState, useEffect, useRef } from 'react';
import './App.css';
import { RecordingSession, AUDIO_BITRATES, type AudioQuality, type CompletedRecording, type SessionState, type Acquisition, type RecordingSource } from './recorder/session';
import { Modal } from './components/Modal';
import { SessionResults } from './components/SessionResults';
import { LocalTranscription } from './components/LocalTranscription';
import { useLocalTranscription } from './transcription/useLocalTranscription';
import { genericFrontCameraId, genericRearCameraId, genericCameraId, isGenericCameraId, isAppleMobile, requiresSingleCamera, nextCameraIds, cameraChoiceLabels, cameraDescription } from './recorder/cameras';

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
  const isChrome = /Chrome/.test(ua) && /Google Inc/.test(navigator.vendor) && !/OPR/.test(ua) && !/Edg/.test(ua);
  const isSafari = /Safari/.test(ua) && /Apple Computer/.test(navigator.vendor) && !/Chrome/.test(ua) && !/CriOS/.test(ua);
  const isFirefox = /Firefox/.test(ua);
  const isEdge = /Edg/.test(ua);
  const isIncognito = false; // Private browsing cannot be reliably inferred from storage API availability.
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

// Get camera capabilities
const getCameraCapabilities = async (deviceId: string): Promise<string[]> => {
  let stream: MediaStream | undefined;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { deviceId: { exact: deviceId } }
    });
    const track = stream.getVideoTracks()[0];
    const capabilities = track.getCapabilities ? track.getCapabilities() : null;
    if (capabilities && capabilities.width && capabilities.height) {
      const maxWidth = capabilities.width.max ?? 0;
      const maxHeight = capabilities.height.max ?? 0;
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
      
      return resolutions.length ? resolutions : ["1080p", "720p", "480p"];
    }
    return ["1080p", "720p", "480p"];
  } catch {
    return ["1080p", "720p", "480p"];
  } finally {
    stream?.getTracks().forEach(track => track.stop());
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
    updated: 'October 22, 2026',
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
        heading: 'Optional local transcription',
        body: 'When enabled and prepared, transcription processes the selected microphone audio on your device. Audio and transcript text are not uploaded for recognition. Preparing the feature downloads a speech engine from this site and model files from Hugging Face, which receives normal download request data. Model files may remain in browser caches; choose Remove model in the transcription controls to remove the cached model files used here. Transcript text remains in this tab until cleared or closed. Save it separately from your recordings.',
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
  'Native Blob, download and Web Share APIs handle local export with the actual recording format.',
  'Docker and nginx are included for static deployment hosting.',
  'Custom CSS provides the interface, with PostCSS and Autoprefixer for browser compatibility.',
  'Vite serves localhost on port 5174. Phone testing requires a separately configured secure HTTPS connection.',
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

function App() {
  // Dark mode state
  const [darkMode, setDarkMode] = useState(true);
  const [legalModal, setLegalModal] = useState<LegalDocument | null>(null);
  
  // State declarations
  const [showClearConfirmation, setShowClearConfirmation] = useState(false);
  const [permissionStatus, setPermissionStatus] = useState<Record<string, string>>({});
  const [audioQuality, setAudioQuality] = useState<AudioQuality>('best');
  const [videoResolution, setVideoResolution] = useState<VideoResolution>('fullscreen');
  const [cameraResolutions, setCameraResolutions] = useState<{[deviceId: string]: string}>({});
  const [availableCameraResolutions, setAvailableCameraResolutions] = useState<{[deviceId: string]: string[]}>({});
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [deviceBusy, setDeviceBusy] = useState(false);
  const deviceOperationsRef = useRef(0);
  const [sessionState, setSessionState] = useState<SessionState>('idle');
  const recording = sessionState !== 'idle'; // Lock every source control during acquisition/finalization too.
  const [transcriptionEnabled, setTranscriptionEnabled] = useState(false);
  const { controller: transcriptionRef, speech } = useLocalTranscription();
  const [showTranscriptionWarning, setShowTranscriptionWarning] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [recordings, setRecordings] = useState<CompletedRecording[]>([]);
  const [screenPrompt, setScreenPrompt] = useState<{ label: string; choose: () => void; cancel: () => void } | null>(null);
  const sessionRef = useRef<RecordingSession | null>(null);
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
  const [hasRequestedAudioPermission, setHasRequestedAudioPermission] = useState(false);
  const [hasRequestedVideoPermission, setHasRequestedVideoPermission] = useState(false);

  // Refs
  const audioGainRef = useRef(audioProcessing.gain);
  const micMeterRequestRef = useRef(0);
  const micMeterRef = useRef<{
    stream: MediaStream;
    context: AudioContext;
    analyser: AnalyserNode;
    source: MediaStreamAudioSourceNode;
    rafId: number | null;
  } | null>(null);

  // Constants
  const isMobile = isAppleMobile(navigator) || /Mobi|Android/i.test(navigator.userAgent);
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

  const withDeviceSetup = async <T,>(task: () => Promise<T>): Promise<T> => {
    deviceOperationsRef.current += 1;
    setDeviceBusy(true);
    try { return await task(); }
    finally {
      deviceOperationsRef.current -= 1;
      setDeviceBusy(deviceOperationsRef.current > 0);
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

  const loadCameraResolutions = (devices: MediaDeviceInfo[]) => withDeviceSetup(async () => {
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
  });

  // Get available devices without requesting permissions
  const getAvailableDevices = async (
    requestPermissions = false,
    permissionTarget: PermissionTarget = 'all',
    hasFreshAudioAccess = false,
    forcePermissionRefresh = false
  ) => withDeviceSetup(async () => {
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
            frontCameras.push(copyMediaDevice(device));
          } else if (labelLower.includes('back') || labelLower.includes('rear') || labelLower.includes('facing environment')) {
            rearCameras.push(copyMediaDevice(device));
          } else {
            unknownCameras.push(copyMediaDevice(device));
          }
        }
      });
      
      // Keep native lens/mode names; number only genuinely identical labels.
      const numberDuplicates = (cameras: MediaDeviceInfo[], baseLabel: string) => {
        const labels = cameraChoiceLabels(cameras.map(camera => camera.label), baseLabel);
        return cameras.map((camera, index) => copyMediaDevice(camera, { label: labels[index] }));
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
      

      return { videoDevices, audioDevices };
    } catch {
      console.warn('Could not enumerate media devices.');
      return { videoDevices: [] as MediaDeviceInfo[], audioDevices: [] as MediaDeviceInfo[] };
    }
  });

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

  const requestGenericMicAccess = () => withDeviceSetup(async () => {
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
  });

  const applyMicGain = async (stream: MediaStream, owner: Acquisition) => {
    if (audioProcessing.gain === 1) return stream;
    const AudioContextCtor = getAudioContextCtor();
    if (!AudioContextCtor) throw new Error('This browser cannot apply microphone gain. Set gain to 100% and try again.');
    const context = new AudioContextCtor();
    owner.ownCleanup(() => context.close());
    const source = context.createMediaStreamSource(stream);
    const gainNode = context.createGain();
    const destination = context.createMediaStreamDestination();
    gainNode.gain.value = audioProcessing.gain;
    source.connect(gainNode);
    gainNode.connect(destination);
    const output = owner.ownStream(destination.stream);
    await context.resume();
    return output;
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

  const startMicMeter = (micId: string) => withDeviceSetup(async () => {
    const requestId = micMeterRequestRef.current + 1;
    micMeterRequestRef.current = requestId;
    stopMicMeter(false);

    const AudioContextCtor = getAudioContextCtor();
    if (!AudioContextCtor) return;

    let pendingStream: MediaStream | undefined;
    let pendingContext: AudioContext | undefined;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: getMicConstraints(micId),
        video: false,
      });

      pendingStream = stream;
      if (requestId !== micMeterRequestRef.current) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }

      const context = new AudioContextCtor() as AudioContext;
      pendingContext = context;
      await context.resume();
      if (requestId !== micMeterRequestRef.current) {
        stream.getTracks().forEach(track => track.stop());
        await context.close();
        return;
      }
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
      pendingStream = undefined;
      pendingContext = undefined;

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
    } catch {
      pendingStream?.getTracks().forEach(track => track.stop());
      if (pendingContext && pendingContext.state !== 'closed') void pendingContext.close();
      console.warn('Could not start microphone level meter.');
      setMicLevelDb(null);
      setMicLevelPercent(0);
    }
  });

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

    setRecordOptions(prev => ({ ...prev, mic: true, micIds }));
    if (micIds.length > 0) {
      void startMicMeter(shouldSelect ? selectableMicId : micIds[0]);
    } else {
      stopMicMeter();
    }
  };

  // Each later display picker is opened directly by its own button click.
  const chooseAdditionalScreen = (label: string, constraints: MediaTrackConstraints, signal: AbortSignal) => new Promise<MediaStream>((resolve, reject) => {
    const cancel = () => {
      signal.removeEventListener('abort', cancel);
      setScreenPrompt(null);
      reject(new DOMException('Capture cancelled', 'AbortError'));
    };
    if (signal.aborted) { cancel(); return; }
    signal.addEventListener('abort', cancel, { once: true });
    setScreenPrompt({ label, cancel: () => { void sessionRef.current?.stop(); }, choose: () => {
      // Do not await device enumeration or other work before this API call.
      const pending = navigator.mediaDevices.getDisplayMedia({ video: constraints });
      signal.removeEventListener('abort', cancel);
      setScreenPrompt(null);
      pending.then(resolve, reject);
    } });
  });

  const changeTranscription = (enabled: boolean) => {
    setTranscriptionEnabled(enabled);
    const engine = transcriptionRef.current;
    if (!enabled && recording) engine?.stopCapture();
    else if (enabled && engine && !['ready', 'loading'].includes(engine.snapshot().modelStatus)) engine.load();
  };

  const startRecording = (withoutTranscription = false) => {
    const session = sessionRef.current;
    if (!session || session.state !== 'idle' || deviceOperationsRef.current > 0) return;
    if (!window.isSecureContext) {
      setPermissionError('Recording requires a secure connection. Open the HTTPS version of this page using the link below the source controls, then try again.');
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setPermissionError('This browser is not exposing the APIs needed for recording. Open this page directly in an up-to-date Safari, Chrome, or Firefox browser. Browsers inside other apps may restrict recording.');
      return;
    }
    const micIds = recordOptions.mic ? recordOptions.micIds.filter(id => !isMicUnlockId(id)) : [];
    if (!recordOptions.screenIds.length && !recordOptions.cameraIds.length && !micIds.length) {
      setPermissionError('Choose at least one recording source.');
      return;
    }
    if (transcriptionEnabled && !withoutTranscription && (!micIds.length || !transcriptionRef.current?.snapshot().canStartCapture)) {
      setShowTranscriptionWarning(true);
      return;
    }
    stopMicMeter();
    void session.start(async owner => {
      setCurrentSessionId(owner.sessionId);
      const transcription = transcriptionEnabled && !withoutTranscription && micIds.length
        ? transcriptionRef.current?.beginCapture(owner.sessionId, micIds.map(id => micDevices.find(device => device.deviceId === id)?.label || 'Microphone').join(' + ')) : undefined;
      if (transcription) owner.ownCleanup(() => transcription.finish());
      const sources: RecordingSource[] = [];
      const sizes: Record<VideoResolution, MediaTrackConstraints> = {
        fullscreen: {}, '1080p': { width: 1920, height: 1080 }, '720p': { width: 1280, height: 720 },
        '480p': { width: 854, height: 480 }, '360p': { width: 640, height: 360 },
      };
      for (const [index, screenId] of recordOptions.screenIds.entries()) {
        owner.signal.throwIfAborted();
        const label = screenDevices.find(device => device.deviceId === screenId)?.label || 'Screen';
        if (!navigator.mediaDevices.getDisplayMedia) throw new Error('This browser does not expose screen capture.');
        try {
          const stream = owner.ownStream(await (index === 0
            ? navigator.mediaDevices.getDisplayMedia({ video: sizes[videoResolution] })
            : chooseAdditionalScreen(label, sizes[videoResolution], owner.signal)));
          sources.push({ label, kind: 'screen', stream });
        } catch (error) {
          if (owner.signal.aborted) throw error;
          throw new Error(getDisplayCaptureErrorMessage(label, error), { cause: error });
        }
      }
      const micStreams: MediaStream[] = [];
      for (const [index, micId] of micIds.entries()) {
        owner.signal.throwIfAborted();
        const raw = owner.ownStream(await navigator.mediaDevices.getUserMedia({ audio: getMicConstraints(micId), video: false }));
        const stream = await applyMicGain(raw, owner);
        micStreams.push(stream);
        sources.push({ label: micDevices.find(device => device.deviceId === micId)?.label || `Microphone ${index + 1}`, kind: 'mic', stream });
      }
      if (micIds.length) {
        setHasRequestedAudioPermission(true);
        setPermissionStatus(prev => ({ ...prev, microphone: 'granted' }));
      }
      if (requiresSingleCamera(recordOptions.cameraIds, navigator) && recordOptions.cameraIds.length > 1) {
        throw new Error('Choose one camera at a time on this device.');
      }
      for (const [index, cameraId] of recordOptions.cameraIds.entries()) {
        owner.signal.throwIfAborted();
        const stream = owner.ownStream(await navigator.mediaDevices.getUserMedia({ video: getCameraConstraints(cameraId, cameraResolutions[cameraId] || '1080p'), audio: false }));
        sources.push({ label: cameraDevices.find(device => device.deviceId === cameraId)?.label || `Camera ${index + 1}`, kind: 'camera', stream });
      }
      if (recordOptions.cameraIds.length) setPermissionStatus(prev => ({ ...prev, camera: 'granted' }));
      // Video containers receive one mixed audio track, not multiple competing tracks.
      let videoAudio = micStreams[0];
      if (micStreams.length > 1 && sources.some(source => source.kind !== 'mic')) {
        const AudioContextCtor = getAudioContextCtor();
        if (!AudioContextCtor) throw new Error('This browser cannot mix multiple microphones. Choose one microphone.');
        const context = new AudioContextCtor();
        owner.ownCleanup(() => context.close());
        const destination = context.createMediaStreamDestination();
        micStreams.forEach(stream => {
          const input = context.createMediaStreamSource(stream);
          const gain = context.createGain();
          gain.gain.value = 1 / micStreams.length;
          input.connect(gain).connect(destination);
        });
        videoAudio = owner.ownStream(destination.stream);
        await context.resume();
      }
      await transcription?.attach(micStreams);
      return sources.map(source => source.kind !== 'mic' && videoAudio
        ? { ...source, stream: owner.ownStream(new MediaStream([...source.stream.getVideoTracks(), ...videoAudio.getAudioTracks()])) }
        : source);
    }, audioQuality);
  };

  const stopRecording = () => { void sessionRef.current?.stop(); };
  const confirmClear = () => {
    sessionRef.current?.clear();
    transcriptionRef.current?.clear();
    setTranscriptionEnabled(false);
    setCurrentSessionId(null);
    setShowClearConfirmation(false);
  };

  // Browser notice component
  const BrowserNotice: React.FC = () => {
    const { isSafari, isFirefox, isIncognito } = getBrowserInfo();

    // These notices contain desktop advice; mobile Safari otherwise gets an empty box.
    if (isMobile) return null;
    
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
    setSupportsDisplayMedia(typeof navigator.mediaDevices?.getDisplayMedia === 'function');
  }, []);

  useEffect(() => {
    setScreenDevices(prev => (
      prev.length > 0 ? prev : [createScreenDevice(1)]
    ));
  }, []);

  useEffect(() => {
    const session = new RecordingSession({ state: state => {
      setSessionState(state);
      if (state === 'recording') transcriptionRef.current?.activateCapture();
    }, recordings: setRecordings, bytes: setRecordingSize, message: setPermissionError }, { preferMP4: isAppleMobile(navigator) });
    sessionRef.current = session;
    return () => { session.dispose(); sessionRef.current = null; };
  }, [transcriptionRef]);

  useEffect(() => {
    if (sessionState !== 'recording') { setRecordingTime(0); return; }
    const update = () => setRecordingTime(Math.floor((Date.now() - (sessionRef.current?.startedAt ?? Date.now())) / 1000));
    update();
    const interval = window.setInterval(update, 250);
    return () => window.clearInterval(interval);
  }, [sessionState]);

  useEffect(() => {
    if (!recording && !recordings.length && !speech.sessions.length) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [recording, recordings.length, speech.sessions.length]);

  const activeLegalDocument = legalModal ? legalDocuments[legalModal] : null;

  // Main render
  return (
    <div className={`App ${darkMode ? 'dark-mode' : 'light-mode'}`}>
      <main className="app-shell">
        {import.meta.env.VITE_PREVIEW_LABEL && <p className="brand-kicker">{import.meta.env.VITE_PREVIEW_LABEL}</p>}
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
                            setRecordOptions(prev => ({ ...prev, screenIds }));
                          }}
                          disabled={recording || deviceBusy}
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
                                      setRecordOptions(prev => ({ ...prev, screenIds }));
                                    }}
                                    disabled={recording || deviceBusy}
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
                                  disabled={recording || deviceBusy}
                                >
                                  Add screen
                                </button>
                                {screenDevices.length > 1 && (
                                  <button
                                    type="button"
                                    className="mini-action secondary"
                                    onClick={removeLastScreenSource}
                                    disabled={recording || deviceBusy}
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
                                  aria-label="Screen resolution"
                                  value={videoResolution}
                                  onChange={e => setVideoResolution(e.target.value as VideoResolution)}
                                  disabled={recording || deviceBusy}
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
                              setRecordOptions(prev => ({ ...prev, mic: true, micIds }));
                            } else {
                              stopMicMeter();
                              setRecordOptions(prev => ({ ...prev, mic: false, micIds: [] }));
                            }
                          }}
                          disabled={recording || deviceBusy}
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
                                disabled={recording || deviceBusy || micNeedsExplicitPermission(device)}
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
                              disabled={recording || deviceBusy}
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
                              disabled={recording || deviceBusy}
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
                              aria-label="Microphone quality"
                              value={audioQuality}
                              onChange={e => setAudioQuality(e.target.value as AudioQuality)}
                              disabled={recording || deviceBusy}
                            >
                              {(['low', 'mid', 'best'] as const).map(quality => <option key={quality} value={quality}>{quality[0].toUpperCase() + quality.slice(1)} ({AUDIO_BITRATES[quality] / 1000}kbps)</option>)}
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
                                  disabled={recording || deviceBusy}
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
                                disabled={recording || deviceBusy}
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
                                disabled={recording || deviceBusy}
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
                                disabled={recording || deviceBusy}
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
                                setRecordOptions(prev => ({ ...prev, cameraIds: [selectedCamera.deviceId] }));
                                void loadCameraResolutions([selectedCamera]);
                              }
                            } else {
                              setRecordOptions(prev => ({ ...prev, cameraIds: [] }));
                            }
                          }}
                          disabled={recording || deviceBusy}
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
                              disabled={recording || deviceBusy}
                            >
                              Refresh cameras
                            </button>
                          </div>
                          <p className="submenu-hint">
                            {requiresSingleCamera(cameraDevices.map(device => device.deviceId), navigator)
                              ? 'Choose one camera at a time. Selecting another replaces the current camera.'
                              : 'You can select several cameras if your browser and hardware support simultaneous capture.'}
                          </p>
                          {isAppleMobile(navigator) && cameraDevices.length > 1 && <p className="submenu-hint">Dual and Triple are lens groups with one video output. The browser controls lens selection.</p>}
                          {cameraDevices.map((device) => (
                            <div key={device.deviceId}>
                              <label className="device-item">
                                <input
                                  type={requiresSingleCamera(cameraDevices.map(camera => camera.deviceId), navigator) ? 'radio' : 'checkbox'}
                                  name="camera-device"
                                  checked={recordOptions.cameraIds.includes(device.deviceId)}
                                  onChange={(e) => {
                                    if (recording) return;
                                    const cameraIds = nextCameraIds(
                                      recordOptions.cameraIds,
                                      device.deviceId,
                                      e.target.checked,
                                      navigator
                                    );
                                    if (e.target.checked) {
                                      void loadCameraResolutions([device]);
                                    }
                                    setRecordOptions(prev => ({ ...prev, cameraIds }));
                                  }}
                                  disabled={recording || deviceBusy}
                                />
                                <span className="device-label">{device.label || "Camera"}{cameraDescription(device.label) && <small className="camera-description">{cameraDescription(device.label)}</small>}</span>
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
                                    aria-label={`${device.label || 'Camera'} resolution`}
                                    value={cameraResolutions[device.deviceId] || '1080p'}
                                    onChange={e => setCameraResolutions(prev => ({
                                      ...prev,
                                      [device.deviceId]: e.target.value
                                    }))}
                                    disabled={recording || deviceBusy}
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
                    <LocalTranscription
                      enabled={transcriptionEnabled} setEnabled={changeTranscription} recording={recording}
                      hasMic={recordOptions.mic && recordOptions.micIds.some(id => !isMicUnlockId(id))}
                      speech={speech} prepare={() => transcriptionRef.current?.load()} unload={() => {
                        setTranscriptionEnabled(false);
                        transcriptionRef.current?.unload('Speech model unloaded. Existing text is kept.');
                      }}
                      resume={() => transcriptionRef.current?.resumeCapture()}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="action-buttons">
            {!window.isSecureContext && window.location.protocol === 'http:' && <p role="alert">Recording requires HTTPS. <a href={window.location.href.replace(/^http:/, 'https:')}>Open the secure page</a>.</p>}
            <button className="btn" onClick={() => startRecording()} disabled={recording || deviceBusy}>Start Recording</button>
            <button className={recording ? 'neon-stop' : 'btn-disabled'} onClick={stopRecording} disabled={!recording || sessionState === 'stopping'}>
              {sessionState === 'acquiring' ? 'Cancel capture' : 'Stop Recording'}
            </button>
          </div>
          <div role="status" aria-live="polite">
            {deviceBusy && <p>Checking selected devices… Finish or dismiss any browser permission prompt to continue.</p>}
            {sessionState === 'acquiring' && <p>Choose your sources in the browser prompts. Recording starts after all sources are ready.</p>}
            {sessionState === 'stopping' && <p>Finishing capture… If a permission prompt is open, close it to continue.</p>}
            {sessionState === 'recording' && <p>Recording in progress</p>}
          </div>
          {sessionState === 'recording' && <>
            <div className="recording-timer">Recording: {formatTime(recordingTime)}</div>
            <div className={`recording-size${recordingSize > 1024 ** 3 ? ' danger' : recordingSize > 500 * 1024 ** 2 ? ' warning' : ''}`}>
              {formatSize(recordingSize)}
              {recordingSize > 500 * 1024 ** 2 && ' — Large recording. Stop and save soon to reduce memory pressure.'}
            </div>
          </>}
          <SessionResults recordings={recordings} transcripts={speech.sessions} currentSessionId={currentSessionId} recording={recording} />
          {(recordings.length > 0 || speech.sessions.length > 0) && <button className="clear-button" disabled={recording || deviceBusy} onClick={() => setShowClearConfirmation(true)}>Clear All</button>}
          {showClearConfirmation && <Modal title="Clear recordings and transcripts?" onDismiss={() => setShowClearConfirmation(false)}>
            <p>This deletes all recordings and transcripts in this tab and unloads the speech model. Check that any files and text you need have finished downloading first.</p>
            <div className="popup-buttons">
              <button className="popup-button confirm" onClick={confirmClear}>Yes</button>
              <button className="popup-button cancel" onClick={() => setShowClearConfirmation(false)}>No</button>
            </div>
          </Modal>}
          {screenPrompt && <Modal title={`Choose ${screenPrompt.label}`} onDismiss={screenPrompt.cancel}>
            <p>Your earlier sources are ready. Choose the next screen to continue.</p>
            <button className="btn" onClick={screenPrompt.choose}>Choose {screenPrompt.label}</button>
            <button className="footer-button footer-link" onClick={screenPrompt.cancel}>Cancel capture</button>
          </Modal>}
          {showTranscriptionWarning && <Modal title="Before you record" onDismiss={() => setShowTranscriptionWarning(false)}>
            <p>{!recordOptions.mic || !recordOptions.micIds.some(id => !isMicUnlockId(id))
              ? 'Transcription needs a microphone. Select Mic above, or record without transcription.'
              : speech.modelStatus === 'loading'
                ? 'Transcription is still preparing. Wait until it is ready, or record without transcription.'
                : speech.modelStatus === 'error'
                  ? 'The speech model could not load. Try preparing it again, or record without transcription.'
                  : speech.modelStatus === 'unloaded'
                    ? 'Transcription needs to be prepared before recording. Try again, or record without transcription.'
                  : !speech.canStartCapture
                    ? 'Transcription is not ready yet. Wait for the previous transcript to finish, or record without transcription.'
                    : 'Transcription is ready. You can start your recording now.'}</p>
            <div className="speech-actions">
              {speech.canStartCapture && recordOptions.mic && recordOptions.micIds.some(id => !isMicUnlockId(id)) && <button className="btn" onClick={() => { setShowTranscriptionWarning(false); startRecording(); }}>Record with transcription</button>}
              <button className="mini-action" onClick={() => {
                setShowTranscriptionWarning(false);
                changeTranscription(false);
                startRecording(true);
              }}>Record without transcription</button>
              <button className="mini-action" onClick={() => {
                setShowTranscriptionWarning(false);
                if (speech.modelStatus === 'error' || speech.modelStatus === 'unloaded') transcriptionRef.current?.load();
              }}>{speech.modelStatus === 'error' || speech.modelStatus === 'unloaded' ? 'Try again' : 'Back to setup'}</button>
            </div>
          </Modal>}
          {permissionError && <Modal title="Recording notice" onDismiss={() => setPermissionError(null)}>
            <p style={{ whiteSpace: 'pre-line' }}>{permissionError}</p>
            <button className="btn" onClick={() => setPermissionError(null)}>OK</button>
          </Modal>}
        </div>

        <footer className="app-footer">
          <div className="copyright">
            <span className="release-version">v{__APP_VERSION__} · </span>© 2026{' '}
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

      {activeLegalDocument && <Modal title={activeLegalDocument.title} onDismiss={() => setLegalModal(null)}>
        <p>Last updated: {activeLegalDocument.updated}</p>
        <div className="legal-content">
          {activeLegalDocument.sections.map(section => <section key={section.heading}>
            <h3>{section.heading}</h3><p>{section.body}</p>
          </section>)}
        </div>
      </Modal>}
    </div>
  );
}

export default App;
