#!/bin/bash
# check-usb-audio.sh - Check if connected USB audio has both input and output

RASPI_HOST="max@lichen.local"

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║         USB AUDIO CAPABILITY CHECK                             ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

echo "Checking USB audio devices on Raspberry Pi..."
echo ""

# Get USB audio devices
USB_DEVICES=$(ssh "$RASPI_HOST" "lsusb | grep -i audio")

if [ -z "$USB_DEVICES" ]; then
    echo "✗ No USB audio devices found"
    echo ""
    echo "Please connect USB audio adapters and try again."
    exit 1
fi

echo "📍 Found USB audio devices:"
echo "$USB_DEVICES"
echo ""

# Check outputs
echo "🔊 OUTPUTS (Headphones/Speakers):"
ssh "$RASPI_HOST" "aplay -l | grep -A 2 'card'" || echo "  ✗ No output devices found"
echo ""

# Check inputs  
echo "🎤 INPUTS (Microphones):"
INPUT_OUTPUT=$(ssh "$RASPI_HOST" "arecord -l 2>/dev/null")
if echo "$INPUT_OUTPUT" | grep -q 'card'; then
    INPUT_COUNT=$(echo "$INPUT_OUTPUT" | grep -c 'card')
    echo "$INPUT_OUTPUT"
    echo ""
    echo "✓ Found $INPUT_COUNT input device(s) - system should work!"
else
    echo "$INPUT_OUTPUT"
    echo "  ✗ No input/microphone devices found"
    echo ""
    echo "╔════════════════════════════════════════════════════════════════╗"
    echo "║                    ⚠️  PROBLEM DETECTED                         ║"
    echo "╚════════════════════════════════════════════════════════════════╝"
    echo ""
    echo "Your USB audio adapter(s) do NOT have microphone input capability."
    echo ""
    echo "For Lichen to work, you need USB audio adapters that support:"
    echo "  • Headphone/speaker OUTPUT (for hearing remote participants)"
    echo "  • Microphone INPUT (for speaking to remote participants)"
    echo ""
    echo "These are often sold as:"
    echo "  • \"USB Sound Card with Mic\""
    echo "  • \"USB Audio Adapter 3.5mm Headset\""
    echo "  • \"USB External Sound Card TRRS\""
    echo ""
    echo "Look for adapters with:"
    echo "  • 2 separate 3.5mm jacks (one mic, one headphone), OR"
    echo "  • 1 TRRS jack (4-pole combined headset connector)"
    echo ""
    echo "Current adapter appears to be OUTPUT-ONLY (no microphone)."
    echo ""
fi

echo ""
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║                    CHECK COMPLETE                              ║"
echo "╚════════════════════════════════════════════════════════════════╝"

