#!/bin/bash
# lichen-headless.sh - Auto-merge all USB mics and route to all USB headphones
# Bridge adapter (to laptop) is detected on first run or when config is missing
# NOW WITH HOT-PLUG SUPPORT: Automatically detects new devices!

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

# Track current device state
CURRENT_DEVICE_STATE=""
POLL_INTERVAL=2  # Check for device changes every N seconds

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
        latency_msec=1 \
        adjust_time=0)
    
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

enable_usb_duplex_profiles() {
    # Set USB audio cards to duplex mode (input+output) instead of output-only
    # This is needed because PulseAudio often defaults to output-only profiles
    for card in $(pactl list cards short 2>/dev/null | grep -i usb | awk '{print $2}'); do
        # Try the analog stereo + mono input profile first (most common)
        if pactl set-card-profile "$card" "output:analog-stereo+input:mono-fallback" 2>/dev/null; then
            echo "  Set duplex profile on: $(echo $card | cut -c1-50)..."
        fi
    done
    
    # If PulseAudio still doesn't show USB sources, manually load ALSA sources
    # This handles devices where PulseAudio's profile detection fails
    if ! pactl list sources short 2>/dev/null | grep -i usb | grep -qv '\.monitor'; then
        # Find USB ALSA cards and load sources manually
        for card_num in $(cat /proc/asound/cards 2>/dev/null | grep -i usb | awk '{print $1}'); do
            # Check if this card has capture capability
            if [ -f "/proc/asound/card${card_num}/stream0" ] && grep -q "Capture:" "/proc/asound/card${card_num}/stream0" 2>/dev/null; then
                local source_name="alsa_input_manual_card${card_num}"
                # Only load if not already loaded
                if ! pactl list sources short 2>/dev/null | grep -q "$source_name"; then
                    if pactl load-module module-alsa-source device="hw:${card_num},0" source_name="$source_name" 2>/dev/null; then
                        echo "  Manually loaded source for card ${card_num}"
                    fi
                fi
            fi
        done
    fi
}

wait_for_usb_audio() {
    local timeout="${1:-30}"  # Default 30 second timeout
    local elapsed=0
    echo "Waiting for USB audio device (timeout: ${timeout}s)..."
    
    while [ "$elapsed" -lt "$timeout" ]; do
        # First, ensure USB cards are in duplex mode
        enable_usb_duplex_profiles
        
        # Need BOTH a sink AND a non-monitor source to be ready
        local has_sink=$(pactl list sinks short 2>/dev/null | grep -i usb)
        local has_source=$(pactl list sources short 2>/dev/null | grep -i usb | grep -v '\.monitor')
        
        if [ -n "$has_sink" ] && [ -n "$has_source" ]; then
            sleep 1  # Give it a moment to fully initialize
            return 0
        fi
        
        sleep 0.5
        elapsed=$((elapsed + 1))
    done
    
    # Timeout - show what we do see
    echo ""
    echo "⚠ Timeout waiting for USB audio. Current state:"
    echo "  Sinks (looking for 'usb'):"
    pactl list sinks short 2>/dev/null | head -5 | sed 's/^/    /'
    echo "  Sources (looking for 'usb', excluding monitors):"
    pactl list sources short 2>/dev/null | grep -v '\.monitor' | head -5 | sed 's/^/    /'
    return 1
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
    
    if ! wait_for_usb_audio 30; then
        echo ""
        echo "✗ Error: Could not detect USB audio device within timeout"
        echo ""
        echo "Troubleshooting tips:"
        echo "  1. Make sure the USB adapter is firmly plugged in"
        echo "  2. Try a different USB port"
        echo "  3. Check 'dmesg | tail -20' for USB errors"
        echo "  4. Run 'pactl list sinks short' to see available sinks"
        exit 1
    fi
    
    # Grab the device info - use FULL sink/source names for exact matching
    BRIDGE_SINK=$(pactl list sinks short | grep -i usb | head -1 | awk '{print $2}')
    BRIDGE_SOURCE=$(pactl list sources short | grep -i usb | grep -v '\.monitor' | head -1 | awk '{print $2}')
    
    if [ -z "$BRIDGE_SINK" ] || [ -z "$BRIDGE_SOURCE" ]; then
        echo "✗ Error: USB device detected but couldn't identify sink/source"
        echo ""
        echo "Debug info:"
        echo "  BRIDGE_SINK='$BRIDGE_SINK'"
        echo "  BRIDGE_SOURCE='$BRIDGE_SOURCE'"
        echo ""
        echo "All sinks:"
        pactl list sinks short | sed 's/^/  /'
        echo ""
        echo "All sources (non-monitor):"
        pactl list sources short | grep -v '\.monitor' | sed 's/^/  /'
        exit 1
    fi
    
    echo ""
    echo "✓ Detected bridge adapter:"
    echo "  Sink:   $BRIDGE_SINK"
    echo "  Source: $BRIDGE_SOURCE"
    echo ""
    
    # Save config with FULL sink/source names for exact matching
    # This allows multiple identical devices (e.g., two Corsair headsets)
    cat > "$CONFIG_FILE" << EOF
# Lichen bridge configuration
# Generated: $(date)
# This adapter connects to the laptop via male-to-male TRRS cable
# Using FULL device names for exact matching (supports multiple identical devices)
BRIDGE_SINK="$BRIDGE_SINK"
BRIDGE_SOURCE="$BRIDGE_SOURCE"
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
        # Support both old (BRIDGE_ID) and new (BRIDGE_SINK/BRIDGE_SOURCE) config formats
        if [ -n "$BRIDGE_SINK" ] && [ -n "$BRIDGE_SOURCE" ]; then
            return 0
        elif [ -n "$BRIDGE_ID" ]; then
            # Legacy config - will work but may have issues with identical devices
            BRIDGE_SINK=$(pactl list sinks short | grep -i usb | grep -i "$BRIDGE_ID" | awk '{print $2}' | head -1)
            BRIDGE_SOURCE=$(pactl list sources short | grep -i usb | grep -v '\.monitor' | grep -i "$BRIDGE_ID" | awk '{print $2}' | head -1)
            return 0
        fi
    fi
    return 1
}

get_bridge_sink() {
    # Return the exact bridge sink name from config
    echo "$BRIDGE_SINK"
}

get_bridge_source() {
    # Return the exact bridge source name from config
    echo "$BRIDGE_SOURCE"
}

get_headphone_sinks() {
    # Get all USB sinks EXCEPT the exact bridge sink
    # This allows multiple identical devices (e.g., two Corsair headsets)
    pactl list sinks short | grep -i usb | awk '{print $2}' | grep -v "^${BRIDGE_SINK}$"
}

get_headphone_sources() {
    # Get all USB sources (excluding monitors) EXCEPT the exact bridge source
    # This allows multiple identical devices (e.g., two Corsair headsets)
    pactl list sources short | grep -i usb | grep -v '\.monitor' | awk '{print $2}' | grep -v "^${BRIDGE_SOURCE}$"
}

get_device_state() {
    # Create a fingerprint of current USB audio devices
    # This lets us detect when devices are added/removed
    local bridge_present=""
    if pactl list sinks short | grep -q "^[0-9]*[[:space:]]*${BRIDGE_SINK}[[:space:]]"; then
        bridge_present="$BRIDGE_SINK"
    fi
    local headphone_sinks=$(get_headphone_sinks | sort | tr '\n' ',')
    local headphone_sources=$(get_headphone_sources | sort | tr '\n' ',')
    echo "${bridge_present}|${headphone_sinks}|${headphone_sources}"
}

setup_audio_routing() {
    local bridge_sink="$1"
    local bridge_source="$2"
    local headphone_sinks="$3"
    local headphone_sources="$4"
    
    echo ""
    echo "═══════════════════════════════════════════════════════════════════"
    echo "  🔄 Configuring audio routing..."
    echo "═══════════════════════════════════════════════════════════════════"
    echo ""
    
    # Set bridge volumes to 100%
    pactl set-sink-volume "$bridge_sink" 100% 2>/dev/null || true
    pactl set-source-volume "$bridge_source" 100% 2>/dev/null || true
    
    local hp_count=$(echo "$headphone_sinks" | wc -w)
    local mic_count=$(echo "$headphone_sources" | wc -l)
    
    # ───────────────────────────────────────────────────────────────────
    # 1. ROOM → LAPTOP: Mix all headphone mics, send to bridge output
    # ───────────────────────────────────────────────────────────────────
    echo "┌─ Room → Laptop (mixing headphone mics)..."
    
    if [ "$mic_count" -gt 0 ] && [ -n "$headphone_sources" ]; then
        # Create null sink to mix room mics
        pactl load-module module-null-sink \
            sink_name="$NULL_SINK_ROOM" > /dev/null
        
        # Loopback each headphone mic into the mixer and set volume to 100%
        for SOURCE in $headphone_sources; do
            echo "│  Adding mic: $(echo $SOURCE | cut -c1-50)..."
            pactl load-module module-loopback \
                source="$SOURCE" \
                sink="$NULL_SINK_ROOM" \
                latency_msec=1 \
                adjust_time=0 > /dev/null
            # Set mic volume to 100% for clear audio
            pactl set-source-volume "$SOURCE" 100% 2>/dev/null || true
        done
        
        # Loopback the mixed room audio to the bridge output (to laptop)
        pactl load-module module-loopback \
            source="${NULL_SINK_ROOM}.monitor" \
            sink="$bridge_sink" \
            latency_msec=1 \
            adjust_time=0 > /dev/null
        
        echo "└─ ✓ Room mics → Bridge output → Laptop"
    else
        echo "└─ ⚠ No room mics detected, skipping room → laptop routing"
    fi
    echo ""
    
    # ───────────────────────────────────────────────────────────────────
    # 2. LAPTOP → ROOM: Take bridge input, send to all headphones
    # ───────────────────────────────────────────────────────────────────
    echo "┌─ Laptop → Room (distributing to headphones)..."
    
    if [ "$hp_count" -gt 0 ]; then
        # Set all headphone output volumes to 100%
        for SINK in $headphone_sinks; do
            pactl set-sink-volume "$SINK" 100% 2>/dev/null || true
        done
        
        # Combine all headphone outputs into one sink
        local slaves=$(echo "$headphone_sinks" | tr ' ' ',' | sed 's/,$//')
        
        pactl load-module module-combine-sink \
            sink_name="$COMBINED_SINK" \
            slaves="$slaves" > /dev/null
        
        # Loopback bridge input (laptop audio) to all headphones
        pactl load-module module-loopback \
            source="$bridge_source" \
            sink="$COMBINED_SINK" \
            latency_msec=1 \
            adjust_time=0 > /dev/null
        
        echo "└─ ✓ Laptop → Bridge input → All headphones ($hp_count devices)"
    else
        echo "└─ ⚠ No headphones connected yet, skipping laptop → room routing"
    fi
    
    echo ""
    
    # ───────────────────────────────────────────────────────────────────
    # 3. HEARBACK: Let room participants hear themselves (optional)
    # ───────────────────────────────────────────────────────────────────
    if [ "$hp_count" -gt 0 ] && [ "$HEARBACK_PERCENT" -gt 0 ]; then
        setup_hearback "$HEARBACK_PERCENT"
        echo ""
    fi
}

print_status() {
    local hp_count="$1"
    local mic_count="$2"
    
    echo "═══════════════════════════════════════════════════════════════════"
    echo ""
    echo "  ✅ LICHEN ACTIVE"
    echo ""
    echo "  🎧 Headphones connected: $hp_count"
    echo "  🎤 Mics active: $mic_count"
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
    echo "  🔌 HOT-PLUG: Monitoring for device changes..."
    echo "     Plug/unplug USB headsets anytime - auto-detected!"
    echo ""
    echo "  Press Ctrl+C to stop"
    echo ""
    echo "═══════════════════════════════════════════════════════════════════"
}

main() {
    echo "╔════════════════════════════════════════════════════════════════╗"
    echo "║                    LICHEN HEADLESS                             ║"
    echo "║         Multi-headphone audio merger (HOT-PLUG)                ║"
    echo "╚════════════════════════════════════════════════════════════════╝"
    echo ""
    
    # Check for --setup flag or missing config
    if [ "$1" = "--setup" ] || [ "$1" = "-s" ]; then
        setup_bridge
        echo "Setup complete. Run without --setup to start."
        exit 0
    elif ! load_bridge_config; then
        echo "No bridge configuration found."
        setup_bridge
    fi
    
    # Config is already loaded by load_bridge_config
    echo "Bridge sink: $BRIDGE_SINK"
    echo "Bridge source: $BRIDGE_SOURCE"
    echo ""
    
    # Wait for bridge device to be present in PulseAudio
    echo "Waiting for bridge adapter..."
    while ! pactl list sinks short | grep -q "^[0-9]*[[:space:]]*${BRIDGE_SINK}[[:space:]]"; do
        sleep 1
    done
    
    local bridge_sink=$(get_bridge_sink)
    local bridge_source=$(get_bridge_source)
    
    echo "✓ Bridge adapter connected:"
    echo "  Output (to laptop): $bridge_sink"
    echo "  Input (from laptop): $bridge_source"
    echo ""
    echo "🔌 Starting hot-plug monitoring..."
    echo "   Plug in USB headsets anytime - they'll be auto-detected!"
    echo ""
    
    # Set up trap for cleanup
    trap cleanup EXIT
    
    # Main monitoring loop
    while true; do
        # Get current device state
        local new_state=$(get_device_state)
        
        # Check if devices changed
        if [ "$new_state" != "$CURRENT_DEVICE_STATE" ]; then
            # Devices changed! Reconfigure
            echo ""
            echo "🔄 Device change detected! Reconfiguring..."
            
            # Clean up old configuration
            cleanup
            
            # Ensure all USB cards are in duplex mode (needed for newly plugged devices)
            enable_usb_duplex_profiles
            
            # Check if bridge is still connected
            if ! pactl list sinks short | grep -q "^[0-9]*[[:space:]]*${BRIDGE_SINK}[[:space:]]"; then
                echo "⚠ Bridge adapter disconnected! Waiting for reconnection..."
                CURRENT_DEVICE_STATE=""
                sleep 2
                continue
            fi
            
            # Use the saved bridge sink/source names
            bridge_sink="$BRIDGE_SINK"
            bridge_source="$BRIDGE_SOURCE"
            
            local headphone_sinks=$(get_headphone_sinks | tr '\n' ' ')
            local headphone_sources=$(get_headphone_sources)
            
            local hp_count=$(echo "$headphone_sinks" | wc -w)
            local mic_count=$(echo "$headphone_sources" | wc -l)
            
            echo "  Found: $hp_count headphones, $mic_count mics"
            
            # Set up audio routing with current devices
            setup_audio_routing "$bridge_sink" "$bridge_source" "$headphone_sinks" "$headphone_sources"
            
            # Update state
            CURRENT_DEVICE_STATE="$new_state"
            
            # Print status
            print_status "$hp_count" "$mic_count"
        fi
        
        # Sleep before next check
        sleep "$POLL_INTERVAL"
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
        --poll-interval=*)
            POLL_INTERVAL="${1#*=}"
            if ! [[ "$POLL_INTERVAL" =~ ^[0-9]+$ ]]; then
                echo "Error: poll-interval must be a number (seconds)"
                exit 1
            fi
            shift
            ;;
        --help|-h)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --setup, -s              Force bridge adapter setup"
            echo "  --hearback=PERCENT       Enable hearback (hear yourself) at PERCENT volume (0-100)"
            echo "                           Example: --hearback=30 for 30% sidetone"
            echo "  --poll-interval=SECONDS  How often to check for device changes (default: 2)"
            echo "  --help, -h               Show this help"
            echo ""
            echo "Environment variables:"
            echo "  HEARBACK_PERCENT         Set hearback volume (0-100), default: 0 (off)"
            echo ""
            echo "On first run, you'll be prompted to set up the bridge adapter."
            echo ""
            echo "HOT-PLUG SUPPORT:"
            echo "  After setup, you can plug/unplug USB headsets anytime!"
            echo "  The system will automatically detect changes and reconfigure."
            echo ""
            echo "Examples:"
            echo "  $0                       # Run with hot-plug monitoring"
            echo "  $0 --hearback=25         # Run with 25% hearback"
            echo "  HEARBACK_PERCENT=50 $0   # Run with 50% hearback via env var"
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
