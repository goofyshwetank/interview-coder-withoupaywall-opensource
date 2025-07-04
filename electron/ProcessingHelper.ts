// ProcessingHelper.ts
import fs from "node:fs"
import path from "node:path"
import { ScreenshotHelper } from "./ScreenshotHelper"
import { IProcessingHelperDeps } from "./main"
import * as axios from "axios"
import { app, BrowserWindow, dialog } from "electron"
import { OpenAI } from "openai"
import { configHelper } from "./ConfigHelper"
import Anthropic from '@anthropic-ai/sdk';

// Interface for Gemini API requests
interface GeminiMessage {
  role: string;
  parts: Array<{
    text?: string;
    inlineData?: {
      mimeType: string;
      data: string;
    }
  }>;
}

interface GeminiResponse {
  candidates: Array<{
    content: {
      parts: Array<{
        text: string;
      }>;
    };
    finishReason: string;
  }>;
}
interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: Array<{
    type: 'text' | 'image';
    text?: string;
    source?: {
      type: 'base64';
      media_type: string;
      data: string;
    };
  }>;
}
export class ProcessingHelper {
  private deps: IProcessingHelperDeps
  private screenshotHelper: ScreenshotHelper
  private openaiClient: OpenAI | null = null
  private geminiApiKey: string | null = null
  private anthropicClient: Anthropic | null = null

  // AbortControllers for API requests
  private currentProcessingAbortController: AbortController | null = null
  private currentExtraProcessingAbortController: AbortController | null = null

  constructor(deps: IProcessingHelperDeps) {
    this.deps = deps
    this.screenshotHelper = deps.getScreenshotHelper()
    
    // Initialize AI client based on config
    this.initializeAIClient();
    
    // Listen for config changes to re-initialize the AI client
    configHelper.on('config-updated', () => {
      this.initializeAIClient();
    });
  }
  
  /**
   * Initialize or reinitialize the AI client with current config
   */
  private initializeAIClient(): void {
    try {
      const config = configHelper.loadConfig();
      
      if (config.apiProvider === "openai") {
        if (config.apiKey) {
          this.openaiClient = new OpenAI({ 
            apiKey: config.apiKey,
            timeout: 60000, // 60 second timeout
            maxRetries: 2   // Retry up to 2 times
          });
          this.geminiApiKey = null;
          this.anthropicClient = null;
          console.log("OpenAI client initialized successfully");
        } else {
          this.openaiClient = null;
          this.geminiApiKey = null;
          this.anthropicClient = null;
          console.warn("No API key available, OpenAI client not initialized");
        }
      } else if (config.apiProvider === "gemini"){
        // Gemini client initialization
        this.openaiClient = null;
        this.anthropicClient = null;
        if (config.apiKey) {
          this.geminiApiKey = config.apiKey;
          console.log("Gemini API key set successfully");
        } else {
          this.openaiClient = null;
          this.geminiApiKey = null;
          this.anthropicClient = null;
          console.warn("No API key available, Gemini client not initialized");
        }
      } else if (config.apiProvider === "anthropic") {
        // Reset other clients
        this.openaiClient = null;
        this.geminiApiKey = null;
        if (config.apiKey) {
          this.anthropicClient = new Anthropic({
            apiKey: config.apiKey,
            timeout: 60000,
            maxRetries: 2
          });
          console.log("Anthropic client initialized successfully");
        } else {
          this.openaiClient = null;
          this.geminiApiKey = null;
          this.anthropicClient = null;
          console.warn("No API key available, Anthropic client not initialized");
        }
      }
    } catch (error) {
      console.error("Failed to initialize AI client:", error);
      this.openaiClient = null;
      this.geminiApiKey = null;
      this.anthropicClient = null;
    }
  }

  private async waitForInitialization(
    mainWindow: BrowserWindow
  ): Promise<void> {
    let attempts = 0
    const maxAttempts = 50 // 5 seconds total

    while (attempts < maxAttempts) {
      const isInitialized = await mainWindow.webContents.executeJavaScript(
        "window.__IS_INITIALIZED__"
      )
      if (isInitialized) return
      await new Promise((resolve) => setTimeout(resolve, 100))
      attempts++
    }
    throw new Error("App failed to initialize after 5 seconds")
  }

  private async getCredits(): Promise<number> {
    const mainWindow = this.deps.getMainWindow()
    if (!mainWindow) return 999 // Unlimited credits in this version

    try {
      await this.waitForInitialization(mainWindow)
      return 999 // Always return sufficient credits to work
    } catch (error) {
      console.error("Error getting credits:", error)
      return 999 // Unlimited credits as fallback
    }
  }

  private async getLanguage(): Promise<string> {
    try {
      // Get language from config
      const config = configHelper.loadConfig();
      if (config.language) {
        return config.language;
      }
      
      // Fallback to window variable if config doesn't have language
      const mainWindow = this.deps.getMainWindow()
      if (mainWindow) {
        try {
          await this.waitForInitialization(mainWindow)
          const language = await mainWindow.webContents.executeJavaScript(
            "window.__LANGUAGE__"
          )

          if (
            typeof language === "string" &&
            language !== undefined &&
            language !== null
          ) {
            return language;
          }
        } catch (err) {
          console.warn("Could not get language from window", err);
        }
      }
      
      // Default fallback
      return "python";
    } catch (error) {
      console.error("Error getting language:", error)
      return "python"
    }
  }

  public async processScreenshots(): Promise<void> {
    const mainWindow = this.deps.getMainWindow()
    if (!mainWindow) return

    const config = configHelper.loadConfig();
    
    // First verify we have a valid AI client
    if (config.apiProvider === "openai" && !this.openaiClient) {
      this.initializeAIClient();
      
      if (!this.openaiClient) {
        console.error("OpenAI client not initialized");
        mainWindow.webContents.send(
          this.deps.PROCESSING_EVENTS.API_KEY_INVALID
        );
        return;
      }
    } else if (config.apiProvider === "gemini" && !this.geminiApiKey) {
      this.initializeAIClient();
      
      if (!this.geminiApiKey) {
        console.error("Gemini API key not initialized");
        mainWindow.webContents.send(
          this.deps.PROCESSING_EVENTS.API_KEY_INVALID
        );
        return;
      }
    } else if (config.apiProvider === "anthropic" && !this.anthropicClient) {
      // Add check for Anthropic client
      this.initializeAIClient();
      
      if (!this.anthropicClient) {
        console.error("Anthropic client not initialized");
        mainWindow.webContents.send(
          this.deps.PROCESSING_EVENTS.API_KEY_INVALID
        );
        return;
      }
    }

    const view = this.deps.getView()
    console.log("Processing screenshots in view:", view)

    if (view === "queue") {
      mainWindow.webContents.send(this.deps.PROCESSING_EVENTS.INITIAL_START)
      const screenshotQueue = this.screenshotHelper.getScreenshotQueue()
      console.log("Processing main queue screenshots:", screenshotQueue)
      
      // Check if the queue is empty
      if (!screenshotQueue || screenshotQueue.length === 0) {
        console.log("No screenshots found in queue");
        mainWindow.webContents.send(this.deps.PROCESSING_EVENTS.NO_SCREENSHOTS);
        return;
      }

      // Check that files actually exist
      const existingScreenshots = screenshotQueue.filter(path => fs.existsSync(path));
      if (existingScreenshots.length === 0) {
        console.log("Screenshot files don't exist on disk");
        mainWindow.webContents.send(this.deps.PROCESSING_EVENTS.NO_SCREENSHOTS);
        return;
      }

      try {
        // Initialize AbortController
        this.currentProcessingAbortController = new AbortController()
        const { signal } = this.currentProcessingAbortController

        const screenshots = await Promise.all(
          existingScreenshots.map(async (path) => {
            try {
              return {
                path,
                preview: await this.screenshotHelper.getImagePreview(path),
                data: fs.readFileSync(path).toString('base64')
              };
            } catch (err) {
              console.error(`Error reading screenshot ${path}:`, err);
              return null;
            }
          })
        )

        // Filter out any nulls from failed screenshots
        const validScreenshots = screenshots.filter(Boolean);
        
        if (validScreenshots.length === 0) {
          throw new Error("Failed to load screenshot data");
        }
        
        // Notify user if some screenshots failed to load
        if (validScreenshots.length < existingScreenshots.length) {
          const failedCount = existingScreenshots.length - validScreenshots.length;
          console.warn(`${failedCount} screenshot(s) failed to load and will be skipped`);
          
          if (mainWindow) {
            mainWindow.webContents.send("processing-status", {
              message: `Warning: ${failedCount} screenshot(s) could not be read and will be skipped. Processing with ${validScreenshots.length} screenshot(s)...`,
              progress: 10
            });
          }
        }

        const result = await this.processScreenshotsHelper(validScreenshots, signal)

        if (!result.success) {
          console.log("Processing failed:", result.error)
          if (result.error?.includes("API Key") || result.error?.includes("OpenAI") || result.error?.includes("Gemini")) {
            mainWindow.webContents.send(
              this.deps.PROCESSING_EVENTS.API_KEY_INVALID
            )
          } else {
            mainWindow.webContents.send(
              this.deps.PROCESSING_EVENTS.INITIAL_SOLUTION_ERROR,
              result.error
            )
          }
          // Reset view back to queue on error
          console.log("Resetting view to queue due to error")
          this.deps.setView("queue")
          return
        }

        // Only set view to solutions if processing succeeded
        console.log("Setting view to solutions after successful processing")
        mainWindow.webContents.send(
          this.deps.PROCESSING_EVENTS.SOLUTION_SUCCESS,
          result.data
        )
        this.deps.setView("solutions")
      } catch (error: any) {
        mainWindow.webContents.send(
          this.deps.PROCESSING_EVENTS.INITIAL_SOLUTION_ERROR,
          error
        )
        console.error("Processing error:", error)
        if (axios.isCancel(error)) {
          mainWindow.webContents.send(
            this.deps.PROCESSING_EVENTS.INITIAL_SOLUTION_ERROR,
            "Processing was canceled by the user."
          )
        } else {
          mainWindow.webContents.send(
            this.deps.PROCESSING_EVENTS.INITIAL_SOLUTION_ERROR,
            error.message || "Server error. Please try again."
          )
        }
        // Reset view back to queue on error
        console.log("Resetting view to queue due to error")
        this.deps.setView("queue")
      } finally {
        this.currentProcessingAbortController = null
      }
    } else {
      // view == 'solutions'
      const extraScreenshotQueue =
        this.screenshotHelper.getExtraScreenshotQueue()
      console.log("Processing extra queue screenshots:", extraScreenshotQueue)
      
      // Check if the extra queue is empty
      if (!extraScreenshotQueue || extraScreenshotQueue.length === 0) {
        console.log("No extra screenshots found in queue");
        mainWindow.webContents.send(this.deps.PROCESSING_EVENTS.NO_SCREENSHOTS);
        
        return;
      }

      // Check that files actually exist
      const existingExtraScreenshots = extraScreenshotQueue.filter(path => fs.existsSync(path));
      if (existingExtraScreenshots.length === 0) {
        console.log("Extra screenshot files don't exist on disk");
        mainWindow.webContents.send(this.deps.PROCESSING_EVENTS.NO_SCREENSHOTS);
        return;
      }
      
      mainWindow.webContents.send(this.deps.PROCESSING_EVENTS.DEBUG_START)

      // Initialize AbortController
      this.currentExtraProcessingAbortController = new AbortController()
      const { signal } = this.currentExtraProcessingAbortController

      try {
        // Get all screenshots (both main and extra) for processing
        const allPaths = [
          ...this.screenshotHelper.getScreenshotQueue(),
          ...existingExtraScreenshots
        ];
        
        const screenshots = await Promise.all(
          allPaths.map(async (path) => {
            try {
              if (!fs.existsSync(path)) {
                console.warn(`Screenshot file does not exist: ${path}`);
                return null;
              }
              
              return {
                path,
                preview: await this.screenshotHelper.getImagePreview(path),
                data: fs.readFileSync(path).toString('base64')
              };
            } catch (err) {
              console.error(`Error reading screenshot ${path}:`, err);
              return null;
            }
          })
        )
        
        // Filter out any nulls from failed screenshots
        const validScreenshots = screenshots.filter(Boolean);
        
        if (validScreenshots.length === 0) {
          throw new Error("Failed to load screenshot data for debugging");
        }
        
        console.log(
          "Combined screenshots for processing:",
          validScreenshots.map((s) => s.path)
        )

        const result = await this.processExtraScreenshotsHelper(
          validScreenshots,
          signal
        )

        if (result.success) {
          this.deps.setHasDebugged(true)
          mainWindow.webContents.send(
            this.deps.PROCESSING_EVENTS.DEBUG_SUCCESS,
            result.data
          )
        } else {
          mainWindow.webContents.send(
            this.deps.PROCESSING_EVENTS.DEBUG_ERROR,
            result.error
          )
        }
      } catch (error: any) {
        if (axios.isCancel(error)) {
          mainWindow.webContents.send(
            this.deps.PROCESSING_EVENTS.DEBUG_ERROR,
            "Extra processing was canceled by the user."
          )
        } else {
          mainWindow.webContents.send(
            this.deps.PROCESSING_EVENTS.DEBUG_ERROR,
            error.message
          )
        }
      } finally {
        this.currentExtraProcessingAbortController = null
      }
    }
  }

  private async processScreenshotsHelper(
    screenshots: Array<{ path: string; data: string }>,
    signal: AbortSignal
  ) {
    try {
      const config = configHelper.loadConfig();
      const language = await this.getLanguage();
      const mainWindow = this.deps.getMainWindow();
      
      // Step 1: Extract problem info using AI Vision API (OpenAI or Gemini)
      const imageDataList = screenshots.map(screenshot => screenshot.data);
      
      // New extraction prompt (user-provided, with special notes)
      const extractionPrompt = `From this screenshot of a coding problem, extract a JSON object with the following keys. For the code_template, make sure to include any surrounding class or function structure visible, not just the function signature:

{
  "problem_title": "string",
  "description": "string",
  "input_format": "string",
  "expected_output": "string",
  "constraints": "string",
  "examples": [
    {
      "input": "string",
      "output": "string",
      "explanation": "string"
    }
  ],
  "hidden_details": "string",
  "code_template": {
    "language": "string",
    "signature": "string",
    "return_type": "string",
    "full_code_stub": "string",
    "description": "string"
  },
  "goal": "string"
}
Special Notes:
In code_template, extract:

signature: the function signature only (e.g. char kthCharacter(...))

return_type: return type of the function

full_code_stub: include full visible C++ class/function stub (like class Solution { ... })

description: what the function is expected to do

In goal, summarize the problem in one short sentence.

Format the output as a \`json ... \` block and nothing else.`;

      // Update the user on progress
      if (mainWindow) {
        mainWindow.webContents.send("processing-status", {
          message: "Analyzing problem from screenshots...",
          progress: 20
        });
      }

      let problemInfo;
      
      if (config.apiProvider === "openai") {
        // Verify OpenAI client
        if (!this.openaiClient) {
          this.initializeAIClient(); // Try to reinitialize
          
          if (!this.openaiClient) {
            return {
              success: false,
              error: "OpenAI API key not configured or invalid. Please check your settings."
            };
          }
        }

        // Use OpenAI for processing
        const messages = [
          {
            role: "system" as const, 
            content: "You are a coding challenge interpreter."
          },
          {
            role: "user" as const,
            content: [
              {
                type: "text" as const,
                text: extractionPrompt
              },
              ...imageDataList.map(data => ({
                type: "image_url" as const,
                image_url: { url: `data:image/png;base64,${data}` }
              }))
            ]
          }
        ];

        // Send to OpenAI Vision API
        const extractionResponse = await this.openaiClient.chat.completions.create({
          model: config.extractionModel || "gpt-4o",
          messages: messages,
          max_tokens: 4000,
          temperature: 0.2
        });

        // Parse the response
        try {
          const responseText = extractionResponse.choices[0].message.content;
          // Handle when OpenAI might wrap the JSON in markdown code blocks
          const jsonText = responseText.replace(/```json|```/g, '').trim();
          problemInfo = JSON.parse(jsonText);
        } catch (error) {
          console.error("Error parsing OpenAI response:", error);
          return {
            success: false,
            error: "Failed to parse problem information. Please try again or use clearer screenshots."
          };
        }
      } else if (config.apiProvider === "gemini")  {
        // Use Gemini API
        if (!this.geminiApiKey) {
          return {
            success: false,
            error: "Gemini API key not configured. Please check your settings."
          };
        }

        try {
          // Create Gemini message structure
          const geminiMessages: GeminiMessage[] = [
            {
              role: "user",
              parts: [
                { text: extractionPrompt },
                ...imageDataList.map(data => ({
                  inlineData: {
                    mimeType: "image/png",
                    data: data
                  }
                }))
              ]
            }
          ];

          // --- Gemini profiling start ---
          const t0 = Date.now();
          let response, t1;
          try {
            response = await axios.default.post(
              `https://generativelanguage.googleapis.com/v1beta/models/${config.extractionModel || "gemini-2.5-pro"}:generateContent?key=${this.geminiApiKey}`,
              {
                contents: geminiMessages,
                generationConfig: {
                  temperature: 0.2,
                  maxOutputTokens: 5000
                }
              },
              { signal, timeout: 60000 }
            );
            t1 = Date.now();
          } catch (err) {
            t1 = Date.now();
            if (t1 - t0 > 60000) {
              if (mainWindow) {
                mainWindow.webContents.send("processing-status", {
                  message: "Gemini timed out – try a shorter prompt, fewer screenshots, or switch to GPT-4o.",
                  progress: 0
                });
              }
              return { success: false, error: "Gemini timed out after 60 seconds. Try a shorter prompt, fewer screenshots, or switch to GPT-4o." };
            }
            throw err;
          }
          const usage = response.data?.usageMetadata ?? {};
          console.table({
            duration_ms: Math.round(t1 - t0),
            prompt: usage.promptTokenCount,
            candidates: usage.candidatesTokenCount,
            thoughts: usage.thoughtsTokenCount,
            total: usage.totalTokenCount
          });
          // --- Gemini profiling end ---

          const responseData = response.data as GeminiResponse;
          
          console.log("Gemini API response structure:", JSON.stringify(responseData, null, 2));
          
          if (!responseData.candidates || responseData.candidates.length === 0) {
            console.error("Gemini API returned empty candidates array");
            throw new Error("Empty response from Gemini API");
          }
          
          if (!responseData.candidates[0].content || 
              !responseData.candidates[0].content.parts || 
              responseData.candidates[0].content.parts.length === 0) {
            console.error("Gemini API response has invalid structure:", {
              hasContent: !!responseData.candidates[0].content,
              hasParts: !!(responseData.candidates[0].content?.parts),
              partsLength: responseData.candidates[0].content?.parts?.length || 0
            });
            throw new Error("Invalid response structure from Gemini API");
          }
          
          const responseText = responseData.candidates[0].content.parts[0].text;
          
          // Handle when Gemini might wrap the JSON in markdown code blocks
          const jsonText = responseText.replace(/```json|```/g, '').trim();
          problemInfo = JSON.parse(jsonText);
        } catch (error) {
          console.error("Error using Gemini API:", error);
          return {
            success: false,
            error: "Failed to process with Gemini API. Please check your API key or try again later."
          };
        }
      } else if (config.apiProvider === "anthropic") {
        if (!this.anthropicClient) {
          return {
            success: false,
            error: "Anthropic API key not configured. Please check your settings."
          };
        }

        try {
          const messages = [
            {
              role: "user" as const,
              content: [
                {
                  type: "text" as const,
                  text: `Extract the coding problem details from these screenshots. Return in JSON format with these fields: problem_statement, constraints, example_input, example_output. Preferred coding language is ${language}.`
                },
                ...imageDataList.map(data => ({
                  type: "image" as const,
                  source: {
                    type: "base64" as const,
                    media_type: "image/png" as const,
                    data: data
                  }
                }))
              ]
            }
          ];

          const response = await this.anthropicClient.messages.create({
            model: config.extractionModel || "claude-3-7-sonnet-20250219",
            max_tokens: 4000,
            messages: messages,
            temperature: 0.2
          });

          const responseText = (response.content[0] as { type: 'text', text: string }).text;
          const jsonText = responseText.replace(/```json|```/g, '').trim();
          problemInfo = JSON.parse(jsonText);
        } catch (error: any) {
          console.error("Error using Anthropic API:", error);
          
          if (error.response?.status === 413 || error.message?.includes('too large')) {
            return {
              success: false,
              error: "Your screenshots contain too much information for Claude to process. Try these solutions:\n\n1. Take fewer screenshots or smaller screenshots\n2. Crop screenshots to focus on the problem area\n3. Switch to OpenAI or Gemini models in Settings (they can handle larger inputs)\n4. Use text-based problem input if available"
            };
          }
          
          return {
            success: false,
            error: "Failed to process with Anthropic API. Please check your API key or try again later."
          };
        }
      }
      
      // Update the user on progress
      if (mainWindow) {
        mainWindow.webContents.send("processing-status", {
          message: "Problem analyzed successfully. Preparing to generate solution...",
          progress: 40
        });
      }

      // Store problem info in AppState
      this.deps.setProblemInfo(problemInfo);

      // Send first success event
      if (mainWindow) {
        mainWindow.webContents.send(
          this.deps.PROCESSING_EVENTS.PROBLEM_EXTRACTED,
          problemInfo
        );

        // Generate solutions after successful extraction
        const solutionsResult = await this.generateSolutionsHelper(signal);
        if (solutionsResult.success) {
          // Clear any existing extra screenshots before transitioning to solutions view
          this.screenshotHelper.clearExtraScreenshotQueue();
          
          // Final progress update
          mainWindow.webContents.send("processing-status", {
            message: "Solution generated successfully",
            progress: 100
          });
          
          mainWindow.webContents.send(
            this.deps.PROCESSING_EVENTS.SOLUTION_SUCCESS,
            solutionsResult.data
          );
          return { success: true, data: solutionsResult.data };
        } else {
          throw new Error(
            solutionsResult.error || "Failed to generate solutions"
          );
        }
      }

      return { success: false, error: "Failed to process screenshots" };
    } catch (error: any) {
      // If the request was cancelled, don't retry
      if (axios.isCancel(error)) {
        return {
          success: false,
          error: "Processing was canceled by the user."
        };
      }
      
      // Handle OpenAI API errors specifically
      if (error?.response?.status === 401) {
        return {
          success: false,
          error: "Invalid OpenAI API key. Please check your settings."
        };
      } else if (error?.response?.status === 429) {
        return {
          success: false,
          error: "OpenAI API rate limit exceeded or insufficient credits. Please try again later."
        };
      } else if (error?.response?.status === 500) {
        return {
          success: false,
          error: "OpenAI server error. Please try again later."
        };
      }

      console.error("API Error Details:", error);
      return { 
        success: false, 
        error: error.message || "Failed to process screenshots. Please try again." 
      };
    }
  }

  private async generateSolutionsHelper(signal: AbortSignal) {
    try {
      const problemInfo = this.deps.getProblemInfo();
      const language = await this.getLanguage();
      const config = configHelper.loadConfig();
      const mainWindow = this.deps.getMainWindow();

      if (!problemInfo) {
        throw new Error("No problem info available");
      }

      // Compose a solution prompt using the extracted stub and details
      const solutionPrompt = `Complete the following function/class stub to solve the problem described. Do not write a main() function or any includes. Only fill in the body of the provided stub.

Problem:
${problemInfo.description || problemInfo.problem_statement || ''}

Function/Class Stub:
${problemInfo.code_template?.full_code_stub || problemInfo.code_template?.signature || ''}

Constraints:
${problemInfo.constraints || ''}

Examples:
${Array.isArray(problemInfo.examples) ? problemInfo.examples.map((e: any) => `Input: ${e.input}\nOutput: ${e.output}\nExplanation: ${e.explanation}`).join('\n\n') : ''}

Respond with only the completed code in a single code block, nothing else.`;

      let responseContent;
      
      if (config.apiProvider === "openai") {
        // OpenAI processing
        if (!this.openaiClient) {
          return {
            success: false,
            error: "OpenAI API key not configured. Please check your settings."
          };
        }
        
        // Send to OpenAI API
        const solutionResponse = await this.openaiClient.chat.completions.create({
          model: config.solutionModel || "gpt-4o",
          messages: [
            { role: "system", content: "You are an expert coding interview assistant. Provide clear, optimal solutions with detailed explanations." },
            { role: "user", content: solutionPrompt }
          ],
          max_tokens: 4000,
          temperature: 0.2
        });

        responseContent = solutionResponse.choices[0].message.content;
      } else if (config.apiProvider === "gemini")  {
        // Gemini processing
        if (!this.geminiApiKey) {
          return {
            success: false,
            error: "Gemini API key not configured. Please check your settings."
          };
        }
        
        try {
          // Create Gemini message structure
          const geminiMessages = [
            {
              role: "user",
              parts: [
                {
                  text: solutionPrompt
                }
              ]
            }
          ];

          // --- Gemini profiling start ---
          const t0 = Date.now();
          let response, t1, retry = false;
          try {
            response = await axios.default.post(
              `https://generativelanguage.googleapis.com/v1beta/models/${config.solutionModel || "gemini-2.5-pro"}:generateContent?key=${this.geminiApiKey}`,
              {
                contents: geminiMessages,
                generationConfig: {
                  temperature: 0.2,
                  maxOutputTokens: 5000
                }
              },
              { signal, timeout: 60000 }
            );
            t1 = Date.now();
          } catch (err) {
            t1 = Date.now();
            // Retry on ECONNRESET/socket hang up with lower maxOutputTokens
            if (err.code === 'ECONNRESET' || (err.message && err.message.includes('socket hang up'))) {
              retry = true;
              try {
                response = await axios.default.post(
                  `https://generativelanguage.googleapis.com/v1beta/models/${config.solutionModel || "gemini-2.5-pro"}:generateContent?key=${this.geminiApiKey}`,
                  {
                    contents: geminiMessages,
                    generationConfig: {
                      temperature: 0.2,
                      maxOutputTokens: 2048
                    }
                  },
                  { signal, timeout: 60000 }
                );
                t1 = Date.now();
              } catch (err2) {
                t1 = Date.now();
                if (mainWindow) {
                  mainWindow.webContents.send("processing-status", {
                    message: "Gemini failed to generate a solution (network error). Try again, use a smaller prompt, or switch to GPT-4o.",
                    progress: 0
                  });
                }
                // Fallback to OpenAI if available
                if (String(config.apiProvider) !== 'openai' && this.openaiClient) {
                  try {
                    const openaiMessages = [
                      { role: "system", content: "You are an expert coding interview assistant. Provide only the code solution in a single code block, no explanation." },
                      { role: "user", content: solutionPrompt }
                    ] as any;
                    const openaiResponse = await this.openaiClient.chat.completions.create({
                      model: config.solutionModel || "gpt-4o",
                      messages: openaiMessages,
                      max_tokens: 2048,
                      temperature: 0.2
                    });
                    responseContent = openaiResponse.choices[0].message.content;
                    // Continue to parsing below
                  } catch (openaiErr) {
                    return { success: false, error: "Both Gemini and OpenAI failed to generate a solution. Please try again later." };
                  }
                } else {
                  return { success: false, error: "Gemini failed to generate a solution (network error). Try again, use a smaller prompt, or switch to GPT-4o." };
                }
              }
            } else if (t1 - t0 > 60000) {
              if (mainWindow) {
                mainWindow.webContents.send("processing-status", {
                  message: "Gemini timed out – try a shorter prompt, fewer screenshots, or switch to GPT-4o.",
                  progress: 0
                });
              }
              return { success: false, error: "Gemini timed out after 60 seconds. Try a shorter prompt, fewer screenshots, or switch to GPT-4o." };
            } else {
              throw err;
            }
          }
          if (!responseContent) {
            const usage = response.data?.usageMetadata ?? {};
            console.table({
              duration_ms: Math.round(t1 - t0),
              prompt: usage.promptTokenCount,
              candidates: usage.candidatesTokenCount,
              thoughts: usage.thoughtsTokenCount,
              total: usage.totalTokenCount
            });
          }
          // --- Gemini profiling end ---

          const responseData = response.data as GeminiResponse;
          
          console.log("Gemini solution API response structure:", JSON.stringify(responseData, null, 2));
          
          if (!responseData.candidates || responseData.candidates.length === 0) {
            console.error("Gemini API returned empty candidates array for solution generation");
            throw new Error("Empty response from Gemini API");
          }
          
          const candidate = responseData.candidates[0];
          console.log("First candidate structure:", JSON.stringify(candidate, null, 2));
          
          if (!candidate.content) {
            console.error("Gemini API candidate has no content field");
            throw new Error("Invalid response structure from Gemini API - no content");
          }
          
          if (
            (!candidate.content.parts || candidate.content.parts.length === 0) &&
            candidate.finishReason === "MAX_TOKENS"
          ) {
            console.error("Gemini API hit MAX_TOKENS and returned no parts");
            return {
              success: false,
              error: "Gemini could not generate a full solution due to token limits. Try reducing the number of screenshots, using a shorter prompt, or switching to a different model."
            };
          }
          
          if (!candidate.content.parts || candidate.content.parts.length === 0) {
            console.error("Gemini API candidate content has no parts or empty parts array");
            throw new Error("Invalid response structure from Gemini API - no parts");
          }
          
          const firstPart = candidate.content.parts[0];
          if (!firstPart.text) {
            console.error("Gemini API first part has no text field");
            throw new Error("Invalid response structure from Gemini API - no text in first part");
          }
          
          responseContent = firstPart.text;
          console.log("Successfully extracted response content from Gemini API");
        } catch (error) {
          console.error("Error using Gemini API for solution:", error);
          return {
            success: false,
            error: "Failed to generate solution with Gemini API. Please check your API key or try again later."
          };
        }
      } else if (config.apiProvider === "anthropic") {
        // Anthropic processing
        if (!this.anthropicClient) {
          return {
            success: false,
            error: "Anthropic API key not configured. Please check your settings."
          };
        }
        
        try {
          const messages = [
            {
              role: "user" as const,
              content: [
                {
                  type: "text" as const,
                  text: solutionPrompt
                }
              ]
            }
          ];

          // Send to Anthropic API
          const response = await this.anthropicClient.messages.create({
            model: config.solutionModel || "claude-3-7-sonnet-20250219",
            max_tokens: 4000,
            messages: messages,
            temperature: 0.2
          });

          responseContent = (response.content[0] as { type: 'text', text: string }).text;
        } catch (error: any) {
          console.error("Error using Anthropic API for solution:", error);

          // Add specific handling for Claude's limitations
          if (error.status === 429) {
            return {
              success: false,
              error: "Claude API rate limit exceeded. Please wait a few minutes before trying again."
            };
          } else if (error.status === 413 || (error.message && error.message.includes("token"))) {
            return {
              success: false,
              error: "Your screenshots contain too much information for Claude to process. Switch to OpenAI or Gemini in settings which can handle larger inputs."
            };
          }

          return {
            success: false,
            error: "Failed to generate solution with Anthropic API. Please check your API key or try again later."
          };
        }
      }
      
      // Extract parts from the response
      const codeMatch = responseContent.match(/```(?:\w+)?\s*([\s\S]*?)```/);
      let code = codeMatch ? codeMatch[1].trim() : "";

      // If no code blocks found, try to extract from direct text
      if (!code && (responseContent.includes('def ') || responseContent.includes('class ') || responseContent.includes('function '))) {
        // For direct mode, if no code blocks, the entire response might be code
        const lines = responseContent.split('\n');
        const codeLines = lines.filter(line => 
          !line.startsWith('**') && 
          !line.toLowerCase().includes('complexity') &&
          !line.toLowerCase().includes('thought')
        );
        if (codeLines.length > 0) {
          code = codeLines.join('\n').trim();
        }
      }

      // Extract thoughts, looking for bullet points or numbered lists
      const thoughtsRegex = /(?:Thoughts:|Key Insights:|Reasoning:|Approach:)([\s\S]*?)(?:Time complexity:|$)/i;
      const thoughtsMatch = responseContent.match(thoughtsRegex);
      let thoughts: string[] = [];
      
      if (thoughtsMatch && thoughtsMatch[1]) {
        // Extract bullet points or numbered items
        const bulletPoints = thoughtsMatch[1].match(/(?:^|\n)\s*(?:[-*•]|\d+\.)\s*(.*)/g);
        if (bulletPoints) {
          thoughts = bulletPoints.map(point => 
            point.replace(/^\s*(?:[-*•]|\d+\.)\s*/, '').trim()
          ).filter(Boolean);
        } else {
          // If no bullet points found, split by newlines and filter empty lines
          thoughts = thoughtsMatch[1].split('\n')
            .map((line) => line.trim())
            .filter(Boolean);
        }
      }
      
      // Extract complexity information
      const timeComplexityPattern = /Time complexity:?\s*([^\n]+(?:\n[^\n]+)*?)(?=\n\s*(?:Space complexity|$))/i;
      const spaceComplexityPattern = /Space complexity:?\s*([^\n]+(?:\n[^\n]+)*?)(?=\n\s*(?:[A-Z]|$))/i;
      
      let timeComplexity = "O(n) - Linear time complexity because we only iterate through the array once. Each element is processed exactly one time, and the hashmap lookups are O(1) operations.";
      let spaceComplexity = "O(n) - Linear space complexity because we store elements in the hashmap. In the worst case, we might need to store all elements before finding the solution pair.";
      
      const timeMatch = responseContent.match(timeComplexityPattern);
      if (timeMatch && timeMatch[1]) {
        timeComplexity = timeMatch[1].trim();
        if (!timeComplexity.match(/O\([^)]+\)/i)) {
          timeComplexity = `O(n) - ${timeComplexity}`;
        } else if (!timeComplexity.includes('-') && !timeComplexity.includes('because')) {
          const notationMatch = timeComplexity.match(/O\([^)]+\)/i);
          if (notationMatch) {
            const notation = notationMatch[0];
            const rest = timeComplexity.replace(notation, '').trim();
            timeComplexity = `${notation} - ${rest}`;
          }
        }
      }
      
      const spaceMatch = responseContent.match(spaceComplexityPattern);
      if (spaceMatch && spaceMatch[1]) {
        spaceComplexity = spaceMatch[1].trim();
        if (!spaceComplexity.match(/O\([^)]+\)/i)) {
          spaceComplexity = `O(n) - ${spaceComplexity}`;
        } else if (!spaceComplexity.includes('-') && !spaceComplexity.includes('because')) {
          const notationMatch = spaceComplexity.match(/O\([^)]+\)/i);
          if (notationMatch) {
            const notation = notationMatch[0];
            const rest = spaceComplexity.replace(notation, '').trim();
            spaceComplexity = `${notation} - ${rest}`;
          }
        }
      }

      const formattedResponse = {
        code: code,
        thoughts: thoughts.length > 0 ? thoughts : ["Solution approach based on efficiency and readability"],
        time_complexity: timeComplexity,
        space_complexity: spaceComplexity
      };

      return { success: true, data: formattedResponse };
    } catch (error: any) {
      if (axios.isCancel(error)) {
        return {
          success: false,
          error: "Processing was canceled by the user."
        };
      }
      
      if (error?.response?.status === 401) {
        return {
          success: false,
          error: "Invalid OpenAI API key. Please check your settings."
        };
      } else if (error?.response?.status === 429) {
        return {
          success: false,
          error: "OpenAI API rate limit exceeded or insufficient credits. Please try again later."
        };
      }
      
      console.error("Solution generation error:", error);
      return { success: false, error: error.message || "Failed to generate solution" };
    }
  }

  private async processExtraScreenshotsHelper(
    screenshots: Array<{ path: string; data: string }>,
    signal: AbortSignal
  ) {
    try {
      const problemInfo = this.deps.getProblemInfo();
      const language = await this.getLanguage();
      const config = configHelper.loadConfig();
      const mainWindow = this.deps.getMainWindow();

      if (!problemInfo) {
        throw new Error("No problem info available");
      }

      // Update progress status
      if (mainWindow) {
        mainWindow.webContents.send("processing-status", {
          message: "Processing debug screenshots...",
          progress: 30
        });
      }

      // Prepare the images for the API call
      const imageDataList = screenshots.map(screenshot => screenshot.data);
      
      let debugContent;
      
      if (config.apiProvider === "openai") {
        if (!this.openaiClient) {
          return {
            success: false,
            error: "OpenAI API key not configured. Please check your settings."
          };
        }
        
        const messages = [
          {
            role: "system" as const, 
            content: `You are a coding interview assistant helping debug and improve solutions. Analyze these screenshots which include either error messages, incorrect outputs, or test cases, and provide detailed debugging help.

Your response MUST follow this exact structure with these section headers (use ### for headers):
### Issues Identified
- List each issue as a bullet point with clear explanation

### Specific Improvements and Corrections
- List specific code changes needed as bullet points

### Optimizations
- List any performance optimizations if applicable

### Explanation of Changes Needed
Here provide a clear explanation of why the changes are needed

### Key Points
- Summary bullet points of the most important takeaways

If you include code examples, use proper markdown code blocks with language specification (e.g. \`\`\`java).`
          },
          {
            role: "user" as const,
            content: [
              {
                type: "text" as const, 
                text: `I'm solving this coding problem: "${problemInfo.problem_statement}" in ${language}. I need help with debugging or improving my solution. Here are screenshots of my code, the errors or test cases. Please provide a detailed analysis with:
1. What issues you found in my code
2. Specific improvements and corrections
3. Any optimizations that would make the solution better
4. A clear explanation of the changes needed` 
              },
              ...imageDataList.map(data => ({
                type: "image_url" as const,
                image_url: { url: `data:image/png;base64,${data}` }
              }))
            ]
          }
        ];

        if (mainWindow) {
          mainWindow.webContents.send("processing-status", {
            message: "Analyzing code and generating debug feedback...",
            progress: 60
          });
        }

        const debugResponse = await this.openaiClient.chat.completions.create({
          model: config.debuggingModel || "gpt-4o",
          messages: messages,
          max_tokens: 4000,
          temperature: 0.2
        });
        
        debugContent = debugResponse.choices[0].message.content;
      } else if (config.apiProvider === "gemini")  {
        if (!this.geminiApiKey) {
          return {
            success: false,
            error: "Gemini API key not configured. Please check your settings."
          };
        }
        
        try {
          const debugPrompt = `
You are a coding interview assistant helping debug and improve solutions. Analyze these screenshots which include either error messages, incorrect outputs, or test cases, and provide detailed debugging help.

I'm solving this coding problem: "${problemInfo.problem_statement}" in ${language}. I need help with debugging or improving my solution.

YOUR RESPONSE MUST FOLLOW THIS EXACT STRUCTURE WITH THESE SECTION HEADERS:
### Issues Identified
- List each issue as a bullet point with clear explanation

### Specific Improvements and Corrections
- List specific code changes needed as bullet points

### Optimizations
- List any performance optimizations if applicable

### Explanation of Changes Needed
Here provide a clear explanation of why the changes are needed

### Key Points
- Summary bullet points of the most important takeaways

If you include code examples, use proper markdown code blocks with language specification (e.g. \`\`\`java).
`;

          const geminiMessages = [
            {
              role: "user",
              parts: [
                { text: debugPrompt },
                ...imageDataList.map(data => ({
                  inlineData: {
                    mimeType: "image/png",
                    data: data
                  }
                }))
              ]
            }
          ];

          if (mainWindow) {
            mainWindow.webContents.send("processing-status", {
              message: "Analyzing code and generating debug feedback with Gemini...",
              progress: 60
            });
          }

          const response = await axios.default.post(
            `https://generativelanguage.googleapis.com/v1beta/models/${config.debuggingModel || "gemini-2.5-pro"}:generateContent?key=${this.geminiApiKey}`,
            {
              contents: geminiMessages,
              generationConfig: {
                temperature: 0.2,
                maxOutputTokens: 4000
              }
            },
            { signal }
          );

          const responseData = response.data as GeminiResponse;
          
          console.log("Gemini API response structure:", JSON.stringify(responseData, null, 2));
          
          if (!responseData.candidates || responseData.candidates.length === 0) {
            console.error("Gemini API returned empty candidates array");
            throw new Error("Empty response from Gemini API");
          }
          
          if (!responseData.candidates[0].content || 
              !responseData.candidates[0].content.parts || 
              responseData.candidates[0].content.parts.length === 0) {
            console.error("Gemini API response has invalid structure:", {
              hasContent: !!responseData.candidates[0].content,
              hasParts: !!(responseData.candidates[0].content?.parts),
              partsLength: responseData.candidates[0].content?.parts?.length || 0
            });
            throw new Error("Invalid response structure from Gemini API");
          }
          
          debugContent = responseData.candidates[0].content.parts[0].text;
        } catch (error) {
          console.error("Error using Gemini API for debugging:", error);
          return {
            success: false,
            error: "Failed to process debug request with Gemini API. Please check your API key or try again later."
          };
        }
      } else if (config.apiProvider === "anthropic") {
        if (!this.anthropicClient) {
          return {
            success: false,
            error: "Anthropic API key not configured. Please check your settings."
          };
        }
        
        try {
          const debugPrompt = `
You are a coding interview assistant helping debug and improve solutions. Analyze these screenshots which include either error messages, incorrect outputs, or test cases, and provide detailed debugging help.

I'm solving this coding problem: "${problemInfo.problem_statement}" in ${language}. I need help with debugging or improving my solution.

YOUR RESPONSE MUST FOLLOW THIS EXACT STRUCTURE WITH THESE SECTION HEADERS:
### Issues Identified
- List each issue as a bullet point with clear explanation

### Specific Improvements and Corrections
- List specific code changes needed as bullet points

### Optimizations
- List any performance optimizations if applicable

### Explanation of Changes Needed
Here provide a clear explanation of why the changes are needed

### Key Points
- Summary bullet points of the most important takeaways

If you include code examples, use proper markdown code blocks with language specification.
`;

          const messages = [
            {
              role: "user" as const,
              content: [
                {
                  type: "text" as const,
                  text: debugPrompt
                },
                ...imageDataList.map(data => ({
                  type: "image" as const,
                  source: {
                    type: "base64" as const,
                    media_type: "image/png" as const, 
                    data: data
                  }
                }))
              ]
            }
          ];

          if (mainWindow) {
            mainWindow.webContents.send("processing-status", {
              message: "Analyzing code and generating debug feedback with Claude...",
              progress: 60
            });
          }

          const response = await this.anthropicClient.messages.create({
            model: config.debuggingModel || "claude-3-7-sonnet-20250219",
            max_tokens: 4000,
            messages: messages,
            temperature: 0.2
          });
          
          debugContent = (response.content[0] as { type: 'text', text: string }).text;
        } catch (error: any) {
          console.error("Error using Anthropic API for debugging:", error);
          
          if (error.response?.status === 413 || error.message?.includes('too large')) {
            return {
              success: false,
              error: "Your screenshots contain too much information for Claude to process. Try these solutions:\n\n1. Take fewer screenshots or smaller screenshots\n2. Crop screenshots to focus on the problem area\n3. Switch to OpenAI or Gemini models in Settings (they can handle larger inputs)\n4. Use text-based problem input if available"
            };
          }
          
          return {
            success: false,
            error: "Failed to process debug request with Anthropic API. Please check your API key or try again later."
          };
        }
      }
      
      
      if (mainWindow) {
        mainWindow.webContents.send("processing-status", {
          message: "Debug analysis complete",
          progress: 100
        });
      }

      let extractedCode = "// Debug mode - see analysis below";
      const codeMatch = debugContent.match(/```(?:[a-zA-Z]+)?([\s\S]*?)```/);
      if (codeMatch && codeMatch[1]) {
        extractedCode = codeMatch[1].trim();
      }

      let formattedDebugContent = debugContent;
      
      if (!debugContent.includes('# ') && !debugContent.includes('## ')) {
        formattedDebugContent = debugContent
          .replace(/issues identified|problems found|bugs found/i, '## Issues Identified')
          .replace(/code improvements|improvements|suggested changes/i, '## Code Improvements')
          .replace(/optimizations|performance improvements/i, '## Optimizations')
          .replace(/explanation|detailed analysis/i, '## Explanation');
      }

      const bulletPoints = formattedDebugContent.match(/(?:^|\n)[ ]*(?:[-*•]|\d+\.)[ ]+([^\n]+)/g);
      const thoughts = bulletPoints 
        ? bulletPoints.map(point => point.replace(/^[ ]*(?:[-*•]|\d+\.)[ ]+/, '').trim()).slice(0, 5)
        : ["Debug analysis based on your screenshots"];
      
      const response = {
        code: extractedCode,
        debug_analysis: formattedDebugContent,
        thoughts: thoughts,
        time_complexity: "N/A - Debug mode",
        space_complexity: "N/A - Debug mode"
      };

      return { success: true, data: response };
    } catch (error: any) {
      console.error("Debug processing error:", error);
      return { success: false, error: error.message || "Failed to process debug request" };
    }
  }

  public cancelOngoingRequests(): void {
    let wasCancelled = false

    if (this.currentProcessingAbortController) {
      this.currentProcessingAbortController.abort()
      this.currentProcessingAbortController = null
      wasCancelled = true
    }

    if (this.currentExtraProcessingAbortController) {
      this.currentExtraProcessingAbortController.abort()
      this.currentExtraProcessingAbortController = null
      wasCancelled = true
    }

    this.deps.setHasDebugged(false)

    this.deps.setProblemInfo(null)

    const mainWindow = this.deps.getMainWindow()
    if (wasCancelled && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(this.deps.PROCESSING_EVENTS.NO_SCREENSHOTS)
    }
  }

  public async processScreenshotsDirectMode(): Promise<void> {
    const mainWindow = this.deps.getMainWindow()
    if (!mainWindow) return

    const config = configHelper.loadConfig();
    
    // Check if any API provider is configured
    if (!configHelper.hasApiKey()) {
      mainWindow.webContents.send(
        this.deps.PROCESSING_EVENTS.API_KEY_INVALID,
        "Direct mode requires an API key. Please configure your API provider in settings."
      );
      return;
    }

    const view = this.deps.getView()
    console.log("Processing screenshots in direct mode, view:", view)

    if (view === "queue") {
      mainWindow.webContents.send(this.deps.PROCESSING_EVENTS.INITIAL_START)
      const screenshotQueue = this.screenshotHelper.getScreenshotQueue()
      console.log("Processing main queue screenshots in direct mode:", screenshotQueue)
      
      // Check if the queue is empty
      if (!screenshotQueue || screenshotQueue.length === 0) {
        console.log("No screenshots found in queue");
        mainWindow.webContents.send(this.deps.PROCESSING_EVENTS.NO_SCREENSHOTS);
        return;
      }

      // Check that files actually exist
      const existingScreenshots = screenshotQueue.filter(path => fs.existsSync(path));
      if (existingScreenshots.length === 0) {
        console.log("Screenshot files don't exist on disk");
        mainWindow.webContents.send(this.deps.PROCESSING_EVENTS.NO_SCREENSHOTS);
        return;
      }

      try {
        // Initialize AbortController
        this.currentProcessingAbortController = new AbortController()
        const { signal } = this.currentProcessingAbortController

        const screenshots = await Promise.all(
          existingScreenshots.map(async (path) => {
            try {
              return {
                path,
                preview: await this.screenshotHelper.getImagePreview(path),
                data: fs.readFileSync(path).toString('base64')
              };
            } catch (err) {
              console.error(`Error reading screenshot ${path}:`, err);
              return null;
            }
          })
        )

        // Filter out any nulls from failed screenshots
        const validScreenshots = screenshots.filter(Boolean);
        
        if (validScreenshots.length === 0) {
          throw new Error("Failed to load screenshot data");
        }
        
        // Notify user if some screenshots failed to load
        if (validScreenshots.length < existingScreenshots.length) {
          const failedCount = existingScreenshots.length - validScreenshots.length;
          console.warn(`${failedCount} screenshot(s) failed to load and will be skipped`);
          
          if (mainWindow) {
            mainWindow.webContents.send("processing-status", {
              message: `Warning: ${failedCount} screenshot(s) could not be read and will be skipped. Processing with ${validScreenshots.length} screenshot(s)...`,
              progress: 10
            });
          }
        }

        const result = await this.processScreenshotsDirectModeHelper(validScreenshots, signal)

        if (!result.success) {
          console.log("Direct mode processing failed:", result.error)
          mainWindow.webContents.send(
            this.deps.PROCESSING_EVENTS.INITIAL_SOLUTION_ERROR,
            result.error
          )
          // Reset view back to queue on error
          console.log("Resetting view to queue due to error")
          this.deps.setView("queue")
          return
        }

        // Only set view to solutions if processing succeeded
        console.log("Setting view to solutions after successful direct mode processing")
        mainWindow.webContents.send(
          this.deps.PROCESSING_EVENTS.SOLUTION_SUCCESS,
          result.data
        )
        this.deps.setView("solutions")
      } catch (error: any) {
        mainWindow.webContents.send(
          this.deps.PROCESSING_EVENTS.INITIAL_SOLUTION_ERROR,
          error
        )
        console.error("Direct mode processing error:", error)
        if (axios.isCancel(error)) {
          mainWindow.webContents.send(
            this.deps.PROCESSING_EVENTS.INITIAL_SOLUTION_ERROR,
            "Processing was canceled by the user."
          )
        } else {
          mainWindow.webContents.send(
            this.deps.PROCESSING_EVENTS.INITIAL_SOLUTION_ERROR,
            error.message || "Server error. Please try again."
          )
        }
        // Reset view back to queue on error
        console.log("Resetting view to queue due to error")
        this.deps.setView("queue")
      } finally {
        this.currentProcessingAbortController = null
      }
    } else {
      // view == 'solutions' - handle extra screenshots in direct mode
      const extraScreenshotQueue = this.screenshotHelper.getExtraScreenshotQueue()
      console.log("Processing extra queue screenshots in direct mode:", extraScreenshotQueue)
      
      // Check if the extra queue is empty
      if (!extraScreenshotQueue || extraScreenshotQueue.length === 0) {
        console.log("No extra screenshots found in queue");
        mainWindow.webContents.send(this.deps.PROCESSING_EVENTS.NO_SCREENSHOTS);
        return;
      }

      // Check that files actually exist
      const existingExtraScreenshots = extraScreenshotQueue.filter(path => fs.existsSync(path));
      if (existingExtraScreenshots.length === 0) {
        console.log("Extra screenshot files don't exist on disk");
        mainWindow.webContents.send(this.deps.PROCESSING_EVENTS.NO_SCREENSHOTS);
        return;
      }
      
      mainWindow.webContents.send(this.deps.PROCESSING_EVENTS.DEBUG_START)

      // Initialize AbortController
      this.currentExtraProcessingAbortController = new AbortController()
      const { signal } = this.currentExtraProcessingAbortController

      try {
        // Get all screenshots (both main and extra) for processing
        const allPaths = [
          ...this.screenshotHelper.getScreenshotQueue(),
          ...existingExtraScreenshots
        ];
        
        const screenshots = await Promise.all(
          allPaths.map(async (path) => {
            try {
              if (!fs.existsSync(path)) {
                console.warn(`Screenshot file does not exist: ${path}`);
                return null;
              }
              
              return {
                path,
                preview: await this.screenshotHelper.getImagePreview(path),
                data: fs.readFileSync(path).toString('base64')
              };
            } catch (err) {
              console.error(`Error reading screenshot ${path}:`, err);
              return null;
            }
          })
        )
        
        // Filter out any nulls from failed screenshots
        const validScreenshots = screenshots.filter(Boolean);
        
        if (validScreenshots.length === 0) {
          throw new Error("Failed to load screenshot data for debugging");
        }
        
        console.log(
          "Combined screenshots for direct mode processing:",
          validScreenshots.map((s) => s.path)
        )

        const result = await this.processExtraScreenshotsDirectModeHelper(
          validScreenshots,
          signal
        )

        if (result.success) {
          this.deps.setHasDebugged(true)
          mainWindow.webContents.send(
            this.deps.PROCESSING_EVENTS.DEBUG_SUCCESS,
            result.data
          )
        } else {
          mainWindow.webContents.send(
            this.deps.PROCESSING_EVENTS.DEBUG_ERROR,
            result.error
          )
        }
      } catch (error: any) {
        if (axios.isCancel(error)) {
          mainWindow.webContents.send(
            this.deps.PROCESSING_EVENTS.DEBUG_ERROR,
            "Extra processing was canceled by the user."
          )
        } else {
          mainWindow.webContents.send(
            this.deps.PROCESSING_EVENTS.DEBUG_ERROR,
            error.message
          )
        }
      } finally {
        this.currentExtraProcessingAbortController = null
      }
    }
  }

  private async processScreenshotsDirectModeHelper(
    screenshots: Array<{ path: string; data: string }>,
    signal: AbortSignal
  ): Promise<{success: boolean, data?: any, error?: string}> {
    try {
      const config = configHelper.loadConfig();
      const language = await this.getLanguage();
      const mainWindow = this.deps.getMainWindow();

      // Notify renderer that processing has started
      if (mainWindow) {
        mainWindow.webContents.send("processing-status", {
          message: "Generating solution directly from screenshots...",
          progress: 20
        });
      }

      const imageDataList = screenshots.map(s => s.data);

      // Create a precise prompt for code-only output
      const directModePrompt = `
You are an expert coding assistant. Carefully analyze the provided screenshots and output only the most accurate, complete, and optimal solution code for the problem shown. 

Respond with a single code block in ${language}. Do not include any explanation, comments, or extra text—just the code.`;

      let responseContent;
      
      if (config.apiProvider === "openai") {
        // OpenAI processing
        if (!this.openaiClient) {
          this.initializeAIClient(); // Try to reinitialize
          if (!this.openaiClient) {
            return {
              success: false,
              error: "OpenAI API key not configured or invalid. Please check your settings."
            };
          }
        }
        
        // Send to OpenAI API  
        const messages = [
          { role: "system" as const, content: "You are an expert coding interview assistant. Provide clear, optimal solutions with detailed explanations." },
          {
            role: "user" as const,
            content: [
              {
                type: "text" as const,
                text: directModePrompt
              },
              ...imageDataList.map(data => ({
                type: "image_url" as const,
                image_url: { url: `data:image/png;base64,${data}` }
              }))
            ]
          }
        ];

        const solutionResponse = await this.openaiClient.chat.completions.create({
          model: config.solutionModel || "gpt-4o",
          messages: messages,
          max_tokens: 4000,
          temperature: 0.1
        });

        responseContent = solutionResponse.choices[0].message.content;
        
      } else if (config.apiProvider === "gemini") {
        // Gemini processing
        if (!this.geminiApiKey) {
          return {
            success: false,
            error: "Gemini API key not configured. Please check your settings."
          };
        }

        const geminiMessages: GeminiMessage[] = [
          {
            role: "user",
            parts: [
              {
                text: directModePrompt
              },
              ...imageDataList.map(data => ({
                inlineData: {
                  mimeType: "image/png",
                  data: data
                }
              }))
            ]
          }
        ];

        // --- Gemini profiling start ---
        const t0 = Date.now();
        let response, t1, retry = false;
        try {
          response = await axios.default.post(
            `https://generativelanguage.googleapis.com/v1beta/models/${config.solutionModel || "gemini-2.5-pro"}:generateContent?key=${this.geminiApiKey}`,
            {
              contents: geminiMessages,
              generationConfig: {
                temperature: 0.2,
                maxOutputTokens: 5000
              }
            },
            { signal, timeout: 60000 }
          );
          t1 = Date.now();
        } catch (err) {
          t1 = Date.now();
          // Retry on ECONNRESET/socket hang up with lower maxOutputTokens
          if (err.code === 'ECONNRESET' || (err.message && err.message.includes('socket hang up'))) {
            retry = true;
            try {
              response = await axios.default.post(
                `https://generativelanguage.googleapis.com/v1beta/models/${config.solutionModel || "gemini-2.5-pro"}:generateContent?key=${this.geminiApiKey}`,
                {
                  contents: geminiMessages,
                  generationConfig: {
                    temperature: 0.2,
                    maxOutputTokens: 2048
                  }
                },
                { signal, timeout: 60000 }
              );
              t1 = Date.now();
            } catch (err2) {
              t1 = Date.now();
              if (mainWindow) {
                mainWindow.webContents.send("processing-status", {
                  message: "Gemini failed to generate a solution (network error). Try again, use a smaller prompt, or switch to GPT-4o.",
                  progress: 0
                });
              }
              // Fallback to OpenAI if available
              if (String(config.apiProvider) !== 'openai' && this.openaiClient) {
                try {
                  const openaiMessages = [
                    { role: "system", content: "You are an expert coding interview assistant. Provide only the code solution in a single code block, no explanation." },
                    { role: "user", content: directModePrompt }
                  ] as any;
                  const openaiResponse = await this.openaiClient.chat.completions.create({
                    model: config.solutionModel || "gpt-4o",
                    messages: openaiMessages,
                    max_tokens: 2048,
                    temperature: 0.2
                  });
                  responseContent = openaiResponse.choices[0].message.content;
                  // Continue to parsing below
                } catch (openaiErr) {
                  return { success: false, error: "Both Gemini and OpenAI failed to generate a solution. Please try again later." };
                }
              } else {
                return { success: false, error: "Gemini failed to generate a solution (network error). Try again, use a smaller prompt, or switch to GPT-4o." };
              }
            }
          } else if (t1 - t0 > 60000) {
            if (mainWindow) {
              mainWindow.webContents.send("processing-status", {
                message: "Gemini timed out – try a shorter prompt, fewer screenshots, or switch to GPT-4o.",
                progress: 0
              });
            }
            return { success: false, error: "Gemini timed out after 60 seconds. Try a shorter prompt, fewer screenshots, or switch to GPT-4o." };
          } else {
            throw err;
          }
        }
        if (!responseContent) {
          const usage = response.data?.usageMetadata ?? {};
          console.table({
            duration_ms: Math.round(t1 - t0),
            prompt: usage.promptTokenCount,
            candidates: usage.candidatesTokenCount,
            thoughts: usage.thoughtsTokenCount,
            total: usage.totalTokenCount
          });
        }
        // --- Gemini profiling end ---

        const responseData = response.data as GeminiResponse;

        console.log("Gemini API response structure:", JSON.stringify(responseData, null, 2));
        
        if (!responseData.candidates || responseData.candidates.length === 0) {
          throw new Error("Empty response from Gemini API");
        }

        const candidate = responseData.candidates[0];
        if (
          (!candidate.content || !candidate.content.parts || candidate.content.parts.length === 0) &&
          candidate.finishReason === "MAX_TOKENS"
        ) {
          return {
            success: false,
            error: "Gemini could not generate a full solution due to token limits. Try reducing the number of screenshots, a shorter prompt, or switch to a different model."
          };
        }

        if (!candidate.content || !candidate.content.parts || candidate.content.parts.length === 0) {
          throw new Error("Invalid response structure from Gemini API");
        }
        
        responseContent = candidate.content.parts[0].text;
      } else if (config.apiProvider === "anthropic") {
        // Anthropic processing
        if (!this.anthropicClient) {
          return {
            success: false,
            error: "Anthropic API key not configured. Please check your settings."
          };
        }
        
        try {
          const messages = [
            {
              role: "user" as const,
              content: [
                {
                  type: "text" as const,
                  text: directModePrompt
                },
                ...imageDataList.map(data => ({
                  type: "image" as const,
                  source: {
                    type: "base64" as const,
                    media_type: "image/png" as const,
                    data: data
                  }
                }))
              ]
            }
          ];

          const response = await this.anthropicClient.messages.create({
            model: config.solutionModel || "claude-3-7-sonnet-20250219",
            max_tokens: 4000,
            messages: messages,
            temperature: 0.1
          });

          responseContent = (response.content[0] as { type: 'text', text: string }).text;
        } catch (error: any) {
          console.error("Error using Anthropic API for direct mode:", error);

          // Add specific handling for Claude's limitations
          if (error.status === 429) {
            return {
              success: false,
              error: "Claude API rate limit exceeded. Please wait a few minutes before trying again."
            };
          } else if (error.status === 413 || (error.message && error.message.includes("token"))) {
            return {
              success: false,
              error: "Your screenshots contain too much information for Claude to process. Switch to OpenAI or Gemini in settings which can handle larger inputs."
            };
          }

          return {
            success: false,
            error: "Failed to process with Anthropic API. Please check your API key or try again later."
          };
        }
      } else {
        return {
          success: false,
          error: "No valid API provider configured."
        };
      }

      // Improved parsing to handle the structured response
      const codeMatch = responseContent.match(/```(?:\w+)?\s*([\s\S]*?)```/);
      let code = codeMatch ? codeMatch[1].trim() : "";

      // If no code blocks found, try to extract from direct text
      if (!code && (responseContent.includes('def ') || responseContent.includes('class ') || responseContent.includes('function '))) {
        // For direct mode, if no code blocks, the entire response might be code
        const lines = responseContent.split('\n');
        const codeLines = lines.filter(line => 
          !line.startsWith('**') && 
          !line.toLowerCase().includes('complexity') &&
          !line.toLowerCase().includes('thought')
        );
        if (codeLines.length > 0) {
          code = codeLines.join('\n').trim();
        }
      }

      // Parse thoughts with better regex
      const thoughtsRegex = /\*\*Your Thoughts:\*\*\s*([\s\S]*?)(?=\*\*Time complexity|\*\*Space complexity|$)/i;
      const thoughtsMatch = responseContent.match(thoughtsRegex);
      let thoughts: string[] = [];
      
      if (thoughtsMatch && thoughtsMatch[1]) {
        const bulletPoints = thoughtsMatch[1].match(/(?:^|\n)\s*[-*•]\s*([^\n]+)/g);
        if (bulletPoints) {
          thoughts = bulletPoints
            .map(point => point.replace(/^\s*[-*•]\s*/, '').trim())
            .filter(Boolean);
        } else {
          // Fallback: split by lines and filter
          thoughts = thoughtsMatch[1]
            .split('\n')
            .map(line => line.trim())
            .filter(line => line && !line.startsWith('**'))
            .slice(0, 5); // Limit to 5 key thoughts
        }
      }

      // Parse complexity with improved patterns
      const timeComplexityPattern = /\*\*Time complexity:\*\*\s*([^\n]+(?:\n(?!\*\*)[^\n]+)*)/i;
      const spaceComplexityPattern = /\*\*Space complexity:\*\*\s*([^\n]+(?:\n(?!\*\*)[^\n]+)*)/i;

      let timeComplexity = "O(n)";
      let spaceComplexity = "O(1)";

      const timeMatch = responseContent.match(timeComplexityPattern);
      if (timeMatch && timeMatch[1]) {
        timeComplexity = timeMatch[1].trim();
        // Ensure proper formatting
        if (!timeComplexity.match(/O\([^)]+\)/i)) {
          timeComplexity = `O(n) - ${timeComplexity}`;
        } else if (!timeComplexity.includes('-') && !timeComplexity.includes('because') && !timeComplexity.includes('since')) {
          const notationMatch = timeComplexity.match(/O\([^)]+\)/i);
          if (notationMatch) {
            const notation = notationMatch[0];
            const rest = timeComplexity.replace(notation, '').trim();
            timeComplexity = rest ? `${notation} - ${rest}` : notation;
          }
        }
      }

      const spaceMatch = responseContent.match(spaceComplexityPattern);
      if (spaceMatch && spaceMatch[1]) {
        spaceComplexity = spaceMatch[1].trim();
        // Ensure proper formatting
        if (!spaceComplexity.match(/O\([^)]+\)/i)) {
          spaceComplexity = `O(1) - ${spaceComplexity}`;
        } else if (!spaceComplexity.includes('-') && !spaceComplexity.includes('because') && !spaceComplexity.includes('since')) {
          const notationMatch = spaceComplexity.match(/O\([^)]+\)/i);
          if (notationMatch) {
            const notation = notationMatch[0];
            const rest = spaceComplexity.replace(notation, '').trim();
            spaceComplexity = rest ? `${notation} - ${rest}` : notation;
          }
        }
      }

      // Ensure we have valid content
      if (!code || code.length < 10) {
        throw new Error("Failed to extract valid code from AI response. Please try again or use the regular solve mode.");
      }

      const formattedResponse = {
        code: code,
        thoughts: thoughts.length > 0 ? thoughts : [
          "Analyzed the problem requirements from screenshots",
          "Implemented an optimized solution with proper edge case handling",
          "Focused on passing all visible and potential hidden test cases"
        ],
        time_complexity: timeComplexity,
        space_complexity: spaceComplexity
      };

      return { success: true, data: formattedResponse };
    } catch (error: any) {
      if (axios.isCancel(error)) {
        return { success: false, error: "Processing was canceled by the user." };
      }
      console.error("Direct mode processing error:", error);
      return { success: false, error: error.message || "Failed to process screenshots in direct mode" };
    }
  }

  private async processExtraScreenshotsDirectModeHelper(
    screenshots: Array<{ path: string; data: string }>,
    signal: AbortSignal
  ): Promise<{success: boolean, data?: any, error?: string}> {
    // This is a placeholder - the actual implementation should be similar to processExtraScreenshotsHelper
    // but with direct mode specific logic
    return this.processExtraScreenshotsHelper(screenshots, signal);
  }

  public async processInterviewQuestion(question: string, resumeData: string): Promise<{success: boolean, data?: string, error?: string}> {
    try {
      const config = configHelper.loadConfig();
      const conversationHistory = configHelper.getConversationHistory();
      const mainWindow = this.deps.getMainWindow();

      // Create the interview prompt for generating natural, complete answers
      const interviewPrompt = `You are an AI interview assistant helping a candidate prepare for job interviews. Your role is to generate natural, complete answers that the candidate can read verbatim during interviews.

RESUME DATA:
${resumeData}

CONVERSATION HISTORY:
${conversationHistory.map(msg => `${msg.role}: ${msg.content}`).join('\n')}

CURRENT QUESTION: ${question}

Generate a complete, natural-sounding answer that:
1. Sounds like the candidate's own words and thoughts
2. References specific experiences and skills from their resume
3. Is conversational and authentic, not overly formal or robotic
4. Can be read directly during an interview without sounding rehearsed
5. Includes specific examples and quantifiable results when possible
6. Shows enthusiasm and confidence
7. Is concise but comprehensive (2-3 paragraphs maximum)

Write the answer as if the candidate is speaking directly to the interviewer. Make it personal, authentic, and compelling. Do not provide structure or guidance - give the complete answer that can be used immediately.`;

      let responseContent: string;
      
      if (config.apiProvider === "openai") {
        if (!this.openaiClient) {
          return {
            success: false,
            error: "OpenAI API key not configured. Please check your settings."
          };
        }
        
        const response = await this.openaiClient.chat.completions.create({
          model: config.solutionModel || "gpt-4o",
          messages: [
            { role: "system", content: "You are an expert interview coach. Generate natural, complete answers that candidates can use verbatim in interviews." },
            { role: "user", content: interviewPrompt }
          ],
          max_tokens: 2000,
          temperature: 0.7
        });

        responseContent = response.choices[0].message.content || "";
      } else if (config.apiProvider === "gemini") {
        if (!this.geminiApiKey) {
          return {
            success: false,
            error: "Gemini API key not configured. Please check your settings."
          };
        }
        
        try {
          const geminiMessages = [
            {
              role: "user",
              parts: [{ text: interviewPrompt }]
            }
          ];

          const response = await axios.default.post(
            `https://generativelanguage.googleapis.com/v1beta/models/${config.solutionModel}:generateContent?key=${this.geminiApiKey}`,
            {
              contents: geminiMessages,
              generationConfig: {
                temperature: 0.7,
                maxOutputTokens: 2000
              }
            }
          );

          const responseData = response.data as GeminiResponse;
          
          if (!responseData.candidates || responseData.candidates.length === 0) {
            throw new Error("Empty response from Gemini API");
          }
          
          if (!responseData.candidates[0].content || 
              !responseData.candidates[0].content.parts || 
              responseData.candidates[0].content.parts.length === 0) {
            throw new Error("Invalid response structure from Gemini API");
          }
          
          responseContent = responseData.candidates[0].content.parts[0].text;
        } catch (error) {
          console.error("Error using Gemini API for interview question:", error);
          return {
            success: false,
            error: "Failed to process interview question with Gemini API. Please check your API key or try again later."
          };
        }
      } else if (config.apiProvider === "anthropic") {
        if (!this.anthropicClient) {
          return {
            success: false,
            error: "Anthropic API key not configured. Please check your settings."
          };
        }
        
        try {
          const response = await this.anthropicClient.messages.create({
            model: config.solutionModel || "claude-3-7-sonnet-20250219",
            max_tokens: 2000,
            messages: [
              {
                role: "user",
                content: interviewPrompt
              }
            ],
            temperature: 0.7
          });

          responseContent = (response.content[0] as { type: 'text', text: string }).text;
        } catch (error: any) {
          console.error("Error using Anthropic API for interview question:", error);
          return {
            success: false,
            error: "Failed to process interview question with Anthropic API. Please check your API key or try again later."
          };
        }
      } else {
        return {
          success: false,
          error: "No valid API provider configured."
        };
      }

      return { success: true, data: responseContent };
    } catch (error: any) {
      console.error("Interview question processing error:", error);
      return { 
        success: false, 
        error: error.message || "Failed to process interview question. Please try again." 
      };
    }
  }
}
