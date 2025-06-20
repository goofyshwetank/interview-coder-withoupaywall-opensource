import React, { useState, useEffect, useRef } from 'react';
import { useToast } from '../../contexts/toast';

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
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadResumeData();
    loadConversationHistory();
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [conversationHistory]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
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

  const formatTimestamp = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-gray-900 rounded-lg p-6 w-full max-w-4xl h-[80vh] flex flex-col">
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
              {conversationHistory.length > 0 && (
                <button
                  onClick={handleClearHistory}
                  className="text-red-400 hover:text-red-300 text-sm transition-colors"
                >
                  Clear History
                </button>
              )}
            </div>

            {/* Messages */}
            <div className="flex-1 bg-gray-800 rounded p-4 overflow-y-auto mb-4">
              {conversationHistory.length === 0 ? (
                <div className="text-gray-400 text-center mt-8">
                  Start by asking an interview question...
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