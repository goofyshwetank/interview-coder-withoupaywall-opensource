import React, { useState, useEffect } from 'react';
import { systemAudioCaptureService } from '../services/SystemAudioCaptureService';

interface SystemAudioCaptureProps {
  onTranscript?: (transcript: string) => void;
  onAiResponse?: (response: string) => void;
}

export const SystemAudioCapture: React.FC<SystemAudioCaptureProps> = ({ 
  onTranscript, 
  onAiResponse 
}) => {
  const [isCapturing, setIsCapturing] = useState(false);
  const [status, setStatus] = useState('');
  const [diagnostics, setDiagnostics] = useState<any>(null);
  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [lastTranscript, setLastTranscript] = useState('');
  const [lastAiResponse, setLastAiResponse] = useState('');

  useEffect(() => {
    // Load existing Gemini API key
    const loadGeminiKey = async () => {
      try {
        const config = await window.electronAPI.getConfig();
        if (config?.geminiApiKey) {
          setGeminiApiKey(config.geminiApiKey);
          systemAudioCaptureService.setGeminiApiKey(config.geminiApiKey);
        }
      } catch (error) {
        console.error('Error loading Gemini API key:', error);
      }
    };

    loadGeminiKey();
    updateStatus();
    setDiagnostics(systemAudioCaptureService.getDiagnostics());

    // Set up event listeners for transcription results
    const handleTranscript = (transcript: string) => {
      setLastTranscript(transcript);
      onTranscript?.(transcript);
    };

    const handleAiResponse = (response: string) => {
      setLastAiResponse(response);
      onAiResponse?.(response);
    };

    // Listen for AI responses
    const unsubscribeAiResponse = window.electronAPI.onAiResponse?.(handleAiResponse);
    
    // Listen for transcription results
    const unsubscribeTranscript = window.electronAPI.onSpeechResult?.((transcript: string) => {
      handleTranscript(transcript);
    });

    return () => {
      unsubscribeAiResponse?.();
      unsubscribeTranscript?.();
    };
  }, [onTranscript, onAiResponse]);

  const updateStatus = () => {
    setStatus(systemAudioCaptureService.getStatus());
    setIsCapturing(systemAudioCaptureService.isActive());
  };

  const handleStartCapture = async () => {
    if (!geminiApiKey.trim()) {
      alert('Please enter your Gemini API key first');
      return;
    }

    systemAudioCaptureService.setGeminiApiKey(geminiApiKey);
    
    const success = await systemAudioCaptureService.startSystemAudioCapture();
    if (success) {
      setIsCapturing(true);
      updateStatus();
    }
  };

  const handleStopCapture = () => {
    systemAudioCaptureService.stop();
    setIsCapturing(false);
    updateStatus();
  };

  const handleTestSystemAudio = async () => {
    const canCapture = await systemAudioCaptureService.testSystemAudio();
    if (canCapture) {
      alert('System audio capture is available!');
    } else {
      alert('System audio capture is not available. Please check the setup instructions.');
    }
  };

  const handleSaveGeminiKey = async () => {
    if (!geminiApiKey.trim()) {
      alert('Please enter a valid Gemini API key');
      return;
    }

    try {
      await window.electronAPI.updateConfig({ geminiApiKey });
      systemAudioCaptureService.setGeminiApiKey(geminiApiKey);
      alert('Gemini API key saved successfully!');
      updateStatus();
    } catch (error) {
      console.error('Error saving Gemini API key:', error);
      alert('Failed to save Gemini API key');
    }
  };

  return (
    <div className="system-audio-capture p-4 border rounded-lg bg-gray-50 dark:bg-gray-800">
      <h3 className="text-lg font-semibold mb-4">System Audio Capture & AI Response</h3>
      
      {/* Gemini API Key Configuration */}
      <div className="mb-4">
        <label className="block text-sm font-medium mb-2">
          Gemini API Key (Free)
          <a 
            href="https://makersuite.google.com/app/apikey" 
            target="_blank" 
            rel="noopener noreferrer"
            className="ml-2 text-blue-500 hover:text-blue-700 text-xs"
          >
            Get Free Key
          </a>
        </label>
        <div className="flex gap-2">
          <input
            type="password"
            value={geminiApiKey}
            onChange={(e) => setGeminiApiKey(e.target.value)}
            placeholder="Enter your Gemini API key"
            className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600"
          />
          <button
            onClick={handleSaveGeminiKey}
            className="px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-green-500"
          >
            Save
          </button>
        </div>
      </div>

      {/* Controls */}
      <div className="flex gap-2 mb-4">
        {!isCapturing ? (
          <button
            onClick={handleStartCapture}
            disabled={!geminiApiKey.trim()}
            className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            🎧 Start System Audio Capture
          </button>
        ) : (
          <button
            onClick={handleStopCapture}
            className="px-4 py-2 bg-red-500 text-white rounded-md hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-red-500"
          >
            ⏹️ Stop Capture
          </button>
        )}
        
        <button
          onClick={handleTestSystemAudio}
          className="px-4 py-2 bg-yellow-500 text-white rounded-md hover:bg-yellow-600 focus:outline-none focus:ring-2 focus:ring-yellow-500"
        >
          🧪 Test System Audio
        </button>
        
        <button
          onClick={() => setShowDiagnostics(!showDiagnostics)}
          className="px-4 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-500"
        >
          📊 Diagnostics
        </button>
      </div>

      {/* Status */}
      <div className="mb-4">
        <div className={`px-3 py-2 rounded-md text-sm ${
          isCapturing 
            ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' 
            : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200'
        }`}>
          Status: {status}
        </div>
      </div>

      {/* Live Transcription Display */}
      {(lastTranscript || lastAiResponse) && (
        <div className="mb-4 space-y-2">
          {lastTranscript && (
            <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-md">
              <div className="text-sm font-medium text-blue-800 dark:text-blue-200 mb-1">
                Heard:
              </div>
              <div className="text-sm text-blue-700 dark:text-blue-300">
                {lastTranscript}
              </div>
            </div>
          )}
          
          {lastAiResponse && (
            <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-md">
              <div className="text-sm font-medium text-green-800 dark:text-green-200 mb-1">
                AI Response:
              </div>
              <div className="text-sm text-green-700 dark:text-green-300">
                {lastAiResponse}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Diagnostics */}
      {showDiagnostics && diagnostics && (
        <div className="mt-4 p-3 bg-gray-100 dark:bg-gray-700 rounded-md">
          <h4 className="font-medium mb-2">System Diagnostics</h4>
          <div className="text-sm space-y-1">
            <div>Display Media: {diagnostics.hasGetDisplayMedia ? '✅' : '❌'}</div>
            <div>User Media: {diagnostics.hasGetUserMedia ? '✅' : '❌'}</div>
            <div>Web Audio: {diagnostics.hasWebAudio ? '✅' : '❌'}</div>
            <div>Media Recorder: {diagnostics.hasMediaRecorder ? '✅' : '❌'}</div>
            <div>Speech Recognition: {diagnostics.hasSpeechRecognition ? '✅' : '❌'}</div>
            <div>Gemini API Key: {diagnostics.hasGeminiKey ? '✅' : '❌'}</div>
            <div>Platform: {diagnostics.platform}</div>
            <div>Online: {diagnostics.isOnline ? '✅' : '❌'}</div>
          </div>
        </div>
      )}

      {/* Setup Instructions */}
      <div className="mt-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-md">
        <h4 className="font-medium text-yellow-800 dark:text-yellow-200 mb-2">
          Setup Instructions
        </h4>
        <div className="text-sm text-yellow-700 dark:text-yellow-300 space-y-1">
          <div><strong>Linux:</strong> Run: <code>pactl load-module module-remap-source master=@DEFAULT_MONITOR@ source_name=virtmic source_properties=device.description=Virtual_Microphone</code></div>
          <div><strong>Windows:</strong> Enable "Stereo Mix" in Recording Devices or use VB-Audio Virtual Cable</div>
          <div><strong>macOS:</strong> Install BlackHole or SoundFlower</div>
        </div>
      </div>
    </div>
  );
};