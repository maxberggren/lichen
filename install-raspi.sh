#!/bin/bash
# install-raspi.sh - Deploy lichen-headless to Raspberry Pi
set -e

RASPI_HOST="max@lichen.local"
INSTALL_DIR="/home/max/lichen"
SERVICE_NAME="lichen-headless"

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║         LICHEN RASPBERRY PI INSTALLER                          ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# Check if we can reach the Pi
echo "→ Testing connection to ${RASPI_HOST}..."
if ! ssh -o ConnectTimeout=5 "$RASPI_HOST" "echo 'Connection OK'" &>/dev/null; then
    echo "✗ Error: Cannot connect to ${RASPI_HOST}"
    echo "  Make sure the Raspberry Pi is powered on and connected to the network"
    exit 1
fi
echo "✓ Connected to Raspberry Pi"
echo ""

# Check and install PulseAudio if needed
echo "→ Checking PulseAudio installation..."
if ! ssh "$RASPI_HOST" "command -v pactl >/dev/null 2>&1"; then
    echo "  PulseAudio not found. Installing..."
    ssh "$RASPI_HOST" "sudo apt-get update -qq && sudo apt-get install -y -qq pulseaudio pulseaudio-utils"What It Does
    Transform any room into a professional hybrid meeting space:
    🎧 Everyone gets their own headphones — Crystal-clear audio for each in-room participant, with individual volume control
    🎤 Everyone has a voice — All room microphones are mixed together, so remote participants hear everyone equally
    🔌 Hot-plug support — People join and leave the room seamlessly, just plug in or unplug
    💻 Works with everything — Zoom, Teams, Meet, Discord — any app that uses a microphone and speakers
    echo "  ✓ PulseAudio installed"
    
    echo "→ Configuring PulseAudio..."
    ssh "$RASPI_HOST" "systemctl --user enable pulseaudio.service pulseaudio.socket 2>/dev/null || true"
    ssh "$RASPI_HOST" "systemctl --user start pulseaudio.service 2>/dev/null || true"
    sleep 2
    echo "  ✓ PulseAudio configured and started"
else
    echo "  ✓ PulseAudio already installed"
    # Make sure it's running
    if ! ssh "$RASPI_HOST" "systemctl --user is-active pulseaudio.service >/dev/null 2>&1"; then
        echo "→ Starting PulseAudio..."
        ssh "$RASPI_HOST" "systemctl --user start pulseaudio.service 2>/dev/null || true"
        sleep 1
    fi
fi
echo ""

# Configure PulseAudio for Lichen (disable auto-suspend)
echo "→ Configuring PulseAudio for Lichen..."
ssh "$RASPI_HOST" 'mkdir -p ~/.config/pulse && cat > ~/.config/pulse/default.pa << "PULSECONFIG"
# Lichen PulseAudio Configuration
# Include the default PulseAudio configuration
.include /etc/pulse/default.pa

# Disable auto-suspend - required for loopback audio to flow properly
# Without this, sinks stay SUSPENDED and loopbacks do not pass audio
unload-module module-suspend-on-idle

# Ensure USB audio devices are detected with low latency
.ifexists module-udev-detect.so
load-module module-udev-detect tsched=0
.endif
PULSECONFIG'
echo "  ✓ PulseAudio configured (auto-suspend disabled)"

# Restart PulseAudio to apply config
echo "→ Restarting PulseAudio..."
ssh "$RASPI_HOST" "systemctl --user restart pulseaudio.service 2>/dev/null || true"
sleep 2
echo "  ✓ PulseAudio restarted"
echo ""

# Create installation directory
echo "→ Creating installation directory..."
ssh "$RASPI_HOST" "mkdir -p $INSTALL_DIR"
echo "✓ Directory created: $INSTALL_DIR"
echo ""

# Copy the main script
echo "→ Copying lichen-headless.sh..."
scp -q lichen-headless.sh "${RASPI_HOST}:${INSTALL_DIR}/"
ssh "$RASPI_HOST" "chmod +x ${INSTALL_DIR}/lichen-headless.sh"
echo "✓ Script installed"
echo ""

# Create systemd service
echo "→ Creating systemd service..."
ssh "$RASPI_HOST" "mkdir -p ~/.config/systemd/user"
ssh "$RASPI_HOST" "tee ~/.config/systemd/user/${SERVICE_NAME}.service > /dev/null" << 'EOF'
[Unit]
Description=Lichen Headless Audio Mixer
After=pulseaudio.service sound.target
Requires=pulseaudio.service

[Service]
Type=simple
# Wait for USB audio devices to be detected on boot
ExecStartPre=/bin/sleep 5
ExecStart=/home/max/lichen/lichen-headless.sh
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=default.target
EOF

ssh "$RASPI_HOST" "systemctl --user daemon-reload"
echo "✓ Systemd service created"
echo ""

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║                    INSTALLATION COMPLETE                       ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""
echo "Next steps:"
echo ""
echo "  make setup      # Configure bridge adapter (first time)"
echo "  make start      # Start the service"
echo "  make logs       # Watch logs"
echo ""
echo "Run 'make' to see all available commands."
echo ""
