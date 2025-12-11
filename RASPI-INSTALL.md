# Lichen Raspberry Pi Setup

Run Lichen as a headless audio mixer on a Raspberry Pi with hot-plug support.

## Prerequisites

- Raspberry Pi with SSH access (e.g., `max@lichen.local`)
- USB audio adapters with **separate mic and audio jacks** (recommended)
- One adapter on Pi designated as "bridge" (connects to laptop)
- One adapter on laptop (receives room mics, sends laptop audio)
- **Two audio cables** (one for each direction - prevents crosstalk)

> ⚠️ **Avoid TRRS cables** with single-cable setups — they cause crosstalk (hearing yourself echoed). Use separate cables for mic and audio.

## Quick Start

```bash
make install    # Deploy to Pi (installs PulseAudio, deploys Lichen)
make setup      # Configure bridge adapter
make start      # Start service
make logs       # Stream logs (Ctrl+C to exit)
```

## Commands

| Command | Action |
|---------|--------|
| `make install` | Deploy/update Lichen on Pi |
| `make start` | Start service |
| `make stop` | Stop service |
| `make restart` | Restart service |
| `make status` | Check service status |
| `make logs` | Stream logs |
| `make setup` | Configure bridge adapter |
| `make diagnose` | Troubleshoot setup |
| `make check` | Verify USB adapter capabilities |
| `make test` | Play test sounds to headphones |
| `make debug` | Show detailed audio routing |

## Hot-Plug

Once running, plug/unplug USB headsets anytime — Lichen auto-detects and reconfigures within 2 seconds.

## Enable Auto-Start

```bash
ssh max@lichen.local 'systemctl --user enable lichen-headless'
ssh max@lichen.local 'sudo loginctl enable-linger max'
```

## Enable Hearback (Sidetone)

Let participants hear themselves:

```bash
ssh max@lichen.local 'nano ~/.config/systemd/user/lichen-headless.service'
# Add under [Service]: Environment="HEARBACK_PERCENT=30"
make restart
```

## Architecture

```
LAPTOP                                    RASPBERRY PI
┌─────────────────┐                      ┌─────────────────────────────────┐
│ USB Audio       │                      │ Bridge USB        USB Headsets │
│ Adapter         │                      │ Adapter           (1, 2, 3...) │
│                 │                      │                                │
│  Audio OUT ─────┼─── Cable 1 ─────────►│ Audio IN ──► All Headphones    │
│                 │                      │                                │
│  Mic IN ◄───────┼─── Cable 2 ◄─────────│ Audio OUT ◄── Mixed Mics       │
└─────────────────┘                      └─────────────────────────────────┘
```

**Two separate cables = zero crosstalk!**

## Troubleshooting

### No USB audio detected

```bash
make diagnose
make check
```

### PulseAudio issues

```bash
ssh max@lichen.local 'systemctl --user restart pulseaudio'
```

### Service won't start

```bash
make status
make logs
```

## Uninstall

```bash
make stop
ssh max@lichen.local 'systemctl --user disable lichen-headless'
ssh max@lichen.local 'rm -rf ~/lichen ~/.config/systemd/user/lichen-headless.service ~/.config/lichen-bridge.conf'
```
