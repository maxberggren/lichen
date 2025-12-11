const { GLib, Gio, Gtk, Adw, Gdk, GObject } = imports.gi;

// ============================================================================
// Main Window - Audio Router Interface
// ============================================================================

var MainWindow = GObject.registerClass(
class MainWindow extends Adw.ApplicationWindow {
    _init(app, audioManager) {
        super._init({
            application: app,
            title: 'Lichen',
            default_width: 900,
            default_height: 650,
        });

        this._audioManager = audioManager;
        this._selectedOutputs = new Set();
        this._selectedInputs = new Set();
        
        this._setupUI();
        this._loadCSS();
        this._refreshDevices();
        this._updateRoutesList();
        this._updateStatus();

        // Listen for audio device changes
        this._audioManager.addListener(() => {
            this._refreshDevices();
            this._updateRoutesList();
            this._updateStatus();
        });
    }

    _loadCSS() {
        const css = `
            .main-container {
                background: linear-gradient(160deg, #0d1117 0%, #161b22 50%, #0d1117 100%);
            }
            
            .header-bar {
                background: transparent;
                border-bottom: 1px solid rgba(88, 166, 255, 0.15);
            }
            
            .app-title {
                font-family: 'JetBrains Mono', 'SF Mono', monospace;
                font-size: 18px;
                font-weight: 700;
                color: #58a6ff;
                letter-spacing: 2px;
            }
            
            .section-title {
                font-family: 'JetBrains Mono', 'SF Mono', monospace;
                font-size: 11px;
                font-weight: 600;
                color: #8b949e;
                letter-spacing: 1.5px;
                margin-bottom: 8px;
            }
            
            .panel {
                background: rgba(22, 27, 34, 0.8);
                border-radius: 12px;
                border: 1px solid rgba(48, 54, 61, 0.8);
                padding: 16px;
            }
            
            .device-card {
                background: rgba(13, 17, 23, 0.9);
                border-radius: 8px;
                border: 1px solid rgba(48, 54, 61, 0.6);
                padding: 12px 16px;
                margin: 4px 0 0 0;
                transition: all 200ms ease;
            }
            
            .device-card:hover {
                border-color: rgba(88, 166, 255, 0.4);
                background: rgba(22, 27, 34, 0.95);
            }
            
            .device-card.selected {
                border-color: #58a6ff;
                background: rgba(88, 166, 255, 0.1);
                box-shadow: 0 0 20px rgba(88, 166, 255, 0.15);
            }
            
            .device-card.output.selected {
                border-color: #58a6ff;
                background: rgba(88, 166, 255, 0.1);
                box-shadow: 0 0 20px rgba(88, 166, 255, 0.15);
            }
            
            .device-card.input.selected {
                border-color: #58a6ff;
                background: rgba(88, 166, 255, 0.1);
                box-shadow: 0 0 20px rgba(88, 166, 255, 0.15);
            }
            
            .device-name {
                font-family: 'Inter', 'SF Pro Display', sans-serif;
                font-size: 13px;
                font-weight: 500;
                color: #e6edf3;
            }
            
            .device-id {
                font-family: 'JetBrains Mono', 'SF Mono', monospace;
                font-size: 10px;
                color: #6e7681;
                margin-top: 2px;
            }
            
            .device-icon {
                color: #8b949e;
                margin-right: 12px;
            }
            
            .device-icon.output {
                color: #8b949e;
            }
            
            .device-icon.input {
                color: #8b949e;
            }
            
            .router-zone-wrapper {
                margin-bottom: 4px;
            }
            
            .sub-title {
                font-family: 'JetBrains Mono', 'SF Mono', monospace;
                font-size: 9px;
                font-weight: 600;
                color: #6e7681;
                letter-spacing: 1px;
                margin-bottom: 6px;
            }
            
            .router-node {
                background: rgba(13, 17, 23, 0.9);
                border-radius: 8px;
                border: 1px solid rgba(48, 54, 61, 0.6);
                padding: 12px;
                min-height: 80px;
            }
            
            .router-node.output-target {
            }
            
            .router-node.input-target {
            }
            
            .router-node.has-items {
                border-color: rgba(88, 166, 255, 0.4);
            }
            
            .router-hint {
                font-family: 'Inter', sans-serif;
                font-size: 12px;
                color: #484f58;
                font-style: italic;
            }
            
            .action-button {
                background: linear-gradient(135deg, #238636 0%, #2ea043 100%);
                color: #ffffff;
                font-family: 'Inter', sans-serif;
                font-weight: 600;
                font-size: 13px;
                border-radius: 8px;
                padding: 12px 24px;
                border: none;
                box-shadow: 0 4px 12px rgba(35, 134, 54, 0.3);
            }
            
            .action-button:hover {
                background: linear-gradient(135deg, #2ea043 0%, #3fb950 100%);
            }
            
            .action-button:disabled {
                background: rgba(48, 54, 61, 0.8);
                color: #6e7681;
                box-shadow: none;
            }
            
            .action-button.secondary {
                background: rgba(48, 54, 61, 0.8);
                box-shadow: none;
            }
            
            .action-button.secondary:hover {
                background: rgba(63, 68, 75, 0.9);
            }
            
            .action-button.destructive {
                background: linear-gradient(135deg, #b62324 0%, #da3633 100%);
                box-shadow: 0 4px 12px rgba(218, 54, 51, 0.3);
            }
            
            .action-button.destructive:hover {
                background: linear-gradient(135deg, #da3633 0%, #f85149 100%);
            }
            
            .action-button.destructive:disabled {
                background: rgba(48, 54, 61, 0.8);
                color: #6e7681;
                box-shadow: none;
            }
            
            .action-button.warning {
                background: linear-gradient(135deg, #9e6a03 0%, #d29922 100%);
                box-shadow: 0 4px 12px rgba(210, 153, 34, 0.3);
            }
            
            .action-button.warning:hover {
                background: linear-gradient(135deg, #d29922 0%, #e3b341 100%);
            }
            
            .missing-audio-info {
                font-family: 'Inter', sans-serif;
                font-size: 11px;
                color: #d29922;
                margin-top: 4px;
            }
            
            .status-badge {
                font-family: 'JetBrains Mono', monospace;
                font-size: 9px;
                font-weight: 600;
                padding: 3px 8px;
                border-radius: 12px;
                letter-spacing: 0.5px;
            }
            
            .status-badge.running {
                background: rgba(63, 185, 80, 0.2);
                color: #3fb950;
            }
            
            .status-badge.idle {
                background: rgba(139, 148, 158, 0.2);
                color: #8b949e;
            }
            
            .chip {
                background: rgba(48, 54, 61, 0.8);
                border-radius: 6px;
                padding: 6px 10px;
                margin: 2px;
            }
            
            .chip-label {
                font-family: 'Inter', sans-serif;
                font-size: 11px;
                color: #e6edf3;
            }
            
            .chip-remove {
                color: #f85149;
                margin-left: 6px;
            }
            
            .route-name {
                font-family: 'Inter', 'SF Pro Display', sans-serif;
                font-size: 13px;
                font-weight: 500;
                color: #e6edf3;
            }
            
            .route-type {
                font-family: 'JetBrains Mono', 'SF Mono', monospace;
                font-size: 10px;
                color: #6e7681;
                margin-top: 2px;
            }
            
            .route-icon {
                color: #8b949e;
                margin-right: 12px;
            }
            
            .route-icon.output {
                color: #8b949e;
            }
            
            .route-icon.input {
                color: #8b949e;
            }
            
            .route-delete {
                color: #6e7681;
                padding: 2px;
            }
            
            .route-delete:hover {
                color: #f85149;
            }
            
            .route-card {
                background: rgba(13, 17, 23, 0.9);
                border-radius: 8px;
                border: 1px solid rgba(48, 54, 61, 0.6);
                padding: 12px 16px;
                margin: 4px 0;
                transition: all 200ms ease;
            }
            
            .route-card:hover {
                border-color: rgba(88, 166, 255, 0.4);
                background: rgba(22, 27, 34, 0.95);
            }
            
            .route-card.output {
                border-color: rgba(88, 166, 255, 0.4);
            }
            
            .route-card.input {
                border-color: rgba(88, 166, 255, 0.4);
            }
            
            .device-volume-row {
                padding: 6px 0 0 0;
                margin-top: 6px;
                border-top: 1px solid rgba(48, 54, 61, 0.4);
            }
            
            .device-volume-label {
                font-family: 'Inter', sans-serif;
                font-size: 11px;
                color: #8b949e;
            }
            
            .device-volume-value {
                font-family: 'JetBrains Mono', monospace;
                font-size: 10px;
                color: #6e7681;
                min-width: 36px;
            }
            
            .device-volume-slider {
                margin-top: 2px;
            }
            
            .clear-btn {
                color: #6e7681;
                padding: 4px;
                min-width: 24px;
                min-height: 24px;
            }
            
            .clear-btn:hover {
                color: #f85149;
            }
            
            .hearback-row {
                background: rgba(13, 17, 23, 0.9);
                border-radius: 8px;
                border: 1px solid rgba(48, 54, 61, 0.6);
                padding: 12px 16px;
                margin: 8px 0;
            }
            
            .hearback-row.enabled {
                border-color: rgba(63, 185, 80, 0.5);
                background: rgba(63, 185, 80, 0.1);
            }
            
            .hearback-label {
                font-family: 'Inter', 'SF Pro Display', sans-serif;
                font-size: 13px;
                font-weight: 500;
                color: #e6edf3;
            }
            
            .hearback-desc {
                font-family: 'Inter', sans-serif;
                font-size: 10px;
                color: #6e7681;
                margin-top: 2px;
            }
            
            .hearback-slider {
                margin-top: 8px;
            }
            
            .hearback-value {
                font-family: 'JetBrains Mono', monospace;
                font-size: 11px;
                color: #8b949e;
                min-width: 36px;
            }
        `;

        const provider = new Gtk.CssProvider();
        provider.load_from_data(css, -1);
        Gtk.StyleContext.add_provider_for_display(
            Gdk.Display.get_default(),
            provider,
            Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION
        );
    }

    _setupUI() {
        // Main container
        const mainBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            css_classes: ['main-container'],
        });


        // Content area with 3 columns
        const contentBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 16,
            margin_start: 20,
            margin_end: 20,
            margin_top: 16,
            margin_bottom: 20,
            vexpand: true,
        });

        // Left panel - Available Devices
        const devicesPanel = this._createDevicesPanel();
        devicesPanel.set_size_request(280, -1);
        contentBox.append(devicesPanel);

        // Center panel - Router
        const routerPanel = this._createRouterPanel();
        routerPanel.hexpand = true;
        contentBox.append(routerPanel);

        // Right panel - Actions
        const actionsPanel = this._createActionsPanel();
        actionsPanel.set_size_request(220, -1);
        contentBox.append(actionsPanel);

        mainBox.append(contentBox);

        this.set_content(mainBox);
    }

    _createDevicesPanel() {
        const panel = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            css_classes: ['panel'],
        });


        // Scrollable list
        const scrolled = new Gtk.ScrolledWindow({
            vexpand: true,
            hscrollbar_policy: Gtk.PolicyType.NEVER,
        });

        this._devicesListBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 8,
        });
        scrolled.set_child(this._devicesListBox);
        panel.append(scrolled);

        return panel;
    }

    _createRouterPanel() {
        const panel = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            css_classes: ['panel'],
            spacing: 16,
        });

        const title = new Gtk.Label({
            label: 'AUDIO ROUTER',
            css_classes: ['section-title'],
            halign: Gtk.Align.START,
        });
        panel.append(title);

        // Two router zones stacked vertically
        const zonesBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 12,
            vexpand: true,
        });

        // Output zone (headphones)
        this._outputZone = this._createRouterZone(
            'OUTPUT MIX',
            '',
            'output-target',
            this._selectedOutputs
        );
        zonesBox.append(this._outputZone.container);

        // Input zone (microphones)
        this._inputZone = this._createRouterZone(
            'INPUT MIX',
            '',
            'input-target',
            this._selectedInputs
        );
        zonesBox.append(this._inputZone.container);

        panel.append(zonesBox);

        return panel;
    }

    _createRouterZone(label, hint, cssClass, selectedSet) {
        // Wrapper that contains label + box
        const wrapper = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            css_classes: ['router-zone-wrapper'],
            vexpand: true,
        });

        const labelWidget = new Gtk.Label({
            label: label,
            css_classes: ['section-title'],
            halign: Gtk.Align.START,
        });
        wrapper.append(labelWidget);

        const container = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            css_classes: ['router-node', cssClass],
            vexpand: true,
        });

        const scrolled = new Gtk.ScrolledWindow({
            vexpand: true,
            hscrollbar_policy: Gtk.PolicyType.NEVER,
        });

        const chipsBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 4,
        });
        scrolled.set_child(chipsBox);
        container.append(scrolled);

        const hintLabel = new Gtk.Label({
            label: hint,
            css_classes: ['router-hint'],
            halign: Gtk.Align.CENTER,
            valign: Gtk.Align.CENTER,
            vexpand: true,
        });
        container.append(hintLabel);

        wrapper.append(container);

        return { container: wrapper, innerContainer: container, chipsBox, hintLabel };
    }

    _createActionsPanel() {
        const panel = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            css_classes: ['panel'],
            spacing: 12,
        });

        const title = new Gtk.Label({
            label: 'ACTIONS',
            css_classes: ['section-title'],
            halign: Gtk.Align.START,
        });
        panel.append(title);

        // Apply routes button (creates both output and input)
        this._applyBtn = new Gtk.Button({
            label: 'Apply Routes',
            css_classes: ['action-button'],
            sensitive: false,
        });
        this._applyBtn.connect('clicked', () => this._applyRoutes());
        panel.append(this._applyBtn);

        // Reset to defaults button
        this._resetBtn = new Gtk.Button({
            label: 'Reset to Defaults',
            css_classes: ['action-button', 'destructive'],
            margin_top: 4,
            sensitive: false,
        });
        this._resetBtn.connect('clicked', () => this._resetToDefaults());
        panel.append(this._resetBtn);

        // Recover missing audio sources button (shown when needed)
        this._recoverBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            margin_top: 12,
            visible: false,
        });
        
        this._recoverBtn = new Gtk.Button({
            label: '⚡ Recover Audio Inputs',
            css_classes: ['action-button', 'warning'],
        });
        this._recoverBtn.connect('clicked', () => this._recoverMissingSources());
        this._recoverBox.append(this._recoverBtn);
        
        this._recoverInfoLabel = new Gtk.Label({
            label: '',
            css_classes: ['missing-audio-info'],
            halign: Gtk.Align.START,
            wrap: true,
            max_width_chars: 25,
        });
        this._recoverBox.append(this._recoverInfoLabel);
        
        panel.append(this._recoverBox);

        // Hearback option
        this._hearbackRow = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            css_classes: ['hearback-row'],
            margin_top: 12,
            visible: false,
        });

        const hearbackHeaderBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
        });

        const hearbackInfoBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            hexpand: true,
        });

        const hearbackLabel = new Gtk.Label({
            label: 'Hearback',
            css_classes: ['hearback-label'],
            halign: Gtk.Align.START,
        });
        hearbackInfoBox.append(hearbackLabel);

        const hearbackDesc = new Gtk.Label({
            label: 'Hear yourself in output',
            css_classes: ['hearback-desc'],
            halign: Gtk.Align.START,
        });
        hearbackInfoBox.append(hearbackDesc);

        hearbackHeaderBox.append(hearbackInfoBox);

        this._hearbackValueLabel = new Gtk.Label({
            label: '70%',
            css_classes: ['hearback-value'],
            halign: Gtk.Align.END,
            valign: Gtk.Align.CENTER,
        });
        hearbackHeaderBox.append(this._hearbackValueLabel);

        this._hearbackRow.append(hearbackHeaderBox);

        // Slider for hearback volume (0-100%)
        this._hearbackSlider = new Gtk.Scale({
            orientation: Gtk.Orientation.HORIZONTAL,
            css_classes: ['hearback-slider'],
            draw_value: false,
            hexpand: true,
        });
        this._hearbackSlider.set_range(0, 100);
        this._hearbackSlider.set_value(70);
        this._hearbackSlider.set_increments(5, 10);
        this._hearbackSlider.connect('value-changed', () => {
            this._onHearbackVolumeChanged(this._hearbackSlider.get_value());
        });
        this._hearbackRow.append(this._hearbackSlider);

        panel.append(this._hearbackRow);

        // Created routes section
        this._routesSectionLabel = new Gtk.Label({
            label: 'ACTIVE ROUTES',
            css_classes: ['section-title'],
            halign: Gtk.Align.START,
            margin_top: 20,
            visible: false,
        });
        panel.append(this._routesSectionLabel);

        this._routesListBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 6,
        });
        panel.append(this._routesListBox);

        // Spacer
        const spacer = new Gtk.Box({ vexpand: true });
        panel.append(spacer);

        // Info text
        const infoLabel = new Gtk.Label({
            label: 'Select 2+ outputs to create\na combined sink, or 2+ inputs\nto mix microphones.',
            css_classes: ['router-hint'],
            justify: Gtk.Justification.CENTER,
            wrap: true,
        });
        panel.append(infoLabel);

        return panel;
    }

    _refreshDevices() {
        // Clear existing
        let child = this._devicesListBox.get_first_child();
        while (child) {
            const next = child.get_next_sibling();
            this._devicesListBox.remove(child);
            child = next;
        }

        // Output devices section
        const outputTitle = new Gtk.Label({
            label: 'AVAILABLE OUTPUTS',
            css_classes: ['section-title'],
            halign: Gtk.Align.START,
            margin_top: 8,
        });
        this._devicesListBox.append(outputTitle);

        for (const sink of this._audioManager.sinks) {
            const card = this._createDeviceCard(sink, 'output');
            this._devicesListBox.append(card);
        }

        // Input devices section
        const inputTitle = new Gtk.Label({
            label: 'AVAILABLE INPUTS',
            css_classes: ['section-title'],
            halign: Gtk.Align.START,
            margin_top: 16,
        });
        this._devicesListBox.append(inputTitle);

        for (const source of this._audioManager.sources) {
            const card = this._createDeviceCard(source, 'input');
            this._devicesListBox.append(card);
        }
    }

    _createDeviceCard(device, type) {
        const card = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            css_classes: ['device-card', type],
        });

        // Icon
        const icon = new Gtk.Image({
            icon_name: type === 'output' ? 'audio-headphones-symbolic' : 'audio-input-microphone-symbolic',
            css_classes: ['device-icon', type],
        });
        card.append(icon);

        // Info
        const infoBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            hexpand: true,
        });

        const nameLabel = new Gtk.Label({
            label: device.description,
            css_classes: ['device-name'],
            halign: Gtk.Align.START,
            ellipsize: 3, // PANGO_ELLIPSIZE_END
            max_width_chars: 25,
        });
        infoBox.append(nameLabel);

        const idLabel = new Gtk.Label({
            label: device.name,
            css_classes: ['device-id'],
            halign: Gtk.Align.START,
            ellipsize: 3,
            max_width_chars: 30,
        });
        infoBox.append(idLabel);

        card.append(infoBox);

        // Make clickable
        const gesture = new Gtk.GestureClick();
        gesture.connect('released', () => {
            this._toggleDeviceSelection(device, type, card);
        });
        card.add_controller(gesture);

        // Set pointer cursor
        card.set_cursor(Gdk.Cursor.new_from_name('pointer', null));

        // Store reference
        card._device = device;
        card._type = type;

        return card;
    }

    _toggleDeviceSelection(device, type, card) {
        const selectedSet = type === 'output' ? this._selectedOutputs : this._selectedInputs;
        const zone = type === 'output' ? this._outputZone : this._inputZone;

        if (selectedSet.has(device.name)) {
            // Deselect
            selectedSet.delete(device.name);
            card.remove_css_class('selected');
        } else {
            // Select
            selectedSet.add(device.name);
            card.add_css_class('selected');
        }

        this._updateZoneChips(zone, selectedSet, type);
        this._updateActionButtons();
    }

    _updateZoneChips(zone, selectedSet, type) {
        // Clear existing chips
        let child = zone.chipsBox.get_first_child();
        while (child) {
            const next = child.get_next_sibling();
            zone.chipsBox.remove(child);
            child = next;
        }

        // Add cards for selected items (same styling as device cards)
        for (const name of selectedSet) {
            const devices = type === 'output' ? this._audioManager.sinks : this._audioManager.sources;
            const device = devices.find(d => d.name === name);
            if (!device) continue;

            const card = new Gtk.Box({
                orientation: Gtk.Orientation.HORIZONTAL,
                css_classes: ['device-card', type, 'selected'],
            });

            // Icon
            const icon = new Gtk.Image({
                icon_name: type === 'output' ? 'audio-headphones-symbolic' : 'audio-input-microphone-symbolic',
                css_classes: ['device-icon', type],
            });
            card.append(icon);

            // Info
            const infoBox = new Gtk.Box({
                orientation: Gtk.Orientation.VERTICAL,
                hexpand: true,
            });

            const nameLabel = new Gtk.Label({
                label: device.description,
                css_classes: ['device-name'],
                halign: Gtk.Align.START,
                ellipsize: 3,
                max_width_chars: 20,
            });
            infoBox.append(nameLabel);

            const idLabel = new Gtk.Label({
                label: device.name,
                css_classes: ['device-id'],
                halign: Gtk.Align.START,
                ellipsize: 3,
                max_width_chars: 25,
            });
            infoBox.append(idLabel);

            card.append(infoBox);

            // Make clickable to deselect
            const gesture = new Gtk.GestureClick();
            gesture.connect('released', () => {
                selectedSet.delete(name);
                this._updateZoneChips(zone, selectedSet, type);
                this._updateActionButtons();
                this._updateDeviceCardSelection(name, false);
            });
            card.add_controller(gesture);

            // Set pointer cursor
            card.set_cursor(Gdk.Cursor.new_from_name('pointer', null));

            zone.chipsBox.append(card);
        }

        // Update zone appearance
        if (selectedSet.size > 0) {
            zone.innerContainer.add_css_class('has-items');
            zone.hintLabel.set_visible(false);
        } else {
            zone.innerContainer.remove_css_class('has-items');
            zone.hintLabel.set_visible(true);
        }
    }

    _updateDeviceCardSelection(name, selected) {
        let child = this._devicesListBox.get_first_child();
        while (child) {
            if (child._device && child._device.name === name) {
                if (selected) {
                    child.add_css_class('selected');
                } else {
                    child.remove_css_class('selected');
                }
                break;
            }
            child = child.get_next_sibling();
        }
    }

    _updateActionButtons() {
        // Enable apply button if we have 2+ outputs OR 2+ inputs selected
        const hasOutputs = this._selectedOutputs.size >= 2;
        const hasInputs = this._selectedInputs.size >= 2;
        this._applyBtn.sensitive = hasOutputs || hasInputs;
        
        // Update button label to show what will be created
        if (hasOutputs && hasInputs) {
            this._applyBtn.label = 'Apply Routes (Output + Input)';
        } else if (hasOutputs) {
            this._applyBtn.label = 'Apply Routes (Output)';
        } else if (hasInputs) {
            this._applyBtn.label = 'Apply Routes (Input)';
        } else {
            this._applyBtn.label = 'Apply Routes';
        }
    }

    _clearSelection() {
        // Clear outputs
        for (const name of this._selectedOutputs) {
            this._updateDeviceCardSelection(name, false);
        }
        this._selectedOutputs.clear();
        this._updateZoneChips(this._outputZone, this._selectedOutputs, 'output');

        // Clear inputs
        for (const name of this._selectedInputs) {
            this._updateDeviceCardSelection(name, false);
        }
        this._selectedInputs.clear();
        this._updateZoneChips(this._inputZone, this._selectedInputs, 'input');

        this._updateActionButtons();
    }

    _routeAlreadyExists(deviceNames, type) {
        // Check if a route with the exact same devices already exists
        const routes = this._audioManager.createdRoutes.filter(r => r.type === type);
        const sortedNew = [...deviceNames].sort();
        
        for (const route of routes) {
            if (!route.deviceNames || route.deviceNames.length === 0) continue;
            
            // Get the actual device names (not descriptions) from the route
            // We need to compare against the original sink/source names
            const sortedExisting = [...route.deviceNames].sort();
            
            if (sortedNew.length === sortedExisting.length &&
                sortedNew.every((name, i) => name === sortedExisting[i])) {
                return true;
            }
        }
        return false;
    }

    _applyRoutes() {
        let success = false;
        let skippedOutput = false;
        let skippedInput = false;

        // Create combined output if 2+ outputs selected
        if (this._selectedOutputs.size >= 2) {
            const sinkNames = Array.from(this._selectedOutputs);
            
            // Get descriptions for comparison
            const deviceDescriptions = sinkNames.map(sn => {
                const sink = this._audioManager._sinks.find(s => s.name === sn);
                return sink ? sink.description : sn;
            });
            
            if (this._routeAlreadyExists(deviceDescriptions, 'output')) {
                skippedOutput = true;
            } else {
                const combinedName = `lichen_output_${Date.now()}`;
                const description = `LichenMixedOutput`;

                if (this._audioManager.createCombinedSink(combinedName, sinkNames, description)) {
                    this._audioManager.setDefaultSink(combinedName);
                    success = true;
                }
            }
        }

        // Create mixed input if 2+ inputs selected
        if (this._selectedInputs.size >= 2) {
            const sourceNames = Array.from(this._selectedInputs);
            
            // Get descriptions for comparison
            const deviceDescriptions = sourceNames.map(sn => {
                const source = this._audioManager._sources.find(s => s.name === sn);
                return source ? source.description : sn;
            });
            
            if (this._routeAlreadyExists(deviceDescriptions, 'input')) {
                skippedInput = true;
            } else {
                const mixedName = `lichen_input_${Date.now()}`;
                const description = `LichenMixedInput`;

                if (this._audioManager.createMixedSource(mixedName, sourceNames, description)) {
                    this._audioManager.setDefaultSource(`${mixedName}_null.monitor`);
                    success = true;
                }
            }
        }

        if (success) {
            this._updateStatus();
            this._updateRoutesList();
            // Don't clear selection - user may want to see what's selected
        }
    }

    _updateStatus() {
        const hasRoutes = this._audioManager.hasActiveRoutes;
        this._resetBtn.sensitive = hasRoutes;

        // Check for missing audio sources and show recovery option
        this._updateRecoveryStatus();

        // Show/hide hearback option based on whether we have both input and output routes
        const canHearback = this._audioManager.canEnableHearback;
        const wasVisible = this._hearbackRow.get_visible();
        this._hearbackRow.set_visible(canHearback);

        // Auto-enable hearback at default volume when it first becomes available
        if (canHearback && !wasVisible && !this._audioManager.hearbackEnabled) {
            const defaultVolume = this._audioManager.hearbackVolume;
            if (defaultVolume > 0) {
                this._audioManager.setHearbackVolume(defaultVolume);
            }
        }

        // Update hearback slider and label
        const volume = this._audioManager.hearbackVolume;
        this._hearbackSlider.set_value(volume);
        this._hearbackValueLabel.set_label(`${Math.round(volume)}%`);

        // Update hearback row styling
        if (this._audioManager.hearbackEnabled) {
            this._hearbackRow.add_css_class('enabled');
        } else {
            this._hearbackRow.remove_css_class('enabled');
        }
    }

    _onHearbackVolumeChanged(volume) {
        this._audioManager.setHearbackVolume(volume);
        this._hearbackValueLabel.set_label(`${Math.round(volume)}%`);
        
        // Update row styling
        if (volume > 0) {
            this._hearbackRow.add_css_class('enabled');
        } else {
            this._hearbackRow.remove_css_class('enabled');
        }
    }

    _updateRoutesList() {
        // Clear existing
        let child = this._routesListBox.get_first_child();
        while (child) {
            const next = child.get_next_sibling();
            this._routesListBox.remove(child);
            child = next;
        }

        const routes = this._audioManager.createdRoutes;
        this._routesSectionLabel.set_visible(routes.length > 0);

        for (const route of routes) {
            // Card container for route + volume controls
            const card = new Gtk.Box({
                orientation: Gtk.Orientation.VERTICAL,
                css_classes: ['route-card', route.type],
            });

            const headerRow = new Gtk.Box({
                orientation: Gtk.Orientation.HORIZONTAL,
            });

            // Icon
            const icon = new Gtk.Image({
                icon_name: route.type === 'output' ? 'audio-headphones-symbolic' : 'audio-input-microphone-symbolic',
                css_classes: ['route-icon', route.type],
            });
            headerRow.append(icon);

            const infoBox = new Gtk.Box({
                orientation: Gtk.Orientation.VERTICAL,
                hexpand: true,
            });

            const nameLabel = new Gtk.Label({
                label: route.description,
                css_classes: ['route-name'],
                halign: Gtk.Align.START,
                ellipsize: 3,
                max_width_chars: 30,
            });
            infoBox.append(nameLabel);

            // Show device names if available
            if (route.deviceNames && route.deviceNames.length > 0) {
                const devicesLabel = new Gtk.Label({
                    label: route.deviceNames.join(' + '),
                    css_classes: ['route-type'],
                    halign: Gtk.Align.START,
                    ellipsize: 3,
                    max_width_chars: 35,
                    wrap: true,
                });
                infoBox.append(devicesLabel);
            } else {
                const typeLabel = new Gtk.Label({
                    label: route.type.toUpperCase(),
                    css_classes: ['route-type'],
                    halign: Gtk.Align.START,
                });
                infoBox.append(typeLabel);
            }

            headerRow.append(infoBox);

            const deleteBtn = new Gtk.Button({
                icon_name: 'user-trash-symbolic',
                css_classes: ['route-delete', 'flat'],
                valign: Gtk.Align.CENTER,
            });
            deleteBtn.set_cursor(Gdk.Cursor.new_from_name('pointer', null));
            deleteBtn.connect('clicked', () => {
                this._audioManager.removeRoute(route.id);
                this._updateRoutesList();
                this._updateStatus();
                this._refreshDevices();
            });
            headerRow.append(deleteBtn);

            card.append(headerRow);

            // Add per-device volume controls for output routes
            if (route.type === 'output') {
                const slaveInfo = this._audioManager.getRouteSlaveInfo(route.id);
                for (const slave of slaveInfo) {
                    const volumeRow = this._createDeviceVolumeRow(slave, 'output');
                    card.append(volumeRow);
                }
            }

            // Add per-source volume controls for input routes
            if (route.type === 'input') {
                const slaveInfo = this._audioManager.getRouteSlaveSourceInfo(route.id);
                for (const slave of slaveInfo) {
                    const volumeRow = this._createDeviceVolumeRow(slave, 'input');
                    card.append(volumeRow);
                }
            }

            this._routesListBox.append(card);
        }
    }

    _createDeviceVolumeRow(slave, type) {
        const row = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            css_classes: ['device-volume-row'],
        });

        const headerBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
        });

        const label = new Gtk.Label({
            label: slave.description,
            css_classes: ['device-volume-label'],
            halign: Gtk.Align.START,
            hexpand: true,
            ellipsize: 3,
            max_width_chars: 30,
        });
        headerBox.append(label);

        const valueLabel = new Gtk.Label({
            label: `${Math.round(slave.volume)}%`,
            css_classes: ['device-volume-value'],
            halign: Gtk.Align.END,
        });
        headerBox.append(valueLabel);

        row.append(headerBox);

        const slider = new Gtk.Scale({
            orientation: Gtk.Orientation.HORIZONTAL,
            css_classes: ['device-volume-slider'],
            draw_value: false,
            hexpand: true,
        });
        slider.set_range(0, 100);
        slider.set_value(slave.volume);
        slider.set_increments(5, 10);
        slider.connect('value-changed', () => {
            const volume = slider.get_value();
            if (type === 'output') {
                this._audioManager.setDeviceVolume(slave.name, volume);
            } else {
                this._audioManager.setSourceVolume(slave.name, volume);
            }
            valueLabel.set_label(`${Math.round(volume)}%`);
        });

        row.append(slider);

        return row;
    }

    _resetToDefaults() {
        this._audioManager.resetToDefaults();
        this._updateStatus();
        this._updateRoutesList();
        this._clearSelection();
    }

    _updateRecoveryStatus() {
        const missingInfo = this._audioManager.getMissingSourcesInfo();
        const hasMissing = missingInfo.length > 0;
        
        this._recoverBox.set_visible(hasMissing);
        
        if (hasMissing) {
            const devices = missingInfo.map(d => d.description).join(', ');
            this._recoverInfoLabel.set_label(
                `${missingInfo.length} input(s) detected at ALSA level but not in PulseAudio: ${devices}`
            );
        }
    }

    _recoverMissingSources() {
        const recovered = this._audioManager.recoverMissingSources();
        
        if (recovered > 0) {
            // Refresh the device list to show newly recovered sources
            this._refreshDevices();
            this._updateStatus();
        }
    }
});

