RASPI := max@lichen.local
REMOTE_DIR := /home/max/lichen

.PHONY: install start stop restart status logs setup diagnose check debug test help

help:
	@echo "Lichen - Multi-headphone audio router"
	@echo ""
	@echo "Local:"
	@echo "  make install   Deploy to Raspberry Pi"
	@echo "  make diagnose  Run diagnostics on Pi"
	@echo "  make check     Check USB audio capabilities"
	@echo ""
	@echo "Remote (runs on Pi):"
	@echo "  make start     Start lichen service"
	@echo "  make stop      Stop lichen service"
	@echo "  make restart   Restart lichen service"
	@echo "  make status    Check service status"
	@echo "  make logs      Stream logs (Ctrl+C to exit)"
	@echo "  make setup     Configure bridge adapter"
	@echo ""
	@echo "Testing:"
	@echo "  make test      Play test sounds to headphones"
	@echo "  make debug     Show audio routing details"

install:
	@./install-raspi.sh

start:
	@ssh $(RASPI) 'systemctl --user start lichen-headless && echo "✓ Lichen started"'

stop:
	@ssh $(RASPI) 'systemctl --user stop lichen-headless && echo "✓ Lichen stopped"'

restart:
	@ssh $(RASPI) 'systemctl --user restart lichen-headless && echo "✓ Lichen restarted"'

status:
	@ssh $(RASPI) 'systemctl --user status lichen-headless'

logs:
	@ssh -t $(RASPI) 'journalctl --user -u lichen-headless -f'

setup:
	@ssh -t $(RASPI) '$(REMOTE_DIR)/lichen-headless.sh --setup'

diagnose:
	@./diagnose-raspi.sh

check:
	@./check-usb-audio.sh

test:
	@echo "Playing test sounds to both headphones..."
	@ssh $(RASPI) 'paplay --device=lichen_combined_output /usr/share/sounds/alsa/Front_Left.wav && paplay --device=lichen_combined_output /usr/share/sounds/alsa/Front_Right.wav'
	@echo "✓ Done - you should have heard audio in BOTH headphones"

debug:
	@echo "╔════════════════════════════════════════════════════════════════╗"
	@echo "║         LICHEN AUDIO ROUTING DEBUG                             ║"
	@echo "╚════════════════════════════════════════════════════════════════╝"
	@echo ""
	@echo "=== AUDIO FLOW DIAGRAM ==="
	@ssh $(RASPI) ' \
		echo ""; \
		echo "ROOM MICS → LAPTOP:"; \
		pactl list source-outputs 2>/dev/null | grep -B5 "Loopback to Null" | grep -E "(Source Output|Source:)" | sed "s/^/  /"; \
		echo "  → null sink monitor → bridge output"; \
		echo ""; \
		echo "LAPTOP → HEADPHONES:"; \
		pactl list source-outputs 2>/dev/null | grep -B5 "Simultaneous output" | grep -E "(Source Output|Source:)" | sed "s/^/  /"; \
		echo "  → combined sink → all headphones"; \
		echo ""; \
		echo "=== COMBINE-SINK SLAVES ==="; \
		pactl list modules 2>/dev/null | grep -A2 "module-combine-sink" | grep slaves | sed "s/.*slaves=/Headphones: /"; \
		echo ""; \
		echo "=== SINK VOLUMES ==="; \
		pactl list sinks 2>/dev/null | grep -E "^(Sink|	Name:|	Volume:|	Mute:)" | grep -A3 "Sink #"; \
		echo ""; \
		echo "=== SOURCE VOLUMES ==="; \
		pactl list sources 2>/dev/null | grep -E "^(Source|	Name:|	Volume:|	Mute:)" | grep -A3 "Source #" | grep -v monitor; \
	'

