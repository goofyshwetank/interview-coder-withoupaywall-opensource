// SpeechRecognitionService.ts
class SpeechRecognitionService {
  private recognition: any = null;
  private isListening = false;
  private retryCount = 0;
  private maxRetries = 3;
  private fallbackRecognition: any = null;

  constructor() {
    this.initializeRecognition();
  }

  private initializeRecognition() {
    // Check if Web Speech API is available
    const windowAny = window as any;
    if (!windowAny.webkitSpeechRecognition && !windowAny.SpeechRecognition) {
      console.error("Speech recognition not supported in this environment");
      return;
    }

    // Try multiple speech recognition implementations
    try {
      // Primary: Standard SpeechRecognition
      if (windowAny.SpeechRecognition) {
        this.recognition = new windowAny.SpeechRecognition();
        console.log("Using standard SpeechRecognition API");
      }
      // Fallback: Webkit SpeechRecognition
      else if (windowAny.webkitSpeechRecognition) {
        this.recognition = new windowAny.webkitSpeechRecognition();
        console.log("Using webkit SpeechRecognition API");
      }

      // Configure for optimal interview listening
      this.recognition.continuous = true;
      this.recognition.interimResults = true;
      this.recognition.lang = 'en-US';
      this.recognition.maxAlternatives = 1;
      
      // Add additional configuration for better compatibility
      if (this.recognition.grammars) {
        this.recognition.grammars = null; // Disable grammars for better compatibility
      }
      
      // Set up event handlers
      this.recognition.onstart = () => {
        this.isListening = true;
        this.retryCount = 0; // Reset retry count on successful start
        window.electronAPI.speechStatusFromRenderer("Listening to interviewer...");
        console.log("Speech recognition started successfully");
      };

      this.recognition.onresult = (event: any) => {
        let finalTranscript = '';
        let interimTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += transcript;
          } else {
            interimTranscript += transcript;
          }
        }

        // Send interim results for real-time feedback
        if (interimTranscript) {
          window.electronAPI.speechResultFromRenderer(interimTranscript, false);
        }

        // Process final results
        if (finalTranscript) {
          window.electronAPI.speechResultFromRenderer(finalTranscript, true);
        }
      };

      this.recognition.onerror = (event: any) => {
        this.isListening = false;
        let error = event.error || 'Unknown speech recognition error';
        
        // Handle specific error types
        switch (event.error) {
          case 'network':
            error = 'Network error: Speech recognition service unavailable. This may be due to browser security policies or service restrictions. Try using manual input instead.';
            break;
          case 'not-allowed':
            error = 'Microphone access denied. Please allow microphone permissions in your browser.';
            break;
          case 'no-speech':
            error = 'No speech detected. Please try speaking again.';
            break;
          case 'audio-capture':
            error = 'Audio capture error: Please check your microphone settings.';
            break;
          case 'service-not-allowed':
            error = 'Speech recognition service not allowed. Please check your browser settings or try manual input.';
            break;
          case 'bad-grammar':
            error = 'Grammar error in speech recognition.';
            break;
          case 'language-not-supported':
            error = 'Language not supported. Please use English.';
            break;
          default:
            error = `Speech recognition error: ${event.error}. Try using manual input as an alternative.`;
        }

        window.electronAPI.speechErrorFromRenderer(error);
        console.error("Speech recognition error:", event.error, error);

        // Auto-retry for network errors with exponential backoff
        if (event.error === 'network' && this.retryCount < this.maxRetries) {
          this.retryCount++;
          const delay = Math.pow(2, this.retryCount) * 1000; // Exponential backoff: 2s, 4s, 8s
          console.log(`Retrying speech recognition (attempt ${this.retryCount}/${this.maxRetries}) in ${delay}ms...`);
          setTimeout(() => {
            if (this.recognition) {
              try {
                this.recognition.start();
              } catch (retryError) {
                console.error("Retry failed:", retryError);
                if (this.retryCount >= this.maxRetries) {
                  window.electronAPI.speechErrorFromRenderer("Speech recognition failed after multiple attempts. Please use manual input instead.");
                }
              }
            }
          }, delay);
        } else if (this.retryCount >= this.maxRetries) {
          window.electronAPI.speechErrorFromRenderer("Speech recognition unavailable. Please use the manual input option for typing questions.");
        }
      };

      this.recognition.onend = () => {
        this.isListening = false;
        window.electronAPI.speechStatusFromRenderer("Speech recognition stopped");
        console.log("Speech recognition ended");
      };

    } catch (initError) {
      console.error("Failed to initialize speech recognition:", initError);
      window.electronAPI.speechErrorFromRenderer("Failed to initialize speech recognition. Please use manual input instead.");
    }
  }

  public async start() {
    if (!this.recognition) {
      console.error("Speech recognition not initialized");
      window.electronAPI.speechErrorFromRenderer("Speech recognition not supported in this browser. Please use manual input instead.");
      return false;
    }

    if (this.isListening) {
      console.log("Speech recognition already active");
      return false;
    }

    // Check microphone permissions first
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        } 
      });
      stream.getTracks().forEach(track => track.stop()); // Stop the test stream
      console.log("Microphone permissions granted");
    } catch (permissionError) {
      console.error("Microphone permission denied:", permissionError);
      window.electronAPI.speechErrorFromRenderer("Microphone access denied. Please allow microphone permissions in your browser settings or use manual input.");
      return false;
    }

    // Test internet connectivity
    try {
      const response = await fetch('https://www.google.com', { 
        method: 'HEAD',
        mode: 'no-cors',
        cache: 'no-cache'
      });
      console.log("Internet connectivity confirmed");
    } catch (networkError) {
      console.warn("Internet connectivity test failed:", networkError);
      window.electronAPI.speechStatusFromRenderer("Warning: Internet connectivity issues detected. Speech recognition may not work properly.");
    }

    try {
      this.recognition.start();
      return true;
    } catch (error) {
      console.error("Error starting speech recognition:", error);
      window.electronAPI.speechErrorFromRenderer("Failed to start speech recognition. Please use manual input instead.");
      return false;
    }
  }

  public stop() {
    if (!this.recognition || !this.isListening) {
      console.log("Speech recognition not active");
      return false;
    }

    try {
      this.recognition.stop();
      return true;
    } catch (error) {
      console.error("Error stopping speech recognition:", error);
      return false;
    }
  }

  public isActive() {
    return this.isListening;
  }

  public getStatus() {
    if (!this.recognition) {
      return "Speech recognition not supported";
    }
    if (this.isListening) {
      return "Listening...";
    }
    return "Ready";
  }

  public getDiagnostics() {
    const windowAny = window as any;
    const electronVersion = process.versions?.electron || 'Unknown';
    const chromeVersion = process.versions?.chrome || 'Unknown';
    const nodeVersion = process.versions?.node || 'Unknown';
    
    return {
      hasSpeechRecognition: !!windowAny.SpeechRecognition,
      hasWebkitSpeechRecognition: !!windowAny.webkitSpeechRecognition,
      userAgent: navigator.userAgent,
      isSecureContext: window.isSecureContext,
      hasMicrophone: 'mediaDevices' in navigator,
      isOnline: navigator.onLine,
      electronVersion,
      chromeVersion,
      nodeVersion,
      isElectron: !!(window && window.process && window.process.type),
      platform: navigator.platform,
      language: navigator.language
    };
  }

  public getAlternativeSolutions() {
    const diagnostics = this.getDiagnostics();
    const solutions = [];

    if (!diagnostics.hasSpeechRecognition && !diagnostics.hasWebkitSpeechRecognition) {
      solutions.push({
        type: 'warning',
        title: 'Speech Recognition Not Supported',
        description: 'Your browser/Electron version doesn\'t support the Web Speech API.',
        actions: [
          'Use the Manual Input option (most reliable)',
          'Try updating your Electron version',
          'Use a different browser for speech recognition',
          'Consider using external speech-to-text services'
        ]
      });
    }

    if (!diagnostics.isSecureContext) {
      solutions.push({
        type: 'error',
        title: 'Secure Context Required',
        description: 'Speech recognition requires HTTPS or localhost.',
        actions: [
          'Run the app on localhost (http://localhost)',
          'Use HTTPS if deploying to a server',
          'Use Manual Input as alternative'
        ]
      });
    }

    if (!diagnostics.hasMicrophone) {
      solutions.push({
        type: 'error',
        title: 'Microphone Access Not Available',
        description: 'Your system doesn\'t support microphone access.',
        actions: [
          'Check microphone hardware',
          'Update audio drivers',
          'Use Manual Input instead'
        ]
      });
    }

    if (!diagnostics.isOnline) {
      solutions.push({
        type: 'warning',
        title: 'Offline Mode',
        description: 'Speech recognition requires internet connection.',
        actions: [
          'Check your internet connection',
          'Use Manual Input (works offline)',
          'Try again when online'
        ]
      });
    }

    return solutions;
  }
}

export const speechRecognitionService = new SpeechRecognitionService(); 