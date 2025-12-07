# Lichen 🎧

**Multi-headphone audio router for Linux**

Lichen is a GTK4 application that lets you route audio to multiple Bluetooth headphones simultaneously and mix multiple microphones into a single virtual input. Perfect for pair programming, shared listening sessions, or video calls with multiple participants.

## Features

- **Combined Output**: Route system audio to multiple headphones/speakers at once
- **Mixed Input**: Combine multiple TRRS microphones into one virtual source
- **Simple Interface**: Click to select devices, then create routes
- **PipeWire/PulseAudio**: Works with modern Linux audio stacks

## Use Cases

- 🎧 Two people listening to the same audio in their own earbuds
- 🎤 Both users' mics mixed for remote calls (the remote team hears everyone)
- 🎬 Shared movie watching with individual volume control
- 💻 Pair programming with shared audio

## Requirements

- GTK 4.0
- libadwaita 1.x
- GJS (GNOME JavaScript)
- PulseAudio or PipeWire (with PulseAudio compatibility)

### Arch Linux

```bash
sudo pacman -S gtk4 libadwaita gjs
```

### Ubuntu/Debian

```bash
sudo apt install gjs libgtk-4-1 libadwaita-1-0 gir1.2-gtk-4.0 gir1.2-adw-1
```

### Fedora

```bash
sudo dnf install gtk4 libadwaita gjs
```

## Usage

```bash
# Run directly
./lichen.js

# Or with gjs
gjs lichen.js
```

### How to Use

1. **Select Output Devices**: Click on 2+ headphones/speakers in the left panel
2. **Create Combined Output**: Click "Create Combined Output" to route audio to all selected devices
3. **Select Input Devices**: Click on 2+ microphones
4. **Create Mixed Input**: Click "Create Mixed Input" to combine mics into one virtual source
5. **Set as Default**: The app automatically sets the combined sink/source as default

## How It Works

Lichen uses PulseAudio/PipeWire modules to create virtual audio devices:

- **Combined Sink** (`module-combine-sink`): Creates a virtual output that mirrors audio to multiple physical outputs
- **Mixed Source** (`module-null-sink` + `module-loopback`): Creates a virtual input that combines multiple physical inputs

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+R` | Refresh device list |
| `Ctrl+Q` | Quit |

## License

MIT




