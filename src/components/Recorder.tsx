import React, { useState, useEffect } from 'react';
import { CameraIcon } from '@lucide/react';
import { FaMicrophone } from 'react-icons/fa';

const Recorder = () => {
  const [recordingMode, setRecordingMode] = useState('screen+audio');
  const [resolution, setResolution] = useState('fullhd');
  const [audioQuality, setAudioQuality] = useState('best');
  // ...
  return (
    <div className="flex flex-col items-center justify-center">
      <div className="mb-4 space-y-2">
        <div>
          <label className="text-white mr-2">Mode:</label>
          <select value={recordingMode} onChange={(e) => setRecordingMode(e.target.value)} className="p-1 rounded">
            <option value="audio">Audio Only</option>
            <option value="screen">Screen Only</option>
            <option value="screen+audio">Screen + Audio</option>
          </select>
        </div>
        <div>
          <label className="text-white mr-2">Resolution:</label>
          <select value={resolution} onChange={(e) => setResolution(e.target.value)} className="p-1 rounded">
            <option value="fullhd">Full Screen</option>
            <option value="1080p">1080p</option>
            <option value="720p">720p</option>
            <option value="480p">480p</option>
            <option value="360p">360p</option>
          </select>
        </div>
        <div>
          <label className="text-white mr-2">Audio Quality:</label>
          <select value={audioQuality} onChange={(e) => setAudioQuality(e.target.value)} className="p-1 rounded">
            <option value="best">Best</option>
            <option value="mid">Mid</option>
            <option value="low">Low</option>
          </select>
        </div>
      </div>
      <button
        className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
        onClick={handleRecord}
      >
        {isRecording ? 'Stop Recording' : 'Start Recording'}
      </button>
      <div className="flex flex-col items-center justify-center">
        <FaMicrophone size={24} />
        {recordingMode === 'audio' ? <FaMicrophone size={24} /> : <CameraIcon size={24} />}
      </div>
    </div>
  );
};

export default Recorder;
