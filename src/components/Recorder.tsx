import React, { useState, useEffect } from 'react';
import { CameraIcon } from '@lucide/react';

const Recorder = () => {
  // ...
  return (
    <div className="flex flex-col items-center justify-center">
      <button
        className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
        onClick={handleRecord}
      >
        {isRecording ? 'Stop Recording' : 'Start Recording'}
      </button>
      <div className="flex flex-col items-center justify-center">
        <FaMicrophone size={24} />
        <CameraIcon size={24} /> // Update this line
      </div>
    </div>
  );
};

export default Recorder;
