// ipcHandlers.ts

import { ipcMain, shell, dialog } from "electron"
import { randomBytes } from "crypto"
import { IIpcHandlerDeps } from "./main"
import { configHelper } from "./ConfigHelper"

export function initializeIpcHandlers(deps: IIpcHandlerDeps): void {
  console.log("Initializing IPC handlers")

  // Configuration handlers
  ipcMain.handle("get-config", () => {
    return configHelper.loadConfig();
  })

  ipcMain.handle("update-config", (_event, updates) => {
    return configHelper.updateConfig(updates);
  })

  ipcMain.handle("check-api-key", () => {
    return configHelper.hasApiKey();
  })
  
  ipcMain.handle("validate-api-key", async (_event, apiKey) => {
    // First check the format
    if (!configHelper.isValidApiKeyFormat(apiKey)) {
      return { 
        valid: false, 
        error: "Invalid API key format. OpenAI API keys start with 'sk-'" 
      };
    }
    
    // Then test the API key with OpenAI
    const result = await configHelper.testApiKey(apiKey);
    return result;
  })

  // Credits handlers
  ipcMain.handle("set-initial-credits", async (_event, credits: number) => {
    const mainWindow = deps.getMainWindow()
    if (!mainWindow) return

    try {
      // Set the credits in a way that ensures atomicity
      await mainWindow.webContents.executeJavaScript(
        `window.__CREDITS__ = ${credits}`
      )
      mainWindow.webContents.send("credits-updated", credits)
    } catch (error) {
      console.error("Error setting initial credits:", error)
      throw error
    }
  })

  ipcMain.handle("decrement-credits", async () => {
    const mainWindow = deps.getMainWindow()
    if (!mainWindow) return

    try {
      const currentCredits = await mainWindow.webContents.executeJavaScript(
        "window.__CREDITS__"
      )
      if (currentCredits > 0) {
        const newCredits = currentCredits - 1
        await mainWindow.webContents.executeJavaScript(
          `window.__CREDITS__ = ${newCredits}`
        )
        mainWindow.webContents.send("credits-updated", newCredits)
      }
    } catch (error) {
      console.error("Error decrementing credits:", error)
    }
  })

  // Screenshot queue handlers
  ipcMain.handle("get-screenshot-queue", () => {
    return deps.getScreenshotQueue()
  })

  ipcMain.handle("get-extra-screenshot-queue", () => {
    return deps.getExtraScreenshotQueue()
  })

  ipcMain.handle("delete-screenshot", async (event, path: string) => {
    return deps.deleteScreenshot(path)
  })

  ipcMain.handle("get-image-preview", async (event, path: string) => {
    return deps.getImagePreview(path)
  })

  // Screenshot processing handlers
  ipcMain.handle("process-screenshots", async () => {
    // Check for API key before processing
    if (!configHelper.hasApiKey()) {
      const mainWindow = deps.getMainWindow();
      if (mainWindow) {
        mainWindow.webContents.send(deps.PROCESSING_EVENTS.API_KEY_INVALID);
      }
      return;
    }
    
    await deps.processingHelper?.processScreenshots()
  })

  // Window dimension handlers
  ipcMain.handle(
    "update-content-dimensions",
    async (event, { width, height }: { width: number; height: number }) => {
      if (width && height) {
        deps.setWindowDimensions(width, height)
      }
    }
  )

  ipcMain.handle(
    "set-window-dimensions",
    (event, width: number, height: number) => {
      deps.setWindowDimensions(width, height)
    }
  )

  // Screenshot management handlers
  ipcMain.handle("get-screenshots", async () => {
    try {
      let previews = []
      const currentView = deps.getView()

      if (currentView === "queue") {
        const queue = deps.getScreenshotQueue()
        previews = await Promise.all(
          queue.map(async (path) => ({
            path,
            preview: await deps.getImagePreview(path)
          }))
        )
      } else {
        const extraQueue = deps.getExtraScreenshotQueue()
        previews = await Promise.all(
          extraQueue.map(async (path) => ({
            path,
            preview: await deps.getImagePreview(path)
          }))
        )
      }

      return previews
    } catch (error) {
      console.error("Error getting screenshots:", error)
      throw error
    }
  })

  // Screenshot trigger handlers
  ipcMain.handle("trigger-screenshot", async () => {
    const mainWindow = deps.getMainWindow()
    if (mainWindow) {
      try {
        const screenshotPath = await deps.takeScreenshot()
        const preview = await deps.getImagePreview(screenshotPath)
        mainWindow.webContents.send("screenshot-taken", {
          path: screenshotPath,
          preview
        })
        return { success: true }
      } catch (error) {
        console.error("Error triggering screenshot:", error)
        return { error: "Failed to trigger screenshot" }
      }
    }
    return { error: "No main window available" }
  })

  ipcMain.handle("take-screenshot", async () => {
    try {
      const screenshotPath = await deps.takeScreenshot()
      const preview = await deps.getImagePreview(screenshotPath)
      return { path: screenshotPath, preview }
    } catch (error) {
      console.error("Error taking screenshot:", error)
      return { error: "Failed to take screenshot" }
    }
  })

  // Auth-related handlers removed

  ipcMain.handle("open-external-url", (event, url: string) => {
    shell.openExternal(url)
  })
  
  // Open external URL handler
  ipcMain.handle("openLink", (event, url: string) => {
    try {
      console.log(`Opening external URL: ${url}`);
      shell.openExternal(url);
      return { success: true };
    } catch (error) {
      console.error(`Error opening URL ${url}:`, error);
      return { success: false, error: `Failed to open URL: ${error}` };
    }
  })

  // Settings portal handler
  ipcMain.handle("open-settings-portal", () => {
    const mainWindow = deps.getMainWindow();
    if (mainWindow) {
      mainWindow.webContents.send("show-settings-dialog");
      return { success: true };
    }
    return { success: false, error: "Main window not available" };
  })

  // Window management handlers
  ipcMain.handle("toggle-window", () => {
    try {
      deps.toggleMainWindow()
      return { success: true }
    } catch (error) {
      console.error("Error toggling window:", error)
      return { error: "Failed to toggle window" }
    }
  })

  ipcMain.handle("reset-queues", async () => {
    try {
      deps.clearQueues()
      return { success: true }
    } catch (error) {
      console.error("Error resetting queues:", error)
      return { error: "Failed to reset queues" }
    }
  })

  // Process screenshot handlers
  ipcMain.handle("trigger-process-screenshots", async () => {
    try {
      // Check for API key before processing
      if (!configHelper.hasApiKey()) {
        const mainWindow = deps.getMainWindow();
        if (mainWindow) {
          mainWindow.webContents.send(deps.PROCESSING_EVENTS.API_KEY_INVALID);
        }
        return { success: false, error: "API key required" };
      }
      
      await deps.processingHelper?.processScreenshots()
      return { success: true }
    } catch (error) {
      console.error("Error processing screenshots:", error)
      return { error: "Failed to process screenshots" }
    }
  })

  // Reset handlers
  ipcMain.handle("trigger-reset", () => {
    try {
      // First cancel any ongoing requests
      deps.processingHelper?.cancelOngoingRequests()

      // Clear all queues immediately
      deps.clearQueues()

      // Reset view to queue
      deps.setView("queue")

      // Get main window and send reset events
      const mainWindow = deps.getMainWindow()
      if (mainWindow && !mainWindow.isDestroyed()) {
        // Send reset events in sequence
        mainWindow.webContents.send("reset-view")
        mainWindow.webContents.send("reset")
      }

      return { success: true }
    } catch (error) {
      console.error("Error triggering reset:", error)
      return { error: "Failed to trigger reset" }
    }
  })

  // Window movement handlers
  ipcMain.handle("trigger-move-left", () => {
    try {
      deps.moveWindowLeft()
      return { success: true }
    } catch (error) {
      console.error("Error moving window left:", error)
      return { error: "Failed to move window left" }
    }
  })

  ipcMain.handle("trigger-move-right", () => {
    try {
      deps.moveWindowRight()
      return { success: true }
    } catch (error) {
      console.error("Error moving window right:", error)
      return { error: "Failed to move window right" }
    }
  })

  ipcMain.handle("trigger-move-up", () => {
    try {
      deps.moveWindowUp()
      return { success: true }
    } catch (error) {
      console.error("Error moving window up:", error)
      return { error: "Failed to move window up" }
    }
  })

  ipcMain.handle("trigger-move-down", () => {
    try {
      deps.moveWindowDown()
      return { success: true }
    } catch (error) {
      console.error("Error moving window down:", error)
      return { error: "Failed to move window down" }
    }
  })
  
  // Delete last screenshot handler
  ipcMain.handle("delete-last-screenshot", async () => {
    try {
      const queue = deps.getView() === "queue" 
        ? deps.getScreenshotQueue() 
        : deps.getExtraScreenshotQueue()
      
      if (queue.length === 0) {
        return { success: false, error: "No screenshots to delete" }
      }
      
      // Get the last screenshot in the queue
      const lastScreenshot = queue[queue.length - 1]
      
      // Delete it
      const result = await deps.deleteScreenshot(lastScreenshot)
      
      // Notify the renderer about the change
      const mainWindow = deps.getMainWindow()
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("screenshot-deleted", { path: lastScreenshot })
      }
      
      return result
    } catch (error) {
      console.error("Error deleting last screenshot:", error)
      return { success: false, error: "Failed to delete last screenshot" }
    }
  })

  // Click-through functionality handlers
  let clickThroughDebounceTimer: NodeJS.Timeout | null = null;
  
  ipcMain.handle("toggle-click-through", () => {
    try {
      // Clear any existing timer
      if (clickThroughDebounceTimer) {
        clearTimeout(clickThroughDebounceTimer);
      }
      
      // Debounce the toggle to prevent rapid changes
      clickThroughDebounceTimer = setTimeout(() => {
        const currentSetting = configHelper.getClickThrough()
        const newSetting = !currentSetting
        configHelper.setClickThrough(newSetting)
        
        const mainWindow = deps.getMainWindow()
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.setIgnoreMouseEvents(newSetting, { forward: true })
          mainWindow.webContents.send("click-through-changed", newSetting)
        }
        
        console.log(`Click-through ${newSetting ? 'enabled' : 'disabled'}`)
      }, 100); // 100ms debounce
      
      return { success: true }
    } catch (error) {
      console.error("Error toggling click-through:", error)
      return { success: false, error: "Failed to toggle click-through" }
    }
  })

  ipcMain.handle("get-click-through", () => {
    try {
      return { success: true, clickThrough: configHelper.getClickThrough() }
    } catch (error) {
      console.error("Error getting click-through setting:", error)
      return { success: false, error: "Failed to get click-through setting" }
    }
  })

  ipcMain.handle("set-click-through", (event, enabled: boolean) => {
    try {
      // Clear any existing timer
      if (clickThroughDebounceTimer) {
        clearTimeout(clickThroughDebounceTimer);
      }
      
      // Debounce the setting to prevent rapid changes
      clickThroughDebounceTimer = setTimeout(() => {
        configHelper.setClickThrough(enabled)
        
        const mainWindow = deps.getMainWindow()
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.setIgnoreMouseEvents(enabled, { forward: true })
          mainWindow.webContents.send("click-through-changed", enabled)
        }
      }, 100); // 100ms debounce
      
      return { success: true, clickThrough: enabled }
    } catch (error) {
      console.error("Error setting click-through:", error)
      return { success: false, error: "Failed to set click-through" }
    }
  })

  // Cleanup function to clear timers
  const cleanup = () => {
    if (clickThroughDebounceTimer) {
      clearTimeout(clickThroughDebounceTimer);
      clickThroughDebounceTimer = null;
    }
  };

  // Register cleanup on app exit
  process.on('exit', cleanup);
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  // Resume and Interview Mode handlers
  ipcMain.handle("upload-resume", async (event, resumeText: string) => {
    try {
      configHelper.setResumeData(resumeText);
      return { success: true, message: "Resume uploaded successfully" };
    } catch (error) {
      console.error("Error uploading resume:", error);
      return { success: false, error: "Failed to upload resume" };
    }
  })

  ipcMain.handle("get-resume-data", () => {
    try {
      return { success: true, data: configHelper.getResumeData() };
    } catch (error) {
      console.error("Error getting resume data:", error);
      return { success: false, error: "Failed to get resume data" };
    }
  })

  ipcMain.handle("set-interview-mode", (event, enabled: boolean) => {
    try {
      configHelper.setInterviewMode(enabled);
      return { success: true };
    } catch (error) {
      console.error("Error setting interview mode:", error);
      return { success: false, error: "Failed to set interview mode" };
    }
  })

  ipcMain.handle("get-interview-mode", () => {
    try {
      return { success: true, enabled: configHelper.getInterviewMode() };
    } catch (error) {
      console.error("Error getting interview mode:", error);
      return { success: false, error: "Failed to get interview mode" };
    }
  })

  ipcMain.handle("add-conversation-message", (event, role: string, content: string) => {
    try {
      configHelper.addToConversationHistory(role, content);
      return { success: true };
    } catch (error) {
      console.error("Error adding conversation message:", error);
      return { success: false, error: "Failed to add message" };
    }
  })

  ipcMain.handle("get-conversation-history", () => {
    try {
      return { success: true, history: configHelper.getConversationHistory() };
    } catch (error) {
      console.error("Error getting conversation history:", error);
      return { success: false, error: "Failed to get conversation history" };
    }
  })

  ipcMain.handle("clear-conversation-history", () => {
    try {
      configHelper.clearConversationHistory();
      return { success: true };
    } catch (error) {
      console.error("Error clearing conversation history:", error);
      return { success: false, error: "Failed to clear conversation history" };
    }
  })

  ipcMain.handle("process-interview-question", async (event, question: string) => {
    try {
      if (!deps.processingHelper) {
        return { success: false, error: "Processing helper not available" };
      }

      const resumeData = configHelper.getResumeData();
      if (!resumeData) {
        return { success: false, error: "No resume data available. Please upload your resume first." };
      }

      // Add the question to conversation history
      configHelper.addToConversationHistory("user", question);

      // Process the question with resume context
      const result = await deps.processingHelper.processInterviewQuestion(question, resumeData);
      
      if (result.success) {
        // Add the response to conversation history
        configHelper.addToConversationHistory("assistant", result.data);
      }

      return result;
    } catch (error) {
      console.error("Error processing interview question:", error);
      return { success: false, error: "Failed to process interview question" };
    }
  })

  // Speech Recognition handlers
  let speechRecognition: any = null;
  let isListening = false;

  ipcMain.handle("start-speech-recognition", async (event) => {
    try {
      const mainWindow = deps.getMainWindow();
      if (!mainWindow) {
        return { success: false, error: "Main window not available" };
      }

      if (isListening) {
        return { success: false, error: "Speech recognition already active" };
      }

      // Send message to renderer to start speech recognition
      mainWindow.webContents.send("start-speech-recognition-renderer");
      isListening = true;
      
      return { success: true };
    } catch (error) {
      console.error("Error starting speech recognition:", error);
      return { success: false, error: "Failed to start speech recognition" };
    }
  });

  ipcMain.handle("stop-speech-recognition", async () => {
    try {
      const mainWindow = deps.getMainWindow();
      if (!mainWindow) {
        return { success: false, error: "Main window not found" };
      }

      // Stop Web Speech API
      mainWindow.webContents.send("stop-speech-recognition-renderer");
      
      // Also stop Google Speech service if it's active
      mainWindow.webContents.send("stop-google-speech-renderer");

      return { success: true };
    } catch (error) {
      console.error("Error stopping speech recognition:", error);
      return { success: false, error: "Failed to stop speech recognition" };
    }
  });

  // Handle speech results from renderer
  ipcMain.handle("speech-result-from-renderer", async (event, data: { transcript: string, isFinal: boolean }) => {
    try {
      const mainWindow = deps.getMainWindow();
      if (!mainWindow) return;

      // Forward the speech result to the renderer
      mainWindow.webContents.send("speech-result", data);

      // If it's a final result, process it for interview response
      if (data.isFinal) {
        const resumeData = configHelper.getResumeData();
        if (resumeData && deps.processingHelper) {
          // Add the question to conversation history
          configHelper.addToConversationHistory("user", data.transcript);
          
          // Process the question with resume context
          const result = await deps.processingHelper.processInterviewQuestion(data.transcript, resumeData);
          
          if (result.success) {
            // Add the response to conversation history
            configHelper.addToConversationHistory("assistant", result.data);
            
            // Send the response back to the renderer
            mainWindow.webContents.send("interview-response-generated", {
              question: data.transcript,
              answer: result.data
            });
          }
        }
      }
    } catch (error) {
      console.error("Error processing speech result:", error);
    }
  });

  // Handle speech errors from renderer
  ipcMain.handle("speech-error-from-renderer", async (event, error: string) => {
    try {
      const mainWindow = deps.getMainWindow();
      if (!mainWindow) return;

      isListening = false;
      mainWindow.webContents.send("speech-error", error);
    } catch (error) {
      console.error("Error handling speech error:", error);
    }
  });

  // Handle speech status from renderer
  ipcMain.handle("speech-status-from-renderer", async (event, status: string) => {
    try {
      const mainWindow = deps.getMainWindow();
      if (!mainWindow) return;

      mainWindow.webContents.send("speech-status", status);
    } catch (error) {
      console.error("Error handling speech status:", error);
    }
  });

  // Google Speech API handlers
  ipcMain.handle("get-google-speech-api-key", () => {
    try {
      return { success: true, apiKey: configHelper.getGoogleSpeechApiKey() };
    } catch (error) {
      console.error("Error getting Google Speech API key:", error);
      return { success: false, error: "Failed to get Google Speech API key" };
    }
  });

  ipcMain.handle("set-google-speech-api-key", async (event, apiKey: string) => {
    try {
      if (!configHelper.isValidGoogleSpeechApiKey(apiKey)) {
        return { success: false, error: "Invalid Google Speech API key format" };
      }
      
      configHelper.setGoogleSpeechApiKey(apiKey);
      return { success: true };
    } catch (error) {
      console.error("Error setting Google Speech API key:", error);
      return { success: false, error: "Failed to set Google Speech API key" };
    }
  });

  ipcMain.handle("get-use-google-speech", () => {
    try {
      return { success: true, useGoogleSpeech: configHelper.getUseGoogleSpeech() };
    } catch (error) {
      console.error("Error getting Google Speech setting:", error);
      return { success: false, error: "Failed to get Google Speech setting" };
    }
  });

  ipcMain.handle("set-use-google-speech", async (event, useGoogleSpeech: boolean) => {
    try {
      configHelper.setUseGoogleSpeech(useGoogleSpeech);
      return { success: true };
    } catch (error) {
      console.error("Error setting Google Speech setting:", error);
      return { success: false, error: "Failed to set Google Speech setting" };
    }
  });

  ipcMain.handle("test-google-speech-api-key", async (event, apiKey: string) => {
    try {
      if (!configHelper.isValidGoogleSpeechApiKey(apiKey)) {
        return { success: false, error: "Invalid API key format" };
      }

      // Test the API key with a simple request
      const response = await fetch(`https://speech.googleapis.com/v1/speech:recognize?key=${apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          config: {
            encoding: 'WEBM_OPUS',
            sampleRateHertz: 16000,
            languageCode: 'en-US',
          },
          audio: {
            content: '' // Empty audio for testing
          }
        })
      });

      if (response.status === 400) {
        // 400 is expected for empty audio, means API key is valid
        return { success: true, message: "API key is valid" };
      } else if (response.status === 401) {
        return { success: false, error: "Invalid API key" };
      } else if (response.status === 403) {
        return { success: false, error: "API key doesn't have Speech-to-Text permissions" };
      } else {
        return { success: false, error: `API test failed with status: ${response.status}` };
      }
    } catch (error) {
      console.error("Error testing Google Speech API key:", error);
      return { success: false, error: "Failed to test API key" };
    }
  });
}
