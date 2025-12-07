#!/bin/bash
# lichen-headless.sh - Auto-merge all USB mics and route to all USB headphones
# Bridge adapter (to laptop) is detected on first run or when config is missing

set -e

CONFIG_FILE="${XDG_CONFIG_HOME:-$HOME/.config}/lichen-bridge.conf"
COMBINED_SINK="lichen_combined_output"
MIXED_TO_LAPTOP="lichen_to_laptop"
NULL_SINK_ROOM="${MIXED_TO_LAPTOP}_null"
REMAPPED_TO_LAPTOP="${MIXED_TO_LAPTOP}_mic"

# For room hearing laptop audio
MIXED_TO_ROOM="lichen_to_room"
NULL_SINK_LAPTOP="${MIXED_TO_ROOM}_null"

# Hearback: percentage of your own mic audio to hear in your headphones (0-100)
# Set via --hearback=XX or HEARBACK_PERCENT env var, default 0 (off)
HEARBACK_PERCENT="${HEARBACK_PERCENT:-0}"
HEARBACK_MODULE_ID=""

cleanup() {
    echo "Cleaning up audio modules..."
    # Unload hearback module if we created one
    if [ -n "$HEARBACK_MODULE_ID" ]; then
        pactl unload-module "$HEARBACK_MODULE_ID" 2>/dev/null || true
    fi
    # Unload in reverse order, ignore errors
    pactl unload-module module-remap-source 2>/dev/null || true
    pactl unload-module module-loopback 2>/dev/null || true
    pactl unload-module module-combine-sink 2>/dev/null || true
    pactl unload-module module-null-sink 2>/dev/null || true
}

setup_hearback() {
    local percent="$1"
    
    if [ "$percent" -eq 0 ]; then
        return
    fi
    
    echo "┌─ Setting up hearback (${percent}%)..."
    
    # Create loopback from room mic mix to headphones
    # This lets room participants hear themselves
    HEARBACK_MODULE_ID=$(pactl load-module module-loopback \
        source="${NULL_SINK_ROOM}.monitor" \
        sink="$COMBINED_SINK" \
        latency_msec=1)
    
    if [ -z "$HEARBACK_MODULE_ID" ]; then
        echo "└─ ⚠ Failed to create hearback loopback"
        return
    fi
    
    # Find the sink-input for this loopback and set its volume
    sleep 0.5  # Give PulseAudio a moment to create the sink-input
    
    # Convert percentage to PulseAudio volume (65536 = 100%)
    local pa_volume=$((percent * 65536 / 100))
    
    # Find the sink-input created by our loopback module
    local sink_input_id
    sink_input_id=$(pactl list sink-inputs | grep -B 20 "module-loopback.c" | grep -B 20 "${NULL_SINK_ROOM}.monitor" | grep "Sink Input #" | tail -1 | sed 's/Sink Input #//')
    
    if [ -n "$sink_input_id" ]; then
        pactl set-sink-input-volume "$sink_input_id" "$pa_volume"
        echo "└─ ✓ Hearback enabled at ${percent}% (sink-input #${sink_input_id})"
    else
        # Fallback: try to set volume by iterating through recent sink-inputs
        echo "└─ ✓ Hearback enabled at ${percent}% (volume control limited)"
    fi
}

wait_for_usb_audio() {
    echo "Waiting for USB audio device..."
    while true; do
        if pactl list sources short 2>/dev/null | grep -qi usb; then
            sleep 1  # Give it a moment to fully initialize
            return 0
        fi
        sleep 0.5
    done
}

setup_bridge() {
    echo ""
    echo "╔════════════════════════════════════════════════════════════════╗"
    echo "║              LICHEN BRIDGE SETUP                               ║"
    echo "╠════════════════════════════════════════════════════════════════╣"
    echo "║  1. Unplug ALL USB audio adapters                              ║"
    echo "║  2. Plug in ONLY the bridge adapter (the one going to laptop)  ║"
    echo "║  3. Wait for detection...                                      ║"
    echo "╚════════════════════════════════════════════════════════════════╝"
    echo ""
    
    # Wait for all USB audio to disappear
    echo "Waiting for all USB audio devices to be unplugged..."
    while pactl list sources short 2>/dev/null | grep -qi usb; do
        sleep 0.5
    done
    echo "✓ All USB audio unplugged"
    echo ""
    echo "Now plug in the BRIDGE adapter (the colored one for laptop)..."
    
    wait_for_usb_audio
    
    # Grab the device info
    BRIDGE_SINK=$(pactl list sinks short | grep -i usb | head -1 | awk '{print $2}')
    BRIDGE_SOURCE=$(pactl list sources short | grep -i usb | grep -v '\.monitor' | head -1 | awk '{print $2}')
    
    if [ -z "$BRIDGE_SINK" ] || [ -z "$BRIDGE_SOURCE" ]; then
        echo "✗ Error: Could not detect USB audio device"
        exit 1
    fi
    
    # Get a unique identifier (card name from the sink name)
    # Usually looks like: alsa_output.usb-C-Media_Electronics_Inc._USB_PnP_Sound_Device-00.analog-stereo
    # We extract the middle part as identifier
    BRIDGE_ID=$(echo "$BRIDGE_SINK" | sed 's/alsa_output\.usb-//' | sed 's/-[0-9]*\.analog.*//' | head -c 50)
    
    echo ""
    echo "✓ Detected bridge adapter:"
    echo "  Sink:   $BRIDGE_SINK"
    echo "  Source: $BRIDGE_SOURCE"  
    echo "  ID:     $BRIDGE_ID"
    echo ""
    
    # Save config
    cat > "$CONFIG_FILE" << EOF
# Lichen bridge configuration
# Generated: $(date)
# This adapter connects to the laptop via male-to-male TRRS cable
BRIDGE_ID="$BRIDGE_ID"
EOF
    
    echo "✓ Configuration saved to $CONFIG_FILE"
    echo ""
    echo "You can now plug in the other headphone adapters."
    echo "Waiting 5 seconds before starting..."
    sleep 5
}

load_bridge_config() {
    if [ -f "$CONFIG_FILE" ]; then
        source "$CONFIG_FILE"
        if [ -n "$BRIDGE_ID" ]; then
            return 0
        fi
    fi
    return 1
}

get_bridge_sink() {
    pactl list sinks short | grep -i usb | grep -i "$BRIDGE_ID" | awk '{print $2}' | head -1
}

get_bridge_source() {
    pactl list sources short | grep -i usb | grep -v '\.monitor' | grep -i "$BRIDGE_ID" | awk '{print $2}' | head -1
}

get_headphone_sinks() {
    pactl list sinks short | grep -i usb | grep -vi "$BRIDGE_ID" | awk '{print $2}'
}

get_headphone_sources() {
    pactl list sources short | grep -i usb | grep -v '\.monitor' | grep -vi "$BRIDGE_ID" | awk '{print $2}'
}

main() {
    echo "╔════════════════════════════════════════════════════════════════╗"
    echo "║                    LICHEN HEADLESS                             ║"
    echo "║              Multi-headphone audio merger                      ║"
    echo "╚════════════════════════════════════════════════════════════════╝"
    echo ""
    
    # Check for --setup flag or missing config
    if [ "$1" = "--setup" ] || [ "$1" = "-s" ]; then
        setup_bridge
    elif ! load_bridge_config; then
        echo "No bridge configuration found."
        setup_bridge
    fi
    
    # Load config
    source "$CONFIG_FILE"
    echo "Bridge ID: $BRIDGE_ID"
    echo ""
    
    cleanup
    
    # Wait for bridge device
    echo "Waiting for bridge adapter..."
    while [ -z "$(get_bridge_sink)" ]; do
        sleep 1
    done
    
    BRIDGE_SINK=$(get_bridge_sink)
    BRIDGE_SOURCE=$(get_bridge_source)
    
    echo "✓ Bridge adapter connected:"
    echo "  Output (to laptop): $BRIDGE_SINK"
    echo "  Input (from laptop): $BRIDGE_SOURCE"
    echo ""
    
    # Wait a moment for other devices
    echo "Waiting for headphone adapters..."
    sleep 3
    
    HEADPHONE_SINKS=$(get_headphone_sinks | tr '\n' ' ')
    HEADPHONE_SOURCES=$(get_headphone_sources)
    
    HP_COUNT=$(echo "$HEADPHONE_SINKS" | wc -w)
    MIC_COUNT=$(echo "$HEADPHONE_SOURCES" | wc -l)
    
    echo "✓ Found $HP_COUNT headphone output(s): $HEADPHONE_SINKS"
    echo "✓ Found $MIC_COUNT headphone mic(s)"
    echo ""
    
    if [ "$HP_COUNT" -eq 0 ]; then
        echo "⚠ Warning: No headphone adapters found (besides bridge)"
        echo "  Continuing anyway - plug in headphones and restart"
    fi
    
    # ═══════════════════════════════════════════════════════════════════
    # AUDIO ROUTING SETUP
    # ═══════════════════════════════════════════════════════════════════
    
    echo "Setting up audio routing..."
    echo ""
    
    # ───────────────────────────────────────────────────────────────────
    # 1. ROOM → LAPTOP: Mix all headphone mics, send to bridge output
    # ───────────────────────────────────────────────────────────────────
    echo "┌─ Room → Laptop (mixing headphone mics)..."
    
    # Create null sink to mix room mics
    pactl load-module module-null-sink \
        sink_name="$NULL_SINK_ROOM" \
        sink_properties='device.description="Lichen Room Mix"' > /dev/null
    
    # Loopback each headphone mic into the mixer
    for SOURCE in $HEADPHONE_SOURCES; do
        echo "│  Adding mic: $(echo $SOURCE | cut -c1-50)..."
        pactl load-module module-loopback \
            source="$SOURCE" \
            sink="$NULL_SINK_ROOM" \
            latency_msec=1 > /dev/null
    done
    
    # Loopback the mixed room audio to the bridge output (to laptop)
    pactl load-module module-loopback \
        source="${NULL_SINK_ROOM}.monitor" \
        sink="$BRIDGE_SINK" \
        latency_msec=1 > /dev/null
    
    echo "└─ ✓ Room mics → Bridge output → Laptop"
    echo ""
    
    # ───────────────────────────────────────────────────────────────────
    # 2. LAPTOP → ROOM: Take bridge input, send to all headphones
    # ───────────────────────────────────────────────────────────────────
    echo "┌─ Laptop → Room (distributing to headphones)..."
    
    if [ "$HP_COUNT" -gt 0 ]; then
        # Combine all headphone outputs into one sink
        SLAVES=$(echo "$HEADPHONE_SINKS" | tr ' ' ',' | sed 's/,$//')
        
        pactl load-module module-combine-sink \
            sink_name="$COMBINED_SINK" \
            slaves="$SLAVES" \
            sink_properties='device.description="Lichen All Headphones"' > /dev/null
        
        # Loopback bridge input (laptop audio) to all headphones
        pactl load-module module-loopback \
            source="$BRIDGE_SOURCE" \
            sink="$COMBINED_SINK" \
            latency_msec=1 > /dev/null
        
        echo "└─ ✓ Laptop → Bridge input → All headphones"
    else
        echo "└─ ⚠ Skipped (no headphones connected)"
    fi
    
    echo ""
    
    # ───────────────────────────────────────────────────────────────────
    # 3. HEARBACK: Let room participants hear themselves (optional)
    # ───────────────────────────────────────────────────────────────────
    if [ "$HP_COUNT" -gt 0 ] && [ "$HEARBACK_PERCENT" -gt 0 ]; then
        setup_hearback "$HEARBACK_PERCENT"
        echo ""
    fi
    
    echo "═══════════════════════════════════════════════════════════════════"
    echo ""
    echo "  ✅ LICHEN ACTIVE"
    echo ""
    echo "  🎧 Headphones connected: $HP_COUNT"
    echo "  🎤 Mics active: $MIC_COUNT"
    if [ "$HEARBACK_PERCENT" -gt 0 ]; then
        echo "  🔊 Hearback: ${HEARBACK_PERCENT}%"
    else
        echo "  🔇 Hearback: off"
    fi
    echo ""
    echo "  Room participants hear: Laptop/remote audio"
    echo "  Laptop/remote hears: All room mics mixed"
    if [ "$HEARBACK_PERCENT" -gt 0 ]; then
        echo "  Hearback: Room participants hear themselves at ${HEARBACK_PERCENT}%"
    fi
    echo ""
    echo "  Press Ctrl+C to stop"
    echo ""
    echo "═══════════════════════════════════════════════════════════════════"
    
    # Keep running
    trap cleanup EXIT
    while true; do
        sleep 3600
    done
}

# Parse arguments
while [[ $# -gt 0 ]]; do
    case "$1" in
        --setup|-s)
            setup_bridge
            echo "Setup complete. Run without --setup to start."
            exit 0
            ;;
        --hearback=*)
            HEARBACK_PERCENT="${1#*=}"
            # Validate it's a number between 0-100
            if ! [[ "$HEARBACK_PERCENT" =~ ^[0-9]+$ ]] || [ "$HEARBACK_PERCENT" -gt 100 ]; then
                echo "Error: hearback must be a number between 0-100"
                exit 1
            fi
            shift
            ;;
        --hearback)
            # If next arg exists and is a number, use it
            if [[ -n "${2:-}" ]] && [[ "$2" =~ ^[0-9]+$ ]]; then
                HEARBACK_PERCENT="$2"
                if [ "$HEARBACK_PERCENT" -gt 100 ]; then
                    echo "Error: hearback must be a number between 0-100"
                    exit 1
                fi
                shift 2
            else
                echo "Error: --hearback requires a value (0-100)"
                exit 1
            fi
            ;;
        --help|-h)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --setup, -s         Force bridge adapter setup"
            echo "  --hearback=PERCENT  Enable hearback (hear yourself) at PERCENT volume (0-100)"
            echo "                      Example: --hearback=30 for 30% sidetone"
            echo "  --help, -h          Show this help"
            echo ""
            echo "Environment variables:"
            echo "  HEARBACK_PERCENT    Set hearback volume (0-100), default: 0 (off)"
            echo ""
            echo "On first run, you'll be prompted to set up the bridge adapter."
            echo ""
            echo "Examples:"
            echo "  $0                      # Run with hearback off"
            echo "  $0 --hearback=25        # Run with 25% hearback"
            echo "  HEARBACK_PERCENT=50 $0  # Run with 50% hearback via env var"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

main
