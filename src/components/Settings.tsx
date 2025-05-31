import React, { useState } from 'react';
import { useMediaQuery } from 'react-hook-mediaquery';

const Settings = () => {
  const [selectedFolder, setSelectedFolder] = useState('');

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
