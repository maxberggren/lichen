#!/bin/bash
# recover-audio.sh - Force-load ALSA capture devices that PulseAudio missed
#
# Some USB audio adapters use jack detection and don't expose their capture
# interface to PulseAudio when connected to another audio output (not a headset).
# This script finds those devices and force-loads them.

set -e

# Optional: run on remote Raspberry Pi
REMOTE_HOST="${1:-}"

run_cmd() {
    if [ -n "$REMOTE_HOST" ]; then
        ssh "$REMOTE_HOST" "$1"
    else
        eval "$1"
    fi
}

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║         LICHEN AUDIO SOURCE RECOVERY                          ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

if [ -n "$REMOTE_HOST" ]; then
    echo "Running on remote host: $REMOTE_HOST"
    echo ""
fi

# Get ALSA capture devices
echo "📍 Checking ALSA capture devices..."
ALSA_CAPTURES=$(run_cmd "arecord -l 2>/dev/null" || true)

if [ -z "$ALSA_CAPTURES" ] || echo "$ALSA_CAPTURES" | grep -q "no soundcards"; then
    echo "✗ No ALSA capture devices found"
    echo ""
    echo "This means the USB audio adapter is truly not exposing capture capability."
    echo "You'll need different hardware (USB adapter with separate mic/headphone jacks)."
    exit 1
fi

echo "$ALSA_CAPTURES"
echo ""

# Parse ALSA card numbers with capture capability
ALSA_CARDS=$(echo "$ALSA_CAPTURES" | grep -oP 'card \K\d+' | sort -u)

# Get PulseAudio source cards
echo "📍 Checking PulseAudio sources..."
PA_SOURCES=$(run_cmd "pactl list sources" 2>/dev/null || true)
PA_CARDS=$(echo "$PA_SOURCES" | grep -oP 'alsa\.card = "\K\d+' | sort -u || true)

echo "ALSA capture cards: $ALSA_CARDS"
echo "PulseAudio source cards: ${PA_CARDS:-none}"
echo ""

# Find missing cards
MISSING_CARDS=""
for card in $ALSA_CARDS; do
    if ! echo "$PA_CARDS" | grep -qw "$card"; then
        MISSING_CARDS="$MISSING_CARDS $card"
    fi
done

if [ -z "$MISSING_CARDS" ]; then
    echo "✓ All ALSA capture devices are available in PulseAudio!"
    echo ""
    echo "Current sources:"
    run_cmd "pactl list sources short"
    exit 0
fi

echo "⚠️  Found ALSA capture devices missing from PulseAudio: $MISSING_CARDS"
echo ""

# Recover each missing card
for card in $MISSING_CARDS; do
    # Get card info from arecord -l
    CARD_INFO=$(echo "$ALSA_CAPTURES" | grep "card $card:")
    CARD_NAME=$(echo "$CARD_INFO" | grep -oP 'card \d+: \K\S+' || echo "Card$card")
    CARD_DESC=$(echo "$CARD_INFO" | grep -oP '\[\K[^\]]+' | head -1 || echo "USB Audio Device")
    
    # Get first device number for this card
    DEVICE=$(echo "$ALSA_CAPTURES" | grep "card $card:" | grep -oP 'device \K\d+' | head -1 || echo "0")
    
    DEVICE_SPEC="hw:$card,$DEVICE"
    SOURCE_NAME="lichen_recovered_${CARD_NAME}_${card}"
    DESCRIPTION="${CARD_DESC} (Recovered)"
    
    echo "🔧 Recovering: $DEVICE_SPEC ($CARD_DESC)..."
    
    # Try to load the source
    CMD="pactl load-module module-alsa-source device=$DEVICE_SPEC source_name=$SOURCE_NAME source_properties=device.description=\"$DESCRIPTION\" tsched=0"
    
    if MODULE_ID=$(run_cmd "$CMD" 2>&1); then
        echo "   ✓ Loaded as module $MODULE_ID"
        echo "   Source name: $SOURCE_NAME"
    else
        echo "   ✗ Failed: $MODULE_ID"
        echo ""
        echo "   If you see 'Device or resource busy', try:"
        echo "   1. Stop any apps using audio"
        echo "   2. Run: pactl unload-module module-alsa-card"
        echo "   3. Re-run this script"
    fi
    echo ""
done

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║                    RECOVERY COMPLETE                           ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""
echo "Current sources:"
run_cmd "pactl list sources short"
echo ""
echo "If you see your recovered sources, they're ready to use in Lichen!"


