console.log("Preload script starting...")
import { contextBridge, ipcRenderer } from "electron"
const { shell } = require("electron")

export const PROCESSING_EVENTS = {
  //global states
  UNAUTHORIZED: "procesing-unauthorized",
  NO_SCREENSHOTS: "processing-no-screenshots",
  OUT_OF_CREDITS: "out-of-credits",
  API_KEY_INVALID: "api-key-invalid",

  //states for generating the initial solution
  INITIAL_START: "initial-start",
  PROBLEM_EXTRACTED: "problem-extracted",
  SOLUTION_SUCCESS: "solution-success",
  INITIAL_SOLUTION_ERROR: "solution-error",
  RESET: "reset",

  //states for processing the debugging
  DEBUG_START: "debug-start",
  DEBUG_SUCCESS: "debug-success",
  DEBUG_ERROR: "debug-error"
} as const

// At the top of the file
console.log("Preload script is running")

const electronAPI = {
  // Original methods
  openSubscriptionPortal: async (authData: { id: string; email: string }) => {
    return ipcRenderer.invoke("open-subscription-portal", authData)
  },
  openSettingsPortal: () => ipcRenderer.invoke("open-settings-portal"),
  updateContentDimensions: (dimensions: { width: number; height: number }) =>
    ipcRenderer.invoke("update-content-dimensions", dimensions),
  clearStore: () => ipcRenderer.invoke("clear-store"),
  getScreenshots: () => ipcRenderer.invoke("get-screenshots"),
  deleteScreenshot: (path: string) =>
    ipcRenderer.invoke("delete-screenshot", path),
  toggleMainWindow: async () => {
    console.log("toggleMainWindow called from preload")
    try {
      const result = await ipcRenderer.invoke("toggle-window")
      console.log("toggle-window result:", result)
      return result
    } catch (error) {
      console.error("Error in toggleMainWindow:", error)
      throw error
    }
  },
  // Event listeners
  onScreenshotTaken: (
    callback: (data: { path: string; preview: string }) => void
  ) => {
    const subscription = (_: any, data: { path: string; preview: string }) =>
      callback(data)
    ipcRenderer.on("screenshot-taken", subscription)
    return () => {
      ipcRenderer.removeListener("screenshot-taken", subscription)
    }
  },
  onResetView: (callback: () => void) => {
    const subscription = () => callback()
    ipcRenderer.on("reset-view", subscription)
    return () => {
      ipcRenderer.removeListener("reset-view", subscription)
    }
  },
  onSolutionStart: (callback: () => void) => {
    const subscription = () => callback()
    ipcRenderer.on(PROCESSING_EVENTS.INITIAL_START, subscription)
    return () => {
      ipcRenderer.removeListener(PROCESSING_EVENTS.INITIAL_START, subscription)
    }
  },
  onDebugStart: (callback: () => void) => {
    const subscription = () => callback()
    ipcRenderer.on(PROCESSING_EVENTS.DEBUG_START, subscription)
    return () => {
      ipcRenderer.removeListener(PROCESSING_EVENTS.DEBUG_START, subscription)
    }
  },
  onDebugSuccess: (callback: (data: any) => void) => {
    ipcRenderer.on("debug-success", (_event, data) => callback(data))
    return () => {
      ipcRenderer.removeListener("debug-success", (_event, data) =>
        callback(data)
      )
    }
  },
  onDebugError: (callback: (error: string) => void) => {
    const subscription = (_: any, error: string) => callback(error)
    ipcRenderer.on(PROCESSING_EVENTS.DEBUG_ERROR, subscription)
    return () => {
      ipcRenderer.removeListener(PROCESSING_EVENTS.DEBUG_ERROR, subscription)
    }
  },
  onSolutionError: (callback: (error: string) => void) => {
    const subscription = (_: any, error: string) => callback(error)
    ipcRenderer.on(PROCESSING_EVENTS.INITIAL_SOLUTION_ERROR, subscription)
    return () => {
      ipcRenderer.removeListener(
        PROCESSING_EVENTS.INITIAL_SOLUTION_ERROR,
        subscription
      )
    }
  },
  onProcessingNoScreenshots: (callback: () => void) => {
    const subscription = () => callback()
    ipcRenderer.on(PROCESSING_EVENTS.NO_SCREENSHOTS, subscription)
    return () => {
      ipcRenderer.removeListener(PROCESSING_EVENTS.NO_SCREENSHOTS, subscription)
    }
  },
  onOutOfCredits: (callback: () => void) => {
    const subscription = () => callback()
    ipcRenderer.on(PROCESSING_EVENTS.OUT_OF_CREDITS, subscription)
    return () => {
      ipcRenderer.removeListener(PROCESSING_EVENTS.OUT_OF_CREDITS, subscription)
    }
  },
  onProblemExtracted: (callback: (data: any) => void) => {
    const subscription = (_: any, data: any) => callback(data)
    ipcRenderer.on(PROCESSING_EVENTS.PROBLEM_EXTRACTED, subscription)
    return () => {
      ipcRenderer.removeListener(
        PROCESSING_EVENTS.PROBLEM_EXTRACTED,
        subscription
      )
    }
  },
  onSolutionSuccess: (callback: (data: any) => void) => {
    const subscription = (_: any, data: any) => callback(data)
    ipcRenderer.on(PROCESSING_EVENTS.SOLUTION_SUCCESS, subscription)
    return () => {
      ipcRenderer.removeListener(
        PROCESSING_EVENTS.SOLUTION_SUCCESS,
        subscription
      )
    }
  },
  onUnauthorized: (callback: () => void) => {
    const subscription = () => callback()
    ipcRenderer.on(PROCESSING_EVENTS.UNAUTHORIZED, subscription)
    return () => {
      ipcRenderer.removeListener(PROCESSING_EVENTS.UNAUTHORIZED, subscription)
    }
  },
  // External URL handler
  openLink: (url: string) => shell.openExternal(url),
  triggerScreenshot: () => ipcRenderer.invoke("trigger-screenshot"),
  triggerProcessScreenshots: () =>
    ipcRenderer.invoke("trigger-process-screenshots"),
  triggerDirectMode: () =>
    ipcRenderer.invoke("trigger-direct-mode"),
  triggerReset: () => ipcRenderer.invoke("trigger-reset"),
  triggerMoveLeft: () => ipcRenderer.invoke("trigger-move-left"),
  triggerMoveRight: () => ipcRenderer.invoke("trigger-move-right"),
  triggerMoveUp: () => ipcRenderer.invoke("trigger-move-up"),
  triggerMoveDown: () => ipcRenderer.invoke("trigger-move-down"),
  onSubscriptionUpdated: (callback: () => void) => {
    const subscription = () => callback()
    ipcRenderer.on("subscription-updated", subscription)
    return () => {
      ipcRenderer.removeListener("subscription-updated", subscription)
    }
  },
  onSubscriptionPortalClosed: (callback: () => void) => {
    const subscription = () => callback()
    ipcRenderer.on("subscription-portal-closed", subscription)
    return () => {
      ipcRenderer.removeListener("subscription-portal-closed", subscription)
    }
  },
  onReset: (callback: () => void) => {
    const subscription = () => callback()
    ipcRenderer.on(PROCESSING_EVENTS.RESET, subscription)
    return () => {
      ipcRenderer.removeListener(PROCESSING_EVENTS.RESET, subscription)
    }
  },
  startUpdate: () => ipcRenderer.invoke("start-update"),
  installUpdate: () => ipcRenderer.invoke("install-update"),
  onUpdateAvailable: (callback: (info: any) => void) => {
    const subscription = (_: any, info: any) => callback(info)
    ipcRenderer.on("update-available", subscription)
    return () => {
      ipcRenderer.removeListener("update-available", subscription)
    }
  },
  onUpdateDownloaded: (callback: (info: any) => void) => {
    const subscription = (_: any, info: any) => callback(info)
    ipcRenderer.on("update-downloaded", subscription)
    return () => {
      ipcRenderer.removeListener("update-downloaded", subscription)
    }
  },
  decrementCredits: () => ipcRenderer.invoke("decrement-credits"),
  onCreditsUpdated: (callback: (credits: number) => void) => {
    const subscription = (_event: any, credits: number) => callback(credits)
    ipcRenderer.on("credits-updated", subscription)
    return () => {
      ipcRenderer.removeListener("credits-updated", subscription)
    }
  },
  onOpenInterviewMode: (callback: () => void) => {
    const subscription = () => callback()
    ipcRenderer.on("open-interview-mode", subscription)
    return () => {
      ipcRenderer.removeListener("open-interview-mode", subscription)
    }
  },
  getPlatform: () => process.platform,
  
  // New methods for OpenAI API integration
  getConfig: () => ipcRenderer.invoke("get-config"),
  updateConfig: (config: { apiKey?: string; model?: string; language?: string; opacity?: number }) => 
    ipcRenderer.invoke("update-config", config),
  onShowSettings: (callback: () => void) => {
    const subscription = () => callback()
    ipcRenderer.on("show-settings-dialog", subscription)
    return () => {
      ipcRenderer.removeListener("show-settings-dialog", subscription)
    }
  },
  checkApiKey: () => ipcRenderer.invoke("check-api-key"),
  validateApiKey: (apiKey: string) => 
    ipcRenderer.invoke("validate-api-key", apiKey),
  openExternal: (url: string) => 
    ipcRenderer.invoke("openExternal", url),
  onApiKeyInvalid: (callback: () => void) => {
    const subscription = () => callback()
    ipcRenderer.on(PROCESSING_EVENTS.API_KEY_INVALID, subscription)
    return () => {
      ipcRenderer.removeListener(PROCESSING_EVENTS.API_KEY_INVALID, subscription)
    }
  },
  removeListener: (eventName: string, callback: (...args: any[]) => void) => {
    ipcRenderer.removeListener(eventName, callback)
  },
  onDeleteLastScreenshot: (callback: () => void) => {
    const subscription = () => callback()
    ipcRenderer.on("delete-last-screenshot", subscription)
    return () => {
      ipcRenderer.removeListener("delete-last-screenshot", subscription)
    }
  },
  deleteLastScreenshot: () => ipcRenderer.invoke("delete-last-screenshot"),
  
  // Click-through functionality
  toggleClickThrough: () => ipcRenderer.invoke("toggle-click-through"),
  getClickThrough: () => ipcRenderer.invoke("get-click-through"),
  setClickThrough: (enabled: boolean) => ipcRenderer.invoke("set-click-through", enabled),
  onClickThroughChanged: (callback: (enabled: boolean) => void) => {
    const subscription = (_: any, enabled: boolean) => callback(enabled)
    ipcRenderer.on("click-through-changed", subscription)
    return () => {
      ipcRenderer.removeListener("click-through-changed", subscription)
    }
  },
  // Resume and Interview Mode API
  uploadResume: (resumeText: string) => ipcRenderer.invoke("upload-resume", resumeText),
  getResumeData: () => ipcRenderer.invoke("get-resume-data"),
  setInterviewMode: (enabled: boolean) => ipcRenderer.invoke("set-interview-mode", enabled),
  getInterviewMode: () => ipcRenderer.invoke("get-interview-mode"),
  addConversationMessage: (role: string, content: string) => ipcRenderer.invoke("add-conversation-message", role, content),
  getConversationHistory: () => ipcRenderer.invoke("get-conversation-history"),
  clearConversationHistory: () => ipcRenderer.invoke("clear-conversation-history"),
  processInterviewQuestion: (question: string) => ipcRenderer.invoke("process-interview-question", question),
  
  // Real-time Speech Recognition API
  startSpeechRecognition: () => ipcRenderer.invoke("start-speech-recognition"),
  stopSpeechRecognition: () => ipcRenderer.invoke("stop-speech-recognition"),
  onSpeechResult: (callback: (transcript: string, isFinal: boolean) => void) => {
    const subscription = (_: any, data: { transcript: string, isFinal: boolean }) => callback(data.transcript, data.isFinal)
    ipcRenderer.on("speech-result", subscription)
    return () => {
      ipcRenderer.removeListener("speech-result", subscription)
    }
  },
  onSpeechError: (callback: (error: string) => void) => {
    const subscription = (_: any, error: string) => callback(error)
    ipcRenderer.on("speech-error", subscription)
    return () => {
      ipcRenderer.removeListener("speech-error", subscription)
    }
  },
  onSpeechStatus: (callback: (status: string) => void) => {
    const subscription = (_: any, status: string) => callback(status)
    ipcRenderer.on("speech-status", subscription)
    return () => {
      ipcRenderer.removeListener("speech-status", subscription)
    }
  },
  onInterviewResponseGenerated: (callback: (data: { question: string, answer: string }) => void) => {
    const subscription = (_: any, data: { question: string, answer: string }) => callback(data)
    ipcRenderer.on("interview-response-generated", subscription)
    return () => {
      ipcRenderer.removeListener("interview-response-generated", subscription)
    }
  },
  onToggleSpeechRecognition: (callback: () => void) => {
    const subscription = () => callback()
    ipcRenderer.on("toggle-speech-recognition", subscription)
    return () => {
      ipcRenderer.removeListener("toggle-speech-recognition", subscription)
    }
  },
  // Speech recognition communication from renderer to main
  speechResultFromRenderer: (transcript: string, isFinal: boolean) => 
    ipcRenderer.invoke("speech-result-from-renderer", { transcript, isFinal }),
  speechErrorFromRenderer: (error: string) => 
    ipcRenderer.invoke("speech-error-from-renderer", error),
  speechStatusFromRenderer: (status: string) => 
    ipcRenderer.invoke("speech-status-from-renderer", status),
  // Speech recognition control from main to renderer
  onStartSpeechRecognitionRenderer: (callback: () => void) => {
    const subscription = () => callback()
    ipcRenderer.on("start-speech-recognition-renderer", subscription)
    return () => {
      ipcRenderer.removeListener("start-speech-recognition-renderer", subscription)
    }
  },
  onStopSpeechRecognitionRenderer: (callback: () => void) => {
    const subscription = () => callback()
    ipcRenderer.on("stop-speech-recognition-renderer", subscription)
    return () => {
      ipcRenderer.removeListener("stop-speech-recognition-renderer", subscription)
    }
  },
  onStopGoogleSpeechRenderer: (callback: () => void) => {
    const subscription = () => callback()
    ipcRenderer.on("stop-google-speech-renderer", subscription)
    return () => {
      ipcRenderer.removeListener("stop-google-speech-renderer", subscription)
    }
  },
  // Google Speech API methods
  getGoogleSpeechApiKey: () => ipcRenderer.invoke("get-google-speech-api-key"),
  setGoogleSpeechApiKey: (apiKey: string) => ipcRenderer.invoke("set-google-speech-api-key", apiKey),
  getUseGoogleSpeech: () => ipcRenderer.invoke("get-use-google-speech"),
  setUseGoogleSpeech: (useGoogleSpeech: boolean) => ipcRenderer.invoke("set-use-google-speech", useGoogleSpeech),
  testGoogleSpeechApiKey: (apiKey: string) => ipcRenderer.invoke("test-google-speech-api-key", apiKey),
  // Settings and configuration
  onConfigRestored: (callback: (data: { message: string; backupPath: string }) => void) => {
    const wrappedCallback = (_event: any, data: { message: string; backupPath: string }) => callback(data);
    ipcRenderer.on('config-restored', wrappedCallback);
    return () => ipcRenderer.removeListener('config-restored', wrappedCallback);
  },
  
  // System Audio Capture and AI Response methods
  getSystemAudioStream: () => ipcRenderer.invoke("get-system-audio-stream"),
  onAiResponse: (callback: (response: string) => void) => {
    const subscription = (_: any, response: string) => callback(response)
    ipcRenderer.on("ai-response", subscription)
    return () => {
      ipcRenderer.removeListener("ai-response", subscription)
    }
  },
  aiResponseFromRenderer: (response: string) => 
    ipcRenderer.invoke("ai-response-from-renderer", response),
}

// Before exposing the API
console.log(
  "About to expose electronAPI with methods:",
  Object.keys(electronAPI)
)

// Expose the API
contextBridge.exposeInMainWorld("electronAPI", electronAPI)

console.log("electronAPI exposed to window")

// Add this focus restoration handler
ipcRenderer.on("restore-focus", () => {
  // Try to focus the active element if it exists
  const activeElement = document.activeElement as HTMLElement
  if (activeElement && typeof activeElement.focus === "function") {
    activeElement.focus()
  }
})

// Remove auth-callback handling - no longer needed
