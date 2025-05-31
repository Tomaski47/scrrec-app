import React, { useState } from 'react';
import { useMediaQuery } from 'react-hook-mediaquery';

const Settings = () => {
  const [selectedFolder, setSelectedFolder] = useState('');
  const [recordingOptions, setRecordingOptions] = useState({
    screen: false,
    camera: false,
    mic: false,
    internalAudio: false,
  });
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

      <div className="mt-4">
        <span>Recording Options:</span>
        <div>
          <label>
            <input
              type="checkbox"
              checked={recordingOptions.screen}
              onChange={() =>
                setRecordingOptions((prev) => ({
                  ...prev,
                  screen: !prev.screen,
                }))
              }
            />
            Screen Recording
          </label>
        </div>
        <div>
          <label>
            <input
              type="checkbox"
              checked={recordingOptions.camera}
              onChange={() =>
                setRecordingOptions((prev) => ({
                  ...prev,
                  camera: !prev.camera,
                }))
              }
            />
            Video Camera (front/rear/both)
          </label>
        </div>
        <div>
          <label>
            <input
              type="checkbox"
              checked={recordingOptions.mic}
              onChange={() =>
                setRecordingOptions((prev) => ({
                  ...prev,
                  mic: !prev.mic,
                }))
              }
            />
            Mic Audio
          </label>
        </div>
        <div>
          <label>
            <input
              type="checkbox"
              checked={recordingOptions.internalAudio}
              onChange={() =>
                setRecordingOptions((prev) => ({
                  ...prev,
                  internalAudio: !prev.internalAudio,
                }))
              }
            />
            Internal Audio
          </label>
        </div>
      </div>

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
        className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded mt-4"
        onClick={() =>
          console.log('Settings:', {
            selectedFolder,
            recordingOptions,
            resolution,
            audioQuality,
          })
        }
      >
        Save Settings
      </button>
    </div>
  );
};

export default Settings;
