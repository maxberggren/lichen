#!/bin/bash
# lichen-revert.sh - Nuclear option to clean up all lichen audio modules

echo "Removing all Lichen audio modules..."
echo ""

# Find and unload any module with "lichen" in its arguments
for module_id in $(pactl list modules short | grep -i "lichen" | awk '{print $1}'); do
    echo "Unloading lichen module $module_id..."
    pactl unload-module "$module_id" 2>/dev/null || true
done

# Also clean up any orphaned loopbacks/combine-sinks we might have created
# (being more conservative here - only unload if they look like ours)
echo ""
echo "Checking for orphaned modules..."

pactl list modules short | while read -r line; do
    module_id=$(echo "$line" | awk '{print $1}')
    module_name=$(echo "$line" | awk '{print $2}')
    module_args=$(echo "$line" | cut -f3-)
    
    # Check if this looks like one of ours
    if echo "$module_args" | grep -qi "lichen"; then
        echo "Unloading orphaned module $module_id ($module_name)..."
        pactl unload-module "$module_id" 2>/dev/null || true
    fi
done

echo ""
echo "Done! Your audio should be back to normal."
echo ""
echo "Current sinks:"
pactl list sinks short
echo ""
echo "Current sources (excluding monitors):"
pactl list sources short | grep -v '\.monitor'
echo ""
echo "═══════════════════════════════════════════════════════════════════"
echo "If audio is still broken, run:"
echo "  systemctl --user restart pipewire pipewire-pulse wireplumber"
echo "═══════════════════════════════════════════════════════════════════"
