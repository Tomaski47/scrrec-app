import React, { useState } from 'react';
import { useMediaQuery } from 'react-hook-mediaquery';

const Settings = () => {
  const [selectedFolder, setSelectedFolder] = useState('');
  const [recordingMode, setRecordingMode] = useState('screen-audio');
  const [resolution, setResolution] = useState('full');
  const [audioQuality, setAudioQuality] = useState('best');

  return (
    <div className="flex flex-col items-center justify-center">
      <label>
        Select Folder:
        <input
          type="text"
          value={selectedFolder}
          onChange={(event) => setSelectedFolder(event.target.value)}
        />
      </label>

      <label className="mt-4">
        Recording Mode:
        <select
          value={recordingMode}
          onChange={(e) => setRecordingMode(e.target.value)}
          className="ml-2 border border-gray-300 rounded px-2 py-1"
        >
          <option value="screen">Screen Only</option>
          <option value="screen-audio">Screen + Audio</option>
          <option value="audio">Audio Only</option>
        </select>
      </label>

      <label className="mt-4">
        Resolution:
        <select
          value={resolution}
          onChange={(e) => setResolution(e.target.value)}
          className="ml-2 border border-gray-300 rounded px-2 py-1"
        >
          <option value="full">Full Screen</option>
          <option value="1080p">1080p</option>
          <option value="720p">720p</option>
          <option value="480p">480p</option>
          <option value="360p">360p</option>
        </select>
      </label>

      <label className="mt-4">
        Audio Quality:
        <select
          value={audioQuality}
          onChange={(e) => setAudioQuality(e.target.value)}
          className="ml-2 border border-gray-300 rounded px-2 py-1"
        >
          <option value="best">Best</option>
          <option value="mid">Mid</option>
          <option value="low">Low</option>
        </select>
      </label>

      <button
        className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
        onClick={() => console.log('Selected Folder:', selectedFolder)}
      >
        Save Settings
      </button>
    </div>
  );
};

export default Settings;
