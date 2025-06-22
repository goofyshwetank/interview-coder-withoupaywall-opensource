import React, { useState, useEffect, useRef } from 'react';
import { useToast } from '../../contexts/toast';
import { speechRecognitionService } from '../../services/SpeechRecognitionService';
import { googleSpeechService } from '../../services/GoogleSpeechService';

interface InterviewModeProps {
  onClose: () => void;
}

interface ConversationMessage {
  role: string;
  content: string;
  timestamp: number;
}

const InterviewMode: React.FC<InterviewModeProps> = ({ onClose }) => {
  const { showToast } = useToast();
  const [resumeText, setResumeText] = useState('');
  const [question, setQuestion] = useState('');
  const [conversationHistory, setConversationHistory] = useState<ConversationMessage[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [hasResume, setHasResume] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [speechStatus, setSpeechStatus] = useState('');
  const [currentTranscript, setCurrentTranscript] = useState('');
  const [autoResponse, setAutoResponse] = useState('');
  const [showManualInput, setShowManualInput] = useState(false);
  const [manualQuestion, setManualQuestion] = useState('');
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [diagnosticsInfo, setDiagnosticsInfo] = useState<any>(null);
  const [showGoogleSpeechSettings, setShowGoogleSpeechSettings] = useState(false);
  const [googleSpeechApiKey, setGoogleSpeechApiKey] = useState('');
  const [useGoogleSpeech, setUseGoogleSpeech] = useState(false);
  const [isTestingApiKey, setIsTestingApiKey] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadResumeData();
    loadConversationHistory();
    setupSpeechRecognition();
    loadGoogleSpeechSettings();
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [conversationHistory, autoResponse]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const setupSpeechRecognition = () => {
    // Set up speech recognition event listeners
    const unsubscribeSpeechResult = window.electronAPI.onSpeechResult((transcript: string, isFinal: boolean) => {
      if (isFinal) {
        setCurrentTranscript('');
        // The backend will automatically process this and generate a response
      } else {
        setCurrentTranscript(transcript);
      }
    });

    const unsubscribeSpeechError = window.electronAPI.onSpeechError((error: string) => {
      showToast('Speech Recognition Error', error, 'error');
      setIsListening(false);
    });

    const unsubscribeSpeechStatus = window.electronAPI.onSpeechStatus((status: string) => {
      setSpeechStatus(status);
    });

    // Listen for auto-generated responses
    const unsubscribeResponseGenerated = window.electronAPI.onInterviewResponseGenerated((data: { question: string, answer: string }) => {
      setAutoResponse(data.answer);
      // Auto-clear after 10 seconds
      setTimeout(() => setAutoResponse(''), 10000);
    });

    // Listen for speech recognition toggle shortcut
    const unsubscribeToggleShortcut = window.electronAPI.onToggleSpeechRecognition(() => {
      toggleSpeechRecognition();
    });

    // Listen for start/stop commands from main process
    const unsubscribeStartRenderer = window.electronAPI.onStartSpeechRecognitionRenderer(async () => {
      const success = await speechRecognitionService.start();
      if (success) {
        setIsListening(true);
      } else {
        showToast('Error', 'Failed to start speech recognition', 'error');
      }
    });

    const unsubscribeStopRenderer = window.electronAPI.onStopSpeechRecognitionRenderer(() => {
      if (speechRecognitionService.stop()) {
        setIsListening(false);
        setCurrentTranscript('');
      }
    });

    const unsubscribeStopGoogleSpeech = window.electronAPI.onStopGoogleSpeechRenderer(() => {
      if (googleSpeechService.stop()) {
        setIsListening(false);
        setCurrentTranscript('');
      }
    });

    return () => {
      unsubscribeSpeechResult();
      unsubscribeSpeechError();
      unsubscribeSpeechStatus();
      unsubscribeResponseGenerated();
      unsubscribeToggleShortcut();
      unsubscribeStartRenderer();
      unsubscribeStopRenderer();
      unsubscribeStopGoogleSpeech();
    };
  };

  const loadResumeData = async () => {
    try {
      const result = await window.electronAPI.getResumeData();
      if (result.success && result.data) {
        setResumeText(result.data);
        setHasResume(true);
      }
    } catch (error) {
      console.error('Error loading resume data:', error);
    }
  };

  const loadConversationHistory = async () => {
    try {
      const result = await window.electronAPI.getConversationHistory();
      if (result.success) {
        setConversationHistory(result.history);
      }
    } catch (error) {
      console.error('Error loading conversation history:', error);
    }
  };

  const handleUploadResume = async () => {
    if (!resumeText.trim()) {
      showToast('Error', 'Please enter your resume content', 'error');
      return;
    }

    try {
      const result = await window.electronAPI.uploadResume(resumeText);
      if (result.success) {
        setHasResume(true);
        showToast('Success', 'Resume uploaded successfully', 'success');
      } else {
        showToast('Error', result.error || 'Failed to upload resume', 'error');
      }
    } catch (error) {
      console.error('Error uploading resume:', error);
      showToast('Error', 'Failed to upload resume', 'error');
    }
  };

  const handleAskQuestion = async () => {
    if (!question.trim()) {
      showToast('Error', 'Please enter a question', 'error');
      return;
    }

    if (!hasResume) {
      showToast('Error', 'Please upload your resume first', 'error');
      return;
    }

    setIsProcessing(true);
    const currentQuestion = question;
    setQuestion('');

    try {
      const result = await window.electronAPI.processInterviewQuestion(currentQuestion);
      if (result.success) {
        // The conversation history is automatically updated by the backend
        await loadConversationHistory();
      } else {
        showToast('Error', result.error || 'Failed to process question', 'error');
      }
    } catch (error) {
      console.error('Error processing question:', error);
      showToast('Error', 'Failed to process question', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClearHistory = async () => {
    try {
      const result = await window.electronAPI.clearConversationHistory();
      if (result.success) {
        setConversationHistory([]);
        showToast('Success', 'Conversation history cleared', 'success');
      }
    } catch (error) {
      console.error('Error clearing history:', error);
      showToast('Error', 'Failed to clear history', 'error');
    }
  };

  const toggleSpeechRecognition = async () => {
    try {
      if (isListening) {
        const result = await window.electronAPI.stopSpeechRecognition();
        if (result.success) {
          setIsListening(false);
          setCurrentTranscript('');
          showToast('Success', 'Speech recognition stopped', 'success');
        }
      } else {
        if (!hasResume) {
          showToast('Error', 'Please upload your resume first', 'error');
          return;
        }
        
        // Use Google Speech API if enabled and configured
        if (useGoogleSpeech && googleSpeechApiKey) {
          const success = await googleSpeechService.start();
          if (success) {
            setIsListening(true);
            showToast('Success', 'Listening with Google Speech API...', 'success');
          } else {
            showToast('Error', 'Failed to start Google Speech API', 'error');
          }
        } else {
          // Fall back to Web Speech API
          const result = await window.electronAPI.startSpeechRecognition();
          if (result.success) {
            setIsListening(true);
            showToast('Success', 'Listening to interviewer...', 'success');
          } else {
            showToast('Error', result.error || 'Failed to start speech recognition', 'error');
          }
        }
      }
    } catch (error) {
      console.error('Error toggling speech recognition:', error);
      showToast('Error', 'Failed to toggle speech recognition', 'error');
    }
  };

  const formatTimestamp = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString();
  };

  const runDiagnostics = () => {
    const diagnostics = speechRecognitionService.getDiagnostics();
    const solutions = speechRecognitionService.getAlternativeSolutions();
    setDiagnosticsInfo({ ...diagnostics, solutions });
    setShowDiagnostics(true);
  };

  const copyDiagnostics = () => {
    if (diagnosticsInfo) {
      const diagnosticsText = `Speech Recognition Diagnostics:
- SpeechRecognition API: ${diagnosticsInfo.hasSpeechRecognition ? 'Available' : 'Not Available'}
- WebkitSpeechRecognition API: ${diagnosticsInfo.hasWebkitSpeechRecognition ? 'Available' : 'Not Available'}
- Secure Context: ${diagnosticsInfo.isSecureContext ? 'Yes' : 'No'}
- Microphone Access: ${diagnosticsInfo.hasMicrophone ? 'Available' : 'Not Available'}
- Online Status: ${diagnosticsInfo.isOnline ? 'Online' : 'Offline'}
- Electron Version: ${diagnosticsInfo.electronVersion}
- Chrome Version: ${diagnosticsInfo.chromeVersion}
- Platform: ${diagnosticsInfo.platform}
- User Agent: ${diagnosticsInfo.userAgent}`;
      
      navigator.clipboard.writeText(diagnosticsText).then(() => {
        showToast('Success', 'Diagnostics copied to clipboard', 'success');
      }).catch(() => {
        showToast('Error', 'Failed to copy diagnostics', 'error');
      });
    }
  };

  const handleSaveGoogleSpeechSettings = async () => {
    try {
      const [apiKeyResult, useGoogleResult] = await Promise.all([
        window.electronAPI.setGoogleSpeechApiKey(googleSpeechApiKey),
        window.electronAPI.setUseGoogleSpeech(useGoogleSpeech)
      ]);
      
      if (apiKeyResult.success && useGoogleResult.success) {
        googleSpeechService.setApiKey(googleSpeechApiKey);
        setShowGoogleSpeechSettings(false);
        showToast('Success', 'Google Speech settings saved', 'success');
      } else {
        showToast('Error', 'Failed to save Google Speech settings', 'error');
      }
    } catch (error) {
      console.error('Error saving Google Speech settings:', error);
      showToast('Error', 'Failed to save Google Speech settings', 'error');
    }
  };

  const handleTestGoogleSpeechApiKey = async () => {
    if (!googleSpeechApiKey.trim()) {
      showToast('Error', 'Please enter a Google Speech API key', 'error');
      return;
    }

    setIsTestingApiKey(true);
    try {
      const result = await window.electronAPI.testGoogleSpeechApiKey(googleSpeechApiKey);
      if (result.success) {
        showToast('Success', 'Google Speech API key is valid!', 'success');
      } else {
        showToast('Error', result.error || 'API key test failed', 'error');
      }
    } catch (error) {
      console.error('Error testing API key:', error);
      showToast('Error', 'Failed to test API key', 'error');
    } finally {
      setIsTestingApiKey(false);
    }
  };

  const loadGoogleSpeechSettings = async () => {
    try {
      const [apiKeyResult, useGoogleResult] = await Promise.all([
        window.electronAPI.getGoogleSpeechApiKey(),
        window.electronAPI.getUseGoogleSpeech()
      ]);
      
      if (apiKeyResult.success) {
        setGoogleSpeechApiKey(apiKeyResult.apiKey);
        googleSpeechService.setApiKey(apiKeyResult.apiKey);
      }
      
      if (useGoogleResult.success) {
        setUseGoogleSpeech(useGoogleResult.useGoogleSpeech);
      }
    } catch (error) {
      console.error('Error loading Google Speech settings:', error);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-gray-900 rounded-lg p-6 w-full max-w-6xl h-[90vh] flex flex-col">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold text-white">Interview Mode</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 flex gap-4 overflow-hidden">
          {/* Resume Section */}
          <div className="w-1/3 flex flex-col">
            <h3 className="text-lg font-medium text-white mb-2">Resume</h3>
            <textarea
              value={resumeText}
              onChange={(e) => setResumeText(e.target.value)}
              placeholder="Paste your resume content here..."
              className="flex-1 bg-gray-800 text-white p-3 rounded border border-gray-700 resize-none"
            />
            <div className="flex gap-2 mt-2">
              <button
                onClick={handleUploadResume}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded transition-colors"
              >
                Upload Resume
              </button>
              {hasResume && (
                <span className="text-green-400 text-sm flex items-center">
                  ✓ Resume uploaded
                </span>
              )}
            </div>
          </div>

          {/* Chat Section */}
          <div className="flex-1 flex flex-col">
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-lg font-medium text-white">Interview Chat</h3>
              <div className="flex gap-2">
                {/* Manual Input Button */}
                <button
                  onClick={() => setShowManualInput(!showManualInput)}
                  className="bg-yellow-600 hover:bg-yellow-700 text-white px-3 py-2 rounded text-sm font-medium transition-colors"
                >
                  ✏️ Manual Input
                </button>
                {/* Google Speech Settings Button */}
                <button
                  onClick={() => setShowGoogleSpeechSettings(!showGoogleSpeechSettings)}
                  className="bg-purple-600 hover:bg-purple-700 text-white px-3 py-2 rounded text-sm font-medium transition-colors"
                >
                  🎤 Google Speech
                </button>
                {/* Diagnostics Button */}
                <button
                  onClick={runDiagnostics}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded text-sm font-medium transition-colors"
                >
                  🔧 Diagnostics
                </button>
                {/* Speech Recognition Toggle */}
                <button
                  onClick={toggleSpeechRecognition}
                  disabled={!hasResume}
                  className={`px-4 py-2 rounded transition-colors text-sm font-medium ${
                    isListening
                      ? 'bg-red-600 hover:bg-red-700 text-white'
                      : 'bg-green-600 hover:bg-green-700 text-white'
                  } disabled:bg-gray-600 disabled:cursor-not-allowed`}
                >
                  {isListening 
                    ? '🛑 Stop Listening' 
                    : useGoogleSpeech && googleSpeechApiKey 
                      ? '🎤 Start Google Speech' 
                      : '🎤 Start Listening'
                  }
                </button>
                {conversationHistory.length > 0 && (
                  <button
                    onClick={handleClearHistory}
                    className="text-red-400 hover:text-red-300 text-sm transition-colors"
                  >
                    Clear History
                  </button>
                )}
              </div>
            </div>

            {/* Speech Status */}
            {isListening && (
              <div className="mb-2 p-2 bg-blue-900/50 border border-blue-500/50 rounded text-sm text-blue-200">
                <div className="flex items-center gap-2">
                  <div className="animate-pulse w-2 h-2 bg-red-500 rounded-full"></div>
                  {useGoogleSpeech && googleSpeechApiKey 
                    ? 'Listening with Google Speech API...' 
                    : (speechStatus || 'Listening to interviewer...')
                  }
                </div>
                {currentTranscript && (
                  <div className="mt-1 text-xs text-blue-300">
                    <strong>Heard:</strong> {currentTranscript}
                  </div>
                )}
              </div>
            )}

            {/* Manual Input Fallback */}
            {showManualInput && (
              <div className="mb-4 p-4 bg-yellow-900/50 border border-yellow-500/50 rounded">
                <div className="flex justify-between items-center mb-2">
                  <h4 className="text-yellow-200 font-medium">Manual Question Input</h4>
                  <button
                    onClick={() => setShowManualInput(false)}
                    className="text-yellow-400 hover:text-yellow-300 text-sm"
                  >
                    ✕
                  </button>
                </div>
                <div className="space-y-2">
                  <textarea
                    value={manualQuestion}
                    onChange={(e) => setManualQuestion(e.target.value)}
                    placeholder="Type the interviewer's question here..."
                    className="w-full bg-gray-800 text-white p-2 rounded border border-gray-700 resize-none h-20"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={async () => {
                        if (manualQuestion.trim()) {
                          try {
                            const result = await window.electronAPI.processInterviewQuestion(manualQuestion.trim());
                            if (result.success) {
                              setAutoResponse(result.data);
                              setManualQuestion('');
                              setShowManualInput(false);
                              await loadConversationHistory();
                            } else {
                              showToast('Error', result.error || 'Failed to process question', 'error');
                            }
                          } catch (error) {
                            console.error('Error processing manual question:', error);
                            showToast('Error', 'Failed to process question', 'error');
                          }
                        }
                      }}
                      disabled={!manualQuestion.trim()}
                      className="bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white px-4 py-2 rounded text-sm transition-colors"
                    >
                      Generate Response
                    </button>
                    <button
                      onClick={() => setShowManualInput(false)}
                      className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded text-sm transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Google Speech Settings */}
            {showGoogleSpeechSettings && (
              <div className="mb-4 p-4 bg-purple-900/50 border border-purple-500/50 rounded max-h-96 overflow-y-auto">
                <div className="flex justify-between items-center mb-2 sticky top-0 bg-purple-900/50 z-10">
                  <h4 className="text-purple-200 font-medium">Google Speech-to-Text Settings</h4>
                  <button
                    onClick={() => setShowGoogleSpeechSettings(false)}
                    className="text-purple-400 hover:text-purple-300 text-sm"
                  >
                    ✕
                  </button>
                </div>
                <div className="space-y-3">
                  <div>
                    <label className="block text-purple-100 text-sm font-medium mb-1">
                      Google Speech API Key
                    </label>
                    <input
                      type="password"
                      value={googleSpeechApiKey}
                      onChange={(e) => setGoogleSpeechApiKey(e.target.value)}
                      placeholder="Enter your Google Speech API key..."
                      className="w-full bg-gray-800 text-white p-2 rounded border border-gray-700"
                    />
                    <div className="text-xs text-purple-300 mt-1">
                      Get your API key from <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">Google Cloud Console</a>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="useGoogleSpeech"
                      checked={useGoogleSpeech}
                      onChange={(e) => setUseGoogleSpeech(e.target.checked)}
                      className="rounded"
                    />
                    <label htmlFor="useGoogleSpeech" className="text-purple-100 text-sm">
                      Use Google Speech API (more reliable than browser speech recognition)
                    </label>
                  </div>
                  
                  <div className="flex gap-2">
                    <button
                      onClick={handleTestGoogleSpeechApiKey}
                      disabled={!googleSpeechApiKey.trim() || isTestingApiKey}
                      className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white px-4 py-2 rounded text-sm transition-colors"
                    >
                      {isTestingApiKey ? 'Testing...' : 'Test API Key'}
                    </button>
                    <button
                      onClick={handleSaveGoogleSpeechSettings}
                      disabled={!googleSpeechApiKey.trim()}
                      className="bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white px-4 py-2 rounded text-sm transition-colors"
                    >
                      Save Settings
                    </button>
                    <button
                      onClick={() => setShowGoogleSpeechSettings(false)}
                      className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded text-sm transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                  
                  <div className="text-xs text-purple-300 bg-purple-900/30 p-2 rounded">
                    <div className="font-medium mb-1">How to get a Google Speech API key:</div>
                    <ol className="list-decimal list-inside space-y-1">
                      <li>Go to <a href="https://console.cloud.google.com/" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">Google Cloud Console</a></li>
                      <li>Create a new project or select existing one</li>
                      <li>Enable the Speech-to-Text API</li>
                      <li>Create credentials (API Key, Service Account, or OAuth Client ID)</li>
                      <li>Copy the API key and paste it above</li>
                    </ol>
                    <div className="mt-2 p-2 bg-gray-800 rounded">
                      <div className="font-medium mb-1">Credential Types:</div>
                      <ul className="list-disc list-inside space-y-1 text-xs">
                        <li><strong>API Key</strong> (Recommended): Simple, works immediately</li>
                        <li><strong>Service Account</strong>: More secure, use the <code>private_key_id</code> from JSON file</li>
                        <li><strong>OAuth Client ID</strong>: Use the Client ID value</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Speech Recognition Error Help */}
            {speechStatus.includes('error') && (
              <div className="mb-4 p-4 bg-red-900/50 border border-red-500/50 rounded">
                <div className="flex justify-between items-center mb-2">
                  <h4 className="text-red-200 font-medium">Speech Recognition Issue</h4>
                  <button
                    onClick={() => setShowManualInput(true)}
                    className="bg-yellow-600 hover:bg-yellow-700 text-white px-3 py-1 rounded text-sm transition-colors"
                  >
                    Use Manual Input
                  </button>
                </div>
                <div className="text-red-100 text-sm">
                  <p className="mb-2">Speech recognition is having issues. You can:</p>
                  <ul className="list-disc list-inside space-y-1 text-xs">
                    <li>Check your internet connection</li>
                    <li>Allow microphone permissions in your browser</li>
                    <li>Try refreshing the page</li>
                    <li>Use the manual input option above</li>
                  </ul>
                </div>
              </div>
            )}

            {/* Diagnostics Panel */}
            {showDiagnostics && diagnosticsInfo && (
              <div className="mb-4 p-4 bg-blue-900/50 border border-blue-500/50 rounded">
                <div className="flex justify-between items-center mb-2">
                  <h4 className="text-blue-200 font-medium">Speech Recognition Diagnostics</h4>
                  <div className="flex gap-2">
                    <button
                      onClick={copyDiagnostics}
                      className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-sm transition-colors"
                    >
                      📋 Copy
                    </button>
                    <button
                      onClick={() => setShowDiagnostics(false)}
                      className="text-blue-400 hover:text-blue-300 text-sm"
                    >
                      ✕
                    </button>
                  </div>
                </div>
                <div className="text-blue-100 text-sm space-y-1">
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="font-medium">SpeechRecognition API:</span>
                      <span className={`ml-2 ${diagnosticsInfo.hasSpeechRecognition ? 'text-green-400' : 'text-red-400'}`}>
                        {diagnosticsInfo.hasSpeechRecognition ? '✅ Available' : '❌ Not Available'}
                      </span>
                    </div>
                    <div>
                      <span className="font-medium">WebkitSpeechRecognition:</span>
                      <span className={`ml-2 ${diagnosticsInfo.hasWebkitSpeechRecognition ? 'text-green-400' : 'text-red-400'}`}>
                        {diagnosticsInfo.hasWebkitSpeechRecognition ? '✅ Available' : '❌ Not Available'}
                      </span>
                    </div>
                    <div>
                      <span className="font-medium">Secure Context:</span>
                      <span className={`ml-2 ${diagnosticsInfo.isSecureContext ? 'text-green-400' : 'text-red-400'}`}>
                        {diagnosticsInfo.isSecureContext ? '✅ Yes' : '❌ No'}
                      </span>
                    </div>
                    <div>
                      <span className="font-medium">Microphone Access:</span>
                      <span className={`ml-2 ${diagnosticsInfo.hasMicrophone ? 'text-green-400' : 'text-red-400'}`}>
                        {diagnosticsInfo.hasMicrophone ? '✅ Available' : '❌ Not Available'}
                      </span>
                    </div>
                    <div>
                      <span className="font-medium">Online Status:</span>
                      <span className={`ml-2 ${diagnosticsInfo.isOnline ? 'text-green-400' : 'text-red-400'}`}>
                        {diagnosticsInfo.isOnline ? '✅ Online' : '❌ Offline'}
                      </span>
                    </div>
                    <div>
                      <span className="font-medium">Electron Version:</span>
                      <span className="ml-2 text-blue-300">{diagnosticsInfo.electronVersion}</span>
                    </div>
                    <div>
                      <span className="font-medium">Chrome Version:</span>
                      <span className="ml-2 text-blue-300">{diagnosticsInfo.chromeVersion}</span>
                    </div>
                    <div>
                      <span className="font-medium">Platform:</span>
                      <span className="ml-2 text-blue-300">{diagnosticsInfo.platform}</span>
                    </div>
                  </div>
                  
                  {/* Alternative Solutions */}
                  {diagnosticsInfo.solutions && diagnosticsInfo.solutions.length > 0 && (
                    <div className="mt-3 space-y-2">
                      <div className="font-medium text-blue-200">Issues Found & Solutions:</div>
                      {diagnosticsInfo.solutions.map((solution: any, index: number) => (
                        <div key={index} className={`p-2 rounded text-xs ${
                          solution.type === 'error' ? 'bg-red-900/50 border border-red-500/50' : 'bg-yellow-900/50 border border-yellow-500/50'
                        }`}>
                          <div className="font-medium mb-1">{solution.title}</div>
                          <div className="text-gray-300 mb-2">{solution.description}</div>
                          <div className="text-gray-400">
                            <div className="font-medium mb-1">Recommended Actions:</div>
                            <ul className="list-disc list-inside space-y-1">
                              {solution.actions.map((action: string, actionIndex: number) => (
                                <li key={actionIndex}>{action}</li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  
                  <div className="mt-2 p-2 bg-gray-800 rounded text-xs">
                    <div className="font-medium mb-1">User Agent:</div>
                    <div className="text-gray-300 break-all">{diagnosticsInfo.userAgent}</div>
                  </div>
                  <div className="mt-2 text-xs text-blue-300">
                    <p><strong>Note:</strong> Speech recognition may not work in all Electron environments. The <strong>Manual Input</strong> option is the most reliable alternative.</p>
                  </div>
                </div>
              </div>
            )}

            {/* Auto Response Display */}
            {autoResponse && (
              <div className="mb-4 p-4 bg-green-900/50 border border-green-500/50 rounded">
                <div className="flex justify-between items-center mb-2">
                  <h4 className="text-green-200 font-medium">AI Generated Response</h4>
                  <button
                    onClick={() => setAutoResponse('')}
                    className="text-green-400 hover:text-green-300 text-sm"
                  >
                    ✕
                  </button>
                </div>
                <div className="text-green-100 text-sm leading-relaxed">
                  {autoResponse}
                </div>
                <div className="mt-2 text-xs text-green-300">
                  💡 Read this response during your interview
                </div>
              </div>
            )}

            {/* Messages */}
            <div className="flex-1 bg-gray-800 rounded p-4 overflow-y-auto mb-4">
              {conversationHistory.length === 0 ? (
                <div className="text-gray-400 text-center mt-8">
                  Start by asking an interview question or enable speech recognition to listen to the interviewer...
                </div>
              ) : (
                <div className="space-y-4">
                  {conversationHistory.map((message, index) => (
                    <div
                      key={index}
                      className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[80%] p-3 rounded-lg ${
                          message.role === 'user'
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-700 text-white'
                        }`}
                      >
                        <div className="text-sm">{message.content}</div>
                        <div className="text-xs opacity-70 mt-1">
                          {formatTimestamp(message.timestamp)}
                        </div>
                      </div>
                    </div>
                  ))}
                  {isProcessing && (
                    <div className="flex justify-start">
                      <div className="bg-gray-700 text-white p-3 rounded-lg">
                        <div className="flex items-center gap-2">
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                          Processing...
                        </div>
                      </div>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </div>

            {/* Input */}
            <div className="flex gap-2">
              <input
                type="text"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleAskQuestion()}
                placeholder="Ask an interview question..."
                disabled={isProcessing || !hasResume}
                className="flex-1 bg-gray-800 text-white p-3 rounded border border-gray-700 disabled:opacity-50"
              />
              <button
                onClick={handleAskQuestion}
                disabled={isProcessing || !hasResume || !question.trim()}
                className="bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white px-6 py-3 rounded transition-colors"
              >
                Ask
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default InterviewMode; 