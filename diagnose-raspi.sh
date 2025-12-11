#!/bin/bash
# diagnose-raspi.sh - Diagnose audio setup on Raspberry Pi

RASPI_HOST="max@lichen.local"

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║         LICHEN RASPBERRY PI DIAGNOSTICS                        ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

echo "→ Checking USB devices..."
ssh "$RASPI_HOST" "lsusb | grep -i audio || echo 'No USB audio devices found in lsusb'"
echo ""

echo "→ Checking if PulseAudio is running..."
ssh "$RASPI_HOST" "pgrep -a pulseaudio || echo 'PulseAudio not running'"
echo ""

echo "→ Checking PulseAudio sinks..."
ssh "$RASPI_HOST" "pactl list sinks short 2>&1 || echo 'Cannot connect to PulseAudio'"
echo ""

echo "→ Checking PulseAudio sources..."
ssh "$RASPI_HOST" "pactl list sources short 2>&1 || echo 'Cannot connect to PulseAudio'"
echo ""

echo "→ Checking audio kernel modules..."
ssh "$RASPI_HOST" "lsmod | grep -i snd"
echo ""

echo "→ Checking ALSA devices..."
ssh "$RASPI_HOST" "aplay -l 2>&1 || echo 'ALSA not available'"
echo ""

echo "→ Checking for USB audio in dmesg (last 20 lines)..."
ssh "$RASPI_HOST" "dmesg | grep -i 'usb.*audio' | tail -20 || echo 'No USB audio messages in dmesg'"
echo ""

echo "→ Checking user audio groups..."
ssh "$RASPI_HOST" "groups"
echo ""

echo "→ Testing pactl as user max..."
ssh "$RASPI_HOST" "XDG_RUNTIME_DIR=/run/user/\$(id -u) pactl info 2>&1 | head -10"
echo ""

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║                    DIAGNOSTICS COMPLETE                        ║"
echo "╚════════════════════════════════════════════════════════════════╝"





