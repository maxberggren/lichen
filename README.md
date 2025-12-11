# Lichen

**Multi-headphone audio router for Linux**

Route audio to multiple headphones simultaneously and mix multiple microphones into a single virtual input. Perfect for pair programming, shared listening, or video calls with multiple participants.

## Features

- **Combined Output** — Route system audio to multiple headphones/speakers at once
- **Mixed Input** — Combine multiple microphones into one virtual source
- **Hot-Plug** — Automatically detects devices when plugged in (headless mode)
- **Simple Interface** — Click to select devices, then create routes
- **PipeWire/PulseAudio** — Works with modern Linux audio stacks

## Use Cases

- 🎧 Two people listening to the same audio with their own earbuds
- 🎤 Both users' mics mixed for remote calls
- 💻 Pair programming with shared audio
- 🎬 Shared movie watching with individual volume control

## Installation

### Requirements

- GTK 4.0, libadwaita 1.x, GJS
- PulseAudio or PipeWire (with PulseAudio compatibility)

```bash
# Arch
sudo pacman -S gtk4 libadwaita gjs

# Ubuntu/Debian
sudo apt install gjs libgtk-4-1 libadwaita-1-0 gir1.2-gtk-4.0 gir1.2-adw-1

# Fedora
sudo dnf install gtk4 libadwaita gjs
```

## Usage

### Desktop Mode (GUI)

```bash
./lichen.js
```

1. Select 2+ output devices → "Create Combined Output"
2. Select 2+ input devices → "Create Mixed Input"
3. App automatically sets combined devices as default

### Headless Mode (Raspberry Pi)

For running on a headless Pi as a dedicated audio mixer:

```bash
make install    # Deploy to Pi
make setup      # Configure bridge adapter
make start      # Start service
make logs       # Stream logs (Ctrl+C to exit)
```

See [RASPI-INSTALL.md](RASPI-INSTALL.md) for full Raspberry Pi setup.

## How It Works

Lichen uses PulseAudio/PipeWire modules:

- **Combined Sink** (`module-combine-sink`) — Virtual output mirroring to multiple physical outputs
- **Mixed Source** (`module-null-sink` + `module-loopback`) — Virtual input combining multiple physical inputs

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+R` | Refresh device list |
| `Ctrl+Q` | Quit |

## License

MIT
