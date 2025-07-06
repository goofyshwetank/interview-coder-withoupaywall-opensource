#!/bin/bash

# System Audio Capture Setup Script for Interview Coder
# This script helps set up system audio capture on different platforms

echo "============================================"
echo "Interview Coder - System Audio Setup"
echo "============================================"
echo

# Detect platform
PLATFORM=$(uname -s)
echo "Detected platform: $PLATFORM"
echo

case "$PLATFORM" in
    "Linux")
        echo "Setting up system audio capture for Linux..."
        echo

        # Check if PulseAudio is available
        if ! command -v pactl &> /dev/null; then
            echo "❌ PulseAudio not found. Installing pulseaudio-utils..."
            
            # Detect package manager and install
            if command -v apt &> /dev/null; then
                sudo apt update && sudo apt install -y pulseaudio-utils
            elif command -v yum &> /dev/null; then
                sudo yum install -y pulseaudio-utils
            elif command -v dnf &> /dev/null; then
                sudo dnf install -y pulseaudio-utils
            elif command -v pacman &> /dev/null; then
                sudo pacman -S --noconfirm pulseaudio
            else
                echo "❌ Could not detect package manager. Please install pulseaudio-utils manually."
                exit 1
            fi
        else
            echo "✅ PulseAudio found"
        fi
        echo

        # Check if virtual microphone already exists
        if pactl list sources | grep -q "Virtual_Microphone"; then
            echo "✅ Virtual microphone already exists"
        else
            echo "🔧 Creating virtual microphone for system audio capture..."
            
            # Create virtual microphone from system monitor
            pactl load-module module-remap-source \
                master=@DEFAULT_MONITOR@ \
                source_name=virtmic \
                source_properties=device.description=Virtual_Microphone
                
            if [ $? -eq 0 ]; then
                echo "✅ Virtual microphone created successfully!"
                echo "   Device name: Virtual_Microphone"
            else
                echo "❌ Failed to create virtual microphone"
                exit 1
            fi
        fi
        echo

        # Set the virtual microphone as default source
        echo "🔧 Setting virtual microphone as default input..."
        pactl set-default-source virtmic
        
        if [ $? -eq 0 ]; then
            echo "✅ Virtual microphone set as default input"
        else
            echo "⚠️  Could not set as default, but the device is available"
        fi
        echo

        echo "🎉 Linux setup complete!"
        echo
        echo "📋 What was configured:"
        echo "   • Virtual microphone created from system audio"
        echo "   • Device name: Virtual_Microphone"
        echo "   • Now you can use microphone access in the Interview Coder app"
        echo
        echo "🔄 To undo this setup, run:"
        echo "   pactl unload-module \$(pactl list modules short | grep 'module-remap-source' | awk '{print \$1}')"
        ;;

    "Darwin")
        echo "Setting up system audio capture for macOS..."
        echo
        
        # Check if Homebrew is available
        if ! command -v brew &> /dev/null; then
            echo "❌ Homebrew not found. Please install Homebrew first:"
            echo "   /bin/bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\""
            echo
            exit 1
        else
            echo "✅ Homebrew found"
        fi
        echo

        # Check if BlackHole is installed
        if ! brew list blackhole-2ch &> /dev/null; then
            echo "🔧 Installing BlackHole audio driver..."
            brew install blackhole-2ch
            
            if [ $? -eq 0 ]; then
                echo "✅ BlackHole installed successfully!"
            else
                echo "❌ Failed to install BlackHole"
                exit 1
            fi
        else
            echo "✅ BlackHole already installed"
        fi
        echo

        echo "🎉 macOS setup complete!"
        echo
        echo "📋 Next steps:"
        echo "   1. Open Audio MIDI Setup (Applications > Utilities)"
        echo "   2. Create a Multi-Output Device:"
        echo "      • Click '+' and select 'Create Multi-Output Device'"
        echo "      • Check both your speakers and BlackHole 2ch"
        echo "      • Set this as your default output in System Preferences > Sound"
        echo "   3. In Interview Coder, when prompted for microphone access:"
        echo "      • Select 'BlackHole 2ch' as the input device"
        echo
        echo "🔄 To uninstall BlackHole:"
        echo "   brew uninstall blackhole-2ch"
        ;;

    "MINGW"*|"MSYS"*|"CYGWIN"*)
        echo "Setting up system audio capture for Windows..."
        echo
        
        echo "📋 Manual setup required for Windows:"
        echo
        echo "Option 1 - Enable Stereo Mix (if available):"
        echo "   1. Right-click on sound icon in system tray"
        echo "   2. Select 'Open Sound settings'"
        echo "   3. Click 'Sound Control Panel'"
        echo "   4. Go to 'Recording' tab"
        echo "   5. Right-click in empty space and select 'Show Disabled Devices'"
        echo "   6. Right-click 'Stereo Mix' and select 'Enable'"
        echo "   7. Set as default recording device"
        echo
        echo "Option 2 - Install VB-Audio Virtual Cable (recommended):"
        echo "   1. Download from: https://vb-audio.com/Cable/"
        echo "   2. Install the CABLE software"
        echo "   3. Set 'CABLE Output' as your default playback device"
        echo "   4. Set 'CABLE Input' as your default recording device"
        echo "   5. You may need to also set up audio routing for your speakers"
        echo
        echo "Option 3 - Install VoiceMeeter (advanced):"
        echo "   1. Download from: https://vb-audio.com/Voicemeeter/"
        echo "   2. Install VoiceMeeter"
        echo "   3. Configure audio routing in VoiceMeeter"
        echo "   4. Set VoiceMeeter as default audio device"
        echo
        echo "⚠️  Note: These tools require administrative privileges to install"
        ;;

    *)
        echo "❌ Unsupported platform: $PLATFORM"
        echo "Please refer to the manual setup instructions in the app."
        exit 1
        ;;
esac

echo
echo "============================================"
echo "Setup Complete!"
echo "============================================"
echo
echo "🚀 Next steps:"
echo "   1. Restart Interview Coder app"
echo "   2. Go to Interview Mode"
echo "   3. Configure your Gemini API key (free at: https://makersuite.google.com/app/apikey)"
echo "   4. Click 'Start System Audio Capture'"
echo "   5. Grant microphone permissions when prompted"
echo
echo "💡 The app will now be able to listen to system audio and generate"
echo "   AI-powered responses for interview questions!"
echo
echo "📞 If you encounter issues:"
echo "   • Use the 'Test System Audio' button in the app"
echo "   • Check the diagnostics panel for troubleshooting info"
echo "   • Manual input is always available as a fallback"
echo