// GoogleSpeechService.ts
class GoogleSpeechService {
  private apiKey: string = '';
  private isListening: boolean = false;
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private stream: MediaStream | null = null;

  constructor() {
    this.loadApiKey();
  }

  private loadApiKey() {
    // This will be set via IPC from the main process
    this.apiKey = '';
  }

  public setApiKey(apiKey: string) {
    this.apiKey = apiKey;
  }

  public async start(): Promise<boolean> {
    if (this.isListening) {
      console.log("Google Speech service already listening");
      return false;
    }

    if (!this.apiKey) {
      console.error("Google Speech API key not configured");
      window.electronAPI.speechErrorFromRenderer("Google Speech API key not configured. Please add your API key in settings.");
      return false;
    }

    try {
      // Get microphone access
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 16000
        }
      });

      // Create MediaRecorder
      this.mediaRecorder = new MediaRecorder(this.stream, {
        mimeType: 'audio/webm;codecs=opus'
      });

      this.audioChunks = [];
      this.isListening = true;

      // Set up event handlers
      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };

      this.mediaRecorder.onstop = async () => {
        if (this.audioChunks.length > 0) {
          await this.processAudio();
        }
      };

      // Start recording
      this.mediaRecorder.start(1000); // Record in 1-second chunks
      window.electronAPI.speechStatusFromRenderer("Listening with Google Speech API...");
      console.log("Google Speech service started");

      return true;
    } catch (error) {
      console.error("Error starting Google Speech service:", error);
      window.electronAPI.speechErrorFromRenderer("Failed to start Google Speech service. Please check microphone permissions.");
      return false;
    }
  }

  public stop(): boolean {
    if (!this.isListening || !this.mediaRecorder) {
      return false;
    }

    try {
      this.mediaRecorder.stop();
      this.isListening = false;
      
      // Stop all tracks
      if (this.stream) {
        this.stream.getTracks().forEach(track => track.stop());
        this.stream = null;
      }

      window.electronAPI.speechStatusFromRenderer("Google Speech service stopped");
      console.log("Google Speech service stopped");
      return true;
    } catch (error) {
      console.error("Error stopping Google Speech service:", error);
      return false;
    }
  }

  private async processAudio(): Promise<void> {
    try {
      // Create audio blob
      const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
      this.audioChunks = [];

      // Convert to base64
      const base64Audio = await this.blobToBase64(audioBlob);
      
      // Send to Google Speech API
      const transcript = await this.sendToGoogleSpeechAPI(base64Audio);
      
      if (transcript) {
        window.electronAPI.speechResultFromRenderer(transcript, true);
      }
    } catch (error) {
      console.error("Error processing audio:", error);
      window.electronAPI.speechErrorFromRenderer("Failed to process audio with Google Speech API.");
    }
  }

  private blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        // Remove data URL prefix
        const base64 = result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  private async sendToGoogleSpeechAPI(base64Audio: string): Promise<string> {
    try {
      const response = await fetch(`https://speech.googleapis.com/v1/speech:recognize?key=${this.apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          config: {
            encoding: 'WEBM_OPUS',
            sampleRateHertz: 16000,
            languageCode: 'en-US',
            enableAutomaticPunctuation: true,
            enableWordTimeOffsets: false,
            enableWordConfidence: false,
            model: 'latest_long',
            useEnhanced: true
          },
          audio: {
            content: base64Audio
          }
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Google Speech API error: ${errorData.error?.message || response.statusText}`);
      }

      const data = await response.json();
      
      if (data.results && data.results.length > 0) {
        const transcript = data.results
          .map((result: any) => result.alternatives[0].transcript)
          .join(' ');
        return transcript;
      }

      return '';
    } catch (error) {
      console.error("Google Speech API error:", error);
      throw error;
    }
  }

  public isActive(): boolean {
    return this.isListening;
  }

  public getStatus(): string {
    if (!this.apiKey) {
      return "Google Speech API key not configured";
    }
    if (this.isListening) {
      return "Listening with Google Speech API...";
    }
    return "Google Speech API Ready";
  }
}

export const googleSpeechService = new GoogleSpeechService(); 