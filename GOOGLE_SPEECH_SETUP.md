# Google Speech-to-Text API Setup Guide

This guide will help you set up Google Speech-to-Text API for reliable speech recognition in the Interview Assistant.

## Why Google Speech API?

- **More Reliable**: Better accuracy than browser-based speech recognition
- **Works Everywhere**: No browser compatibility issues
- **Professional Quality**: Enterprise-grade speech recognition
- **Real-time Processing**: Low latency for interview scenarios

## Step-by-Step Setup

### 1. Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click "Select a project" → "New Project"
3. Enter a project name (e.g., "Interview Assistant")
4. Click "Create"

### 2. Enable Speech-to-Text API

1. In your project, go to "APIs & Services" → "Library"
2. Search for "Speech-to-Text API"
3. Click on it and press "Enable"

### 3. Create API Credentials

**Option A: Create API Key (Simplest)**

1. Go to "APIs & Services" → "Credentials"
2. Click "Create Credentials" → "API Key"
3. Copy the generated API key
4. Click "Restrict Key" to limit usage to Speech-to-Text API only:
   - Select "Restrict key"
   - Under "API restrictions", select "Speech-to-Text API"
   - Click "Save"

**Option B: Create a Service Account (More Secure)**

1. Go to "APIs & Services" → "Credentials"
2. Click "Create Credentials" → "Service Account"
3. Fill in the service account details:
   - **Service account name**: `speech-api-service`
   - **Service account ID**: Will auto-generate
   - **Description**: `Service account for Speech-to-Text API`
4. Click "Create and Continue"
5. For "Grant this service account access to project":
   - Select "Cloud Speech-to-Text API User" role
   - Click "Continue"
6. Click "Done"
7. In the service accounts list, click on your new service account
8. Go to the "Keys" tab
9. Click "Add Key" → "Create new key"
10. Choose "JSON" format
11. Click "Create" - this will download a JSON file
12. **Important**: Open the JSON file and copy the `private_key_id` value - this is your API key

**Option C: Use OAuth 2.0 Client ID (Alternative)**

1. Go to "APIs & Services" → "Credentials"
2. Click "Create Credentials" → "OAuth client ID"
3. If prompted, configure the OAuth consent screen first
4. Choose "Desktop application" as the application type
5. Give it a name like "Interview Assistant Speech API"
6. Click "Create"
7. Copy the "Client ID" - this will be your API key

### 4. Configure the App

1. Open the Interview Assistant app
2. Go to Interview Mode
3. Click the "🎤 Google Speech" button
4. Paste your API key in the "Google Speech API Key" field:
   - For API Key: Use the generated API key
   - For Service Account: Use the `private_key_id` from the JSON file
   - For OAuth: Use the Client ID
5. Check "Use Google Speech API"
6. Click "Test API Key" to verify it works
7. Click "Save Settings"

## Alternative: Use Google Cloud CLI

If you prefer command line setup:

```bash
# Install Google Cloud CLI
# Windows: Download from https://cloud.google.com/sdk/docs/install
# macOS: brew install google-cloud-sdk
# Linux: curl https://sdk.cloud.google.com | bash

# Login and set project
gcloud auth login
gcloud config set project YOUR_PROJECT_ID

# Enable Speech-to-Text API
gcloud services enable speech.googleapis.com

# Create API key
gcloud services api-keys create --display-name="Speech API Key"

# List your API keys to get the key value
gcloud services api-keys list
```

## Usage

Once configured:

1. Upload your resume in Interview Mode
2. Click "🎤 Start Google Speech" (instead of regular "Start Listening")
3. The app will use Google's speech recognition for better accuracy
4. Speak clearly and the app will transcribe interviewer questions
5. AI will generate responses based on your resume and the questions

## Pricing

Google Speech-to-Text API pricing (as of 2024):
- **Free Tier**: 60 minutes per month
- **Paid**: $0.006 per 15 seconds after free tier
- **Interview Usage**: Typically 1-2 hours for a full interview session

## Troubleshooting

### API Key Issues
- **Invalid API Key**: Make sure you copied the correct value
- **API Not Enabled**: Ensure Speech-to-Text API is enabled in your project
- **Quota Exceeded**: Check your usage in Google Cloud Console
- **Service Account Permissions**: Ensure the service account has "Cloud Speech-to-Text API User" role

### Permission Issues
- **Microphone Access**: Allow microphone permissions when prompted
- **Browser Security**: The app needs microphone access to record audio

### Network Issues
- **Internet Required**: Google Speech API requires internet connection
- **Firewall**: Ensure the app can access `speech.googleapis.com`

## Security Notes

- API keys are stored locally on your device
- Never share your API key publicly
- Consider restricting the API key to specific IP addresses if needed
- Monitor usage in Google Cloud Console
- For production use, consider using Application Default Credentials

## Fallback Options

If Google Speech API is unavailable:
1. **Manual Input**: Type questions manually (most reliable)
2. **Browser Speech**: Use built-in browser speech recognition
3. **Offline Mode**: Prepare responses in advance

## Support

For Google Cloud issues:
- [Google Cloud Documentation](https://cloud.google.com/speech-to-text/docs)
- [Google Cloud Support](https://cloud.google.com/support)
- [Service Accounts Guide](https://cloud.google.com/iam/docs/service-accounts)

For app issues:
- Check the Diagnostics panel in Interview Mode
- Use Manual Input as a reliable alternative 