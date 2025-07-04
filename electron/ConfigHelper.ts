// ConfigHelper.ts
import fs from "node:fs"
import path from "node:path"
import { app } from "electron"
import { EventEmitter } from "events"
import { OpenAI } from "openai"

interface Config {
  apiKey: string;
  apiProvider: "openai" | "gemini" | "anthropic";  // Added provider selection
  extractionModel: string;
  solutionModel: string;
  debuggingModel: string;
  language: string;
  opacity: number;
  clickThrough: boolean;  // Added click-through functionality
  resumeData: string;  // Store resume content
  interviewMode: boolean;  // Enable interview mode
  conversationHistory: Array<{role: string, content: string, timestamp: number}>;  // Store conversation history
  googleSpeechApiKey: string;  // Google Speech-to-Text API key
  useGoogleSpeech: boolean;  // Enable Google Speech-to-Text
}

export class ConfigHelper extends EventEmitter {
  private configPath: string;
  private defaultConfig: Config = {
    apiKey: "",
    apiProvider: "gemini", // Default to Gemini
    extractionModel: "gemini-2.5-pro",
    solutionModel: "gemini-2.5-pro",
    debuggingModel: "gemini-2.5-pro",
    language: "python",
    opacity: 1.0,
    clickThrough: true,  // Default to true to enable click-through by default
    resumeData: "",
    interviewMode: false,
    conversationHistory: [],
    googleSpeechApiKey: "",
    useGoogleSpeech: false
  };

  constructor() {
    super();
    // Use the app's user data directory to store the config
    try {
      this.configPath = path.join(app.getPath('userData'), 'config.json');
      console.log('Config path:', this.configPath);
    } catch (err) {
      console.warn('Could not access user data path, using fallback');
      this.configPath = path.join(process.cwd(), 'config.json');
    }
    
    // Ensure the initial config file exists
    this.ensureConfigExists();
  }

  /**
   * Ensure config file exists
   */
  private ensureConfigExists(): void {
    try {
      if (!fs.existsSync(this.configPath)) {
        this.saveConfig(this.defaultConfig);
      }
    } catch (err) {
      console.error("Error ensuring config exists:", err);
    }
  }

  /**
   * Validate and sanitize model selection to ensure only allowed models are used
   */
  private sanitizeModelSelection(model: string, provider: "openai" | "gemini" | "anthropic"): string {
    if (provider === "openai") {
      // Only allow gpt-4o and gpt-4o-mini for OpenAI
      const allowedModels = ['gpt-4o', 'gpt-4o-mini'];
      if (!allowedModels.includes(model)) {
        console.warn(`Invalid OpenAI model specified: ${model}. Using default model: gpt-4o`);
        return 'gpt-4o';
      }
      return model;
    } else if (provider === "gemini")  {
      // Only allow gemini-1.5-pro and gemini-2.0-flash for Gemini
      const allowedModels = ['gemini-2.5-pro', 'gemini-1.5-pro', 'gemini-2.0-flash'];
      if (!allowedModels.includes(model)) {
        console.warn(`Invalid Gemini model specified: ${model}. Using default model: gemini-2.5-pro`);
        return 'gemini-2.5-pro';
      }
      return model;
    }  else if (provider === "anthropic") {
      // Only allow Claude models
      const allowedModels = ['claude-3-7-sonnet-20250219', 'claude-3-5-sonnet-20241022', 'claude-3-opus-20240229'];
      if (!allowedModels.includes(model)) {
        console.warn(`Invalid Anthropic model specified: ${model}. Using default model: claude-3-7-sonnet-20250219`);
        return 'claude-3-7-sonnet-20250219';
      }
      return model;
    }
    // Default fallback
    return model;
  }

  public loadConfig(): Config {
    try {
      if (fs.existsSync(this.configPath)) {
        const configData = fs.readFileSync(this.configPath, 'utf8');
        
        // Try to parse the JSON, but handle corruption gracefully
        let config;
        try {
          config = JSON.parse(configData);
        } catch (parseError) {
          console.error("Config file is corrupted, backing up and creating new default config:", parseError);
          
          // Backup the corrupted file
          const backupPath = this.configPath + '.backup.' + Date.now();
          try {
            fs.copyFileSync(this.configPath, backupPath);
            console.log(`Corrupted config backed up to: ${backupPath}`);
            
            // Clean up old backup files (keep only the latest 5)
            this.cleanupOldBackups();
          } catch (backupError) {
            console.error("Failed to backup corrupted config:", backupError);
          }
          
          // Remove the corrupted file
          try {
            fs.unlinkSync(this.configPath);
          } catch (unlinkError) {
            console.error("Failed to remove corrupted config:", unlinkError);
          }
          
          // Create a new default config
          this.saveConfig(this.defaultConfig);
          
          // Emit event to notify UI about config restoration
          this.emit('config-restored', { 
            message: 'Configuration file was corrupted and has been restored to defaults. Please reconfigure your settings.',
            backupPath: backupPath
          });
          
          return this.defaultConfig;
        }
        
        // Ensure apiProvider is a valid value
        if (config.apiProvider !== "openai" && config.apiProvider !== "gemini"  && config.apiProvider !== "anthropic") {
          config.apiProvider = "gemini"; // Default to Gemini if invalid
        }
        
        // Sanitize model selections to ensure only allowed models are used
        if (config.extractionModel) {
          config.extractionModel = this.sanitizeModelSelection(config.extractionModel, config.apiProvider);
        }
        if (config.solutionModel) {
          config.solutionModel = this.sanitizeModelSelection(config.solutionModel, config.apiProvider);
        }
        if (config.debuggingModel) {
          config.debuggingModel = this.sanitizeModelSelection(config.debuggingModel, config.apiProvider);
        }
        
        return {
          ...this.defaultConfig,
          ...config
        };
      }
      
      // If no config exists, create a default one
      this.saveConfig(this.defaultConfig);
      return this.defaultConfig;
    } catch (err) {
      console.error("Error loading config:", err);
      return this.defaultConfig;
    }
  }

  /**
   * Save configuration to disk
   */
  public saveConfig(config: Config): void {
    try {
      // Ensure the directory exists
      const configDir = path.dirname(this.configPath);
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }
      // Write the config file
      fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2));
    } catch (err) {
      console.error("Error saving config:", err);
    }
  }

  /**
   * Update specific configuration values
   */
  public updateConfig(updates: Partial<Config>): Config {
    try {
      const currentConfig = this.loadConfig();
      let provider = updates.apiProvider || currentConfig.apiProvider;
      
      // Auto-detect provider based on API key format if a new key is provided
      if (updates.apiKey && !updates.apiProvider) {
        // If API key starts with "sk-", it's likely an OpenAI key
        if (updates.apiKey.trim().startsWith('sk-')) {
          provider = "openai";
          console.log("Auto-detected OpenAI API key format");
        } else if (updates.apiKey.trim().startsWith('sk-ant-')) {
          provider = "anthropic";
          console.log("Auto-detected Anthropic API key format");
        } else {
          provider = "gemini";
          console.log("Using Gemini API key format (default)");
        }
        
        // Update the provider in the updates object
        updates.apiProvider = provider;
      }
      
      // If provider is changing, reset models to the default for that provider
      if (updates.apiProvider && updates.apiProvider !== currentConfig.apiProvider) {
        if (updates.apiProvider === "openai") {
          updates.extractionModel = "gpt-4o";
          updates.solutionModel = "gpt-4o";
          updates.debuggingModel = "gpt-4o";
        } else if (updates.apiProvider === "anthropic") {
          updates.extractionModel = "claude-3-7-sonnet-20250219";
          updates.solutionModel = "claude-3-7-sonnet-20250219";
          updates.debuggingModel = "claude-3-7-sonnet-20250219";
        } else {
          updates.extractionModel = "gemini-2.5-pro";
          updates.solutionModel = "gemini-2.5-pro";
          updates.debuggingModel = "gemini-2.5-pro";
        }
      }
      
      // Sanitize model selections in the updates
      if (updates.extractionModel) {
        updates.extractionModel = this.sanitizeModelSelection(updates.extractionModel, provider);
      }
      if (updates.solutionModel) {
        updates.solutionModel = this.sanitizeModelSelection(updates.solutionModel, provider);
      }
      if (updates.debuggingModel) {
        updates.debuggingModel = this.sanitizeModelSelection(updates.debuggingModel, provider);
      }
      
      const newConfig = { ...currentConfig, ...updates };
      this.saveConfig(newConfig);
      
      // Only emit update event for changes other than opacity
      // This prevents re-initializing the AI client when only opacity changes
      if (updates.apiKey !== undefined || updates.apiProvider !== undefined || 
          updates.extractionModel !== undefined || updates.solutionModel !== undefined || 
          updates.debuggingModel !== undefined || updates.language !== undefined) {
        this.emit('config-updated', newConfig);
      }
      
      return newConfig;
    } catch (error) {
      console.error('Error updating config:', error);
      return this.defaultConfig;
    }
  }

  /**
   * Check if the API key is configured
   */
  public hasApiKey(): boolean {
    const config = this.loadConfig();
    return !!config.apiKey && config.apiKey.trim().length > 0;
  }
  
  /**
   * Validate the API key format
   */
  public isValidApiKeyFormat(apiKey: string, provider?: "openai" | "gemini" | "anthropic" ): boolean {
    // If provider is not specified, attempt to auto-detect
    if (!provider) {
      if (apiKey.trim().startsWith('sk-')) {
        if (apiKey.trim().startsWith('sk-ant-')) {
          provider = "anthropic";
        } else {
          provider = "openai";
        }
      } else {
        provider = "gemini";
      }
    }
    
    if (provider === "openai") {
      // Basic format validation for OpenAI API keys
      return /^sk-[a-zA-Z0-9]{32,}$/.test(apiKey.trim());
    } else if (provider === "gemini") {
      // Basic format validation for Gemini API keys (usually alphanumeric with no specific prefix)
      return apiKey.trim().length >= 10; // Assuming Gemini keys are at least 10 chars
    } else if (provider === "anthropic") {
      // Basic format validation for Anthropic API keys
      return /^sk-ant-[a-zA-Z0-9]{32,}$/.test(apiKey.trim());
    }
    
    return false;
  }
  
  /**
   * Get the stored opacity value
   */
  public getOpacity(): number {
    const config = this.loadConfig();
    return config.opacity !== undefined ? config.opacity : 1.0;
  }

  /**
   * Set the window opacity value
   */
  public setOpacity(opacity: number): void {
    // Ensure opacity is between 0.1 and 1.0
    const validOpacity = Math.min(1.0, Math.max(0.1, opacity));
    this.updateConfig({ opacity: validOpacity });
  }  
  
  /**
   * Get the preferred programming language
   */
  public getLanguage(): string {
    const config = this.loadConfig();
    return config.language || "python";
  }

  /**
   * Set the preferred programming language
   */
  public setLanguage(language: string): void {
    this.updateConfig({ language });
  }
  
  /**
   * Get the click-through setting
   */
  public getClickThrough(): boolean {
    const config = this.loadConfig();
    return config.clickThrough !== undefined ? config.clickThrough : false;
  }

  /**
   * Set the click-through setting
   */
  public setClickThrough(clickThrough: boolean): void {
    this.updateConfig({ clickThrough });
  }
  
  /**
   * Test API key with the selected provider
   */
  public async testApiKey(apiKey: string, provider?: "openai" | "gemini" | "anthropic"): Promise<{valid: boolean, error?: string}> {
    // Auto-detect provider based on key format if not specified
    if (!provider) {
      if (apiKey.trim().startsWith('sk-')) {
        if (apiKey.trim().startsWith('sk-ant-')) {
          provider = "anthropic";
          console.log("Auto-detected Anthropic API key format for testing");
        } else {
          provider = "openai";
          console.log("Auto-detected OpenAI API key format for testing");
        }
      } else {
        provider = "gemini";
        console.log("Using Gemini API key format for testing (default)");
      }
    }
    
    if (provider === "openai") {
      return this.testOpenAIKey(apiKey);
    } else if (provider === "gemini") {
      return this.testGeminiKey(apiKey);
    } else if (provider === "anthropic") {
      return this.testAnthropicKey(apiKey);
    }
    
    return { valid: false, error: "Unknown API provider" };
  }
  
  /**
   * Test OpenAI API key
   */
  private async testOpenAIKey(apiKey: string): Promise<{valid: boolean, error?: string}> {
    try {
      const openai = new OpenAI({ apiKey });
      // Make a simple API call to test the key
      await openai.models.list();
      return { valid: true };
    } catch (error: any) {
      console.error('OpenAI API key test failed:', error);
      
      // Determine the specific error type for better error messages
      let errorMessage = 'Unknown error validating OpenAI API key';
      
      if (error.status === 401) {
        errorMessage = 'Invalid API key. Please check your OpenAI key and try again.';
      } else if (error.status === 429) {
        errorMessage = 'Rate limit exceeded. Your OpenAI API key has reached its request limit or has insufficient quota.';
      } else if (error.status === 500) {
        errorMessage = 'OpenAI server error. Please try again later.';
      } else if (error.message) {
        errorMessage = `Error: ${error.message}`;
      }
      
      return { valid: false, error: errorMessage };
    }
  }
  
  /**
   * Test Gemini API key
   * Note: This is a simplified implementation since we don't have the actual Gemini client
   */
  private async testGeminiKey(apiKey: string): Promise<{valid: boolean, error?: string}> {
    try {
      // Actually validate the key with a Gemini API call
      const axios = require('axios');
      const response = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${apiKey}`,
        {
          contents: [{
            role: "user",
            parts: [{ text: "Hello" }]
          }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 10
          }
        },
        { timeout: 10000 }
      );

      if (response.data && response.data.candidates) {
        return { valid: true };
      }
      return { valid: false, error: 'Invalid response from Gemini API.' };
    } catch (error: any) {
      console.error('Gemini API key test failed:', error);
      let errorMessage = 'Unknown error validating Gemini API key';
      
      if (error.response?.status === 400) {
        if (error.response.data?.error?.message?.includes('API key')) {
          errorMessage = 'Invalid Gemini API key. Please check your key and try again.';
        } else {
          errorMessage = 'Invalid Gemini API key format or permissions.';
        }
      } else if (error.response?.status === 403) {
        errorMessage = 'Gemini API key does not have permission to access the service.';
      } else if (error.response?.status === 429) {
        errorMessage = 'Gemini API rate limit exceeded. Please try again later.';
      } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
        errorMessage = 'Network error: Unable to connect to Gemini API.';
      } else if (error.message) {
        errorMessage = `Error: ${error.message}`;
      }
      
      return { valid: false, error: errorMessage };
    }
  }

  /**
   * Test Anthropic API key
   * Note: This is a simplified implementation since we don't have the actual Anthropic client
   */
  private async testAnthropicKey(apiKey: string): Promise<{valid: boolean, error?: string}> {
    try {
      // For now, we'll just do a basic check to ensure the key exists and has valid format
      // In production, you would connect to the Anthropic API and validate the key
      if (apiKey && /^sk-ant-[a-zA-Z0-9]{32,}$/.test(apiKey.trim())) {
        // Here you would actually validate the key with an Anthropic API call
        return { valid: true };
      }
      return { valid: false, error: 'Invalid Anthropic API key format.' };
    } catch (error: any) {
      console.error('Anthropic API key test failed:', error);
      let errorMessage = 'Unknown error validating Anthropic API key';
      
      if (error.message) {
        errorMessage = `Error: ${error.message}`;
      }
      
      return { valid: false, error: errorMessage };
    }
  }

  /**
   * Get the resume data
   */
  public getResumeData(): string {
    const config = this.loadConfig();
    return config.resumeData || "";
  }

  /**
   * Set the resume data
   */
  public setResumeData(resumeData: string): void {
    this.updateConfig({ resumeData });
  }
  
  /**
   * Get the interview mode setting
   */
  public getInterviewMode(): boolean {
    const config = this.loadConfig();
    return config.interviewMode || false;
  }

  /**
   * Set the interview mode setting
   */
  public setInterviewMode(interviewMode: boolean): void {
    this.updateConfig({ interviewMode });
  }
  
  /**
   * Get the conversation history
   */
  public getConversationHistory(): Array<{role: string, content: string, timestamp: number}> {
    const config = this.loadConfig();
    return config.conversationHistory || [];
  }

  /**
   * Add a message to conversation history
   */
  public addToConversationHistory(role: string, content: string): void {
    const currentHistory = this.getConversationHistory();
    const newMessage = {
      role,
      content,
      timestamp: Date.now()
    };
    
    // Keep only last 50 messages to prevent config file from getting too large
    const updatedHistory = [...currentHistory, newMessage].slice(-50);
    this.updateConfig({ conversationHistory: updatedHistory });
  }

  /**
   * Clear conversation history
   */
  public clearConversationHistory(): void {
    this.updateConfig({ conversationHistory: [] });
  }

  /**
   * Get Google Speech API key
   */
  public getGoogleSpeechApiKey(): string {
    const config = this.loadConfig();
    return config.googleSpeechApiKey || "";
  }

  /**
   * Set Google Speech API key
   */
  public setGoogleSpeechApiKey(apiKey: string): void {
    this.updateConfig({ googleSpeechApiKey: apiKey });
  }

  /**
   * Get Google Speech usage setting
   */
  public getUseGoogleSpeech(): boolean {
    const config = this.loadConfig();
    return config.useGoogleSpeech || false;
  }

  /**
   * Set Google Speech usage setting
   */
  public setUseGoogleSpeech(useGoogleSpeech: boolean): void {
    this.updateConfig({ useGoogleSpeech });
  }

  /**
   * Validate Google Speech API key format
   */
  public isValidGoogleSpeechApiKey(apiKey: string): boolean {
    // Google Speech API keys are typically long alphanumeric strings
    return apiKey.trim().length >= 20 && /^[A-Za-z0-9_-]+$/.test(apiKey.trim());
  }

  /**
   * Clean up old backup files
   */
  private cleanupOldBackups(): void {
    try {
      const configDir = path.dirname(this.configPath);
      const configFileName = path.basename(this.configPath);
      
      // Find all backup files
      const files = fs.readdirSync(configDir);
      const backupFiles = files
        .filter(file => file.startsWith(`${configFileName}.backup.`))
        .map(file => ({
          name: file,
          path: path.join(configDir, file),
          timestamp: parseInt(file.split('.backup.')[1]) || 0
        }))
        .sort((a, b) => b.timestamp - a.timestamp); // Sort by timestamp, newest first
      
      // Keep only the latest 5 backup files
      const filesToDelete = backupFiles.slice(5);
      
      filesToDelete.forEach(file => {
        try {
          fs.unlinkSync(file.path);
          console.log(`Cleaned up old backup file: ${file.name}`);
        } catch (deleteError) {
          console.error(`Failed to delete backup file ${file.name}:`, deleteError);
        }
      });
      
      if (filesToDelete.length > 0) {
        console.log(`Cleaned up ${filesToDelete.length} old backup files`);
      }
    } catch (error) {
      console.error('Error cleaning up backup files:', error);
    }
  }
}

// Export a singleton instance
export const configHelper = new ConfigHelper();
