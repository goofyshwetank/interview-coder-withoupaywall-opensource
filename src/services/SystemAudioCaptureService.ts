// SystemAudioCaptureService.ts
class SystemAudioCaptureService {
  private isCapturing = false;
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private stream: MediaStream | null = null;
  private transcriptionInterval: number | null = null;
  private geminiApiKey: string = '';
  private audioContext: AudioContext | null = null;
  private processor: AudioWorkletNode | null = null;
  private isTranscribing = false;
  private lastTranscriptionTime = 0;
  private transcriptionQueue: Blob[] = [];
  private isProcessingQueue = false;

  constructor() {
    this.loadGeminiKey();
  }

  private loadGeminiKey() {
    // Load Gemini API key from config
    this.geminiApiKey = '';
  }

  public setGeminiApiKey(apiKey: string) {
    this.geminiApiKey = apiKey;
  }

  public async startSystemAudioCapture(): Promise<boolean> {
    if (this.isCapturing) {
      console.log("System audio capture already active");
      return false;
    }

    try {
      // Try multiple methods to capture system audio
      const stream = await this.getSystemAudioStream();
      if (!stream) {
        throw new Error("Failed to get system audio stream");
      }

      this.stream = stream;
      this.setupAudioProcessing();
      this.startTranscription();
      
      this.isCapturing = true;
      window.electronAPI.speechStatusFromRenderer("Listening to system audio...");
      console.log("System audio capture started successfully");
      
      return true;
    } catch (error) {
      console.error("Error starting system audio capture:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      window.electronAPI.speechErrorFromRenderer("Failed to start system audio capture: " + errorMessage);
      return false;
    }
  }

  private async getSystemAudioStream(): Promise<MediaStream | null> {
    // Try different methods based on platform
    
    // Method 1: Try getDisplayMedia with audio (Chrome on some platforms)
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: false,
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          sampleRate: 16000,
          channelCount: 1
        }
      });
      
      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length > 0) {
        console.log("Using getDisplayMedia for system audio capture");
        return stream;
      }
    } catch (error) {
      console.log("getDisplayMedia audio not available:", error);
    }

    // Method 2: Try to find a monitor/loopback device
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const monitorDevice = devices.find(device => 
        device.kind === 'audioinput' && 
        (device.label.toLowerCase().includes('monitor') || 
         device.label.toLowerCase().includes('loopback') ||
         device.label.toLowerCase().includes('stereo mix') ||
         device.label.toLowerCase().includes('what') ||
         device.label.toLowerCase().includes('virtmic') ||
         device.label.toLowerCase().includes('virtual'))
      );

      if (monitorDevice) {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            deviceId: { exact: monitorDevice.deviceId },
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
            sampleRate: 16000,
            channelCount: 1
          }
        });
        console.log("Using monitor device for system audio capture:", monitorDevice.label);
        return stream;
      }
    } catch (error) {
      console.log("Monitor device not available:", error);
    }

    // Method 3: Use Electron's desktopCapturer (if available)
    try {
      if (window.electronAPI && window.electronAPI.getSystemAudioStream) {
        const stream = await window.electronAPI.getSystemAudioStream();
        if (stream) {
          console.log("Using Electron desktopCapturer for system audio");
          return stream;
        }
      }
    } catch (error) {
      console.log("Electron system audio capture not available:", error);
    }

    // Method 4: Create virtual microphone hint for user
    this.showVirtualMicrophoneInstructions();
    
    return null;
  }

  private showVirtualMicrophoneInstructions() {
    const instructions = `
System audio capture requires setup:

For Linux:
1. Install pulseaudio-utils: sudo apt install pulseaudio-utils
2. Run: pactl load-module module-remap-source master=@DEFAULT_MONITOR@ source_name=virtmic source_properties=device.description=Virtual_Microphone
3. Refresh this page and grant microphone access

For Windows:
1. Enable "Stereo Mix" in Recording Devices
2. Or use VB-Audio Virtual Cable (free)

For macOS:
1. Install BlackHole or SoundFlower (free)
2. Route system audio through virtual device
    `;
    
    window.electronAPI.speechErrorFromRenderer(instructions);
  }

  private setupAudioProcessing() {
    if (!this.stream) return;

    // Set up MediaRecorder for audio chunks
    this.mediaRecorder = new MediaRecorder(this.stream, {
      mimeType: 'audio/webm;codecs=opus',
      audioBitsPerSecond: 64000
    });

    this.audioChunks = [];

    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        this.audioChunks.push(event.data);
        this.transcriptionQueue.push(event.data);
        this.processTranscriptionQueue();
      }
    };

    this.mediaRecorder.onstop = () => {
      console.log("Audio recording stopped");
    };

    // Start recording in chunks for real-time processing
    this.mediaRecorder.start(2000); // 2-second chunks
  }

  private startTranscription() {
    this.isTranscribing = true;
    this.lastTranscriptionTime = Date.now();
  }

  private async processTranscriptionQueue() {
    if (this.isProcessingQueue || this.transcriptionQueue.length === 0) {
      return;
    }

    this.isProcessingQueue = true;

    try {
      // Process chunks in batches
      const chunksToProcess = this.transcriptionQueue.splice(0, 3); // Process up to 3 chunks at once
      
      if (chunksToProcess.length > 0) {
        const combinedBlob = new Blob(chunksToProcess, { type: 'audio/webm' });
        await this.transcribeAudio(combinedBlob);
      }
    } catch (error) {
      console.error("Error processing transcription queue:", error);
    }

    this.isProcessingQueue = false;

    // Process next batch if queue has items
    if (this.transcriptionQueue.length > 0) {
      setTimeout(() => this.processTranscriptionQueue(), 500);
    }
  }

  private async transcribeAudio(audioBlob: Blob): Promise<void> {
    try {
      // Use free transcription service (Web Speech API as fallback)
      const transcript = await this.transcribeWithWebSpeech(audioBlob);
      
      if (transcript && transcript.trim()) {
        console.log("Transcribed:", transcript);
        
        // Generate AI response
        const response = await this.generateJobApplicantResponse(transcript);
        
        // Send results to renderer
        window.electronAPI.speechResultFromRenderer(transcript, true);
        window.electronAPI.aiResponseFromRenderer(response);
      }
    } catch (error) {
      console.error("Error transcribing audio:", error);
    }
  }

  private async transcribeWithWebSpeech(audioBlob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      // Convert blob to audio URL and use Web Speech API
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      
      // Create a speech recognition instance
      const recognition = new (window as any).webkitSpeechRecognition() || new (window as any).SpeechRecognition();
      
      if (!recognition) {
        reject(new Error("Speech recognition not available"));
        return;
      }

      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'en-US';

      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        resolve(transcript);
        URL.revokeObjectURL(audioUrl);
      };

      recognition.onerror = (event: any) => {
        reject(new Error(event.error));
        URL.revokeObjectURL(audioUrl);
      };

      recognition.onend = () => {
        URL.revokeObjectURL(audioUrl);
      };

      // Play audio and start recognition
      audio.play();
      recognition.start();
    });
  }

  private async generateJobApplicantResponse(transcript: string): Promise<string> {
    try {
      if (!this.geminiApiKey) {
        return "Please configure Gemini API key in settings to get AI responses.";
      }

      // Use Gemini API for generating responses
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${this.geminiApiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `You are a job applicant in a technical interview. The interviewer just said: "${transcript}". Please provide a professional, confident, and relevant response as a job applicant. Keep it concise and demonstrate your technical knowledge and enthusiasm for the role.`
            }]
          }],
          generationConfig: {
            temperature: 0.7,
            topK: 40,
            topP: 0.95,
            maxOutputTokens: 200,
          }
        })
      });

      if (!response.ok) {
        throw new Error(`Gemini API error: ${response.statusText}`);
      }

      const data = await response.json();
      
      if (data.candidates && data.candidates.length > 0) {
        return data.candidates[0].content.parts[0].text;
      } else {
        return "I appreciate your question. Could you please elaborate on that?";
      }
    } catch (error) {
      console.error("Error generating AI response:", error);
      return "Thank you for that question. I'm excited to discuss this further.";
    }
  }

  public stop(): boolean {
    if (!this.isCapturing) {
      console.log("System audio capture not active");
      return false;
    }

    try {
      if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
        this.mediaRecorder.stop();
      }

      if (this.stream) {
        this.stream.getTracks().forEach(track => track.stop());
        this.stream = null;
      }

      if (this.audioContext) {
        this.audioContext.close();
        this.audioContext = null;
      }

      if (this.transcriptionInterval) {
        clearInterval(this.transcriptionInterval);
        this.transcriptionInterval = null;
      }

      this.isCapturing = false;
      this.isTranscribing = false;
      this.audioChunks = [];
      this.transcriptionQueue = [];

      window.electronAPI.speechStatusFromRenderer("System audio capture stopped");
      console.log("System audio capture stopped");
      return true;
    } catch (error) {
      console.error("Error stopping system audio capture:", error);
      return false;
    }
  }

  public isActive(): boolean {
    return this.isCapturing;
  }

  public getStatus(): string {
    if (!this.geminiApiKey) {
      return "Gemini API key not configured";
    }
    if (this.isCapturing) {
      return "Capturing system audio...";
    }
    return "System audio capture ready";
  }

  public async testSystemAudio(): Promise<boolean> {
    try {
      const stream = await this.getSystemAudioStream();
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
        return true;
      }
      return false;
    } catch (error) {
      console.error("System audio test failed:", error);
      return false;
    }
  }

  public getDiagnostics() {
    const hasGetDisplayMedia = 'getDisplayMedia' in navigator.mediaDevices;
    const hasGetUserMedia = 'getUserMedia' in navigator.mediaDevices;
    const hasWebAudio = 'AudioContext' in window || 'webkitAudioContext' in window;
    const hasMediaRecorder = 'MediaRecorder' in window;
    const hasSpeechRecognition = 'SpeechRecognition' in window || 'webkitSpeechRecognition' in window;

    return {
      hasGetDisplayMedia,
      hasGetUserMedia,
      hasWebAudio,
      hasMediaRecorder,
      hasSpeechRecognition,
      platform: navigator.platform,
      userAgent: navigator.userAgent,
      isOnline: navigator.onLine,
      hasGeminiKey: !!this.geminiApiKey
    };
  }
}

export const systemAudioCaptureService = new SystemAudioCaptureService();