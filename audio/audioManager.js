const { GLib, Gio } = imports.gi;

// ============================================================================
// Audio Manager - PipeWire/PulseAudio Interface
// ============================================================================

var AudioManager = class AudioManager {
    constructor() {
        this._sinks = [];      // Output devices (headphones, speakers)
        this._sources = [];    // Input devices (microphones)
        this._listeners = [];
        this._createdRoutes = [];  // Track routes we've created { id, name, type, description, moduleIds }
        this._hearbackModuleId = null;  // Track hearback loopback module
        this._hearbackVolume = 0;  // 0-100 percent
        this._hearbackSinkInputIndex = null;  // Track the sink-input index for volume control
        
        this.refresh();
        this._detectExistingRoutes();
        this._cleanupOrphanedHearbackModules();
    }

    addListener(callback) {
        this._listeners.push(callback);
    }

    removeListener(callback) {
        this._listeners = this._listeners.filter(l => l !== callback);
    }

    _notifyListeners() {
        this._listeners.forEach(cb => cb());
    }

    refresh() {
        this._fetchSinks();
        this._fetchSources();
        this._cleanupOrphanedHearbackModules();
        this._notifyListeners();
    }

    _runPactl(args) {
        try {
            const [ok, stdout, stderr, exitStatus] = GLib.spawn_command_line_sync(
                `pactl ${args}`
            );
            if (ok && exitStatus === 0) {
                return new TextDecoder().decode(stdout);
            }
        } catch (e) {
            logError(e, 'Failed to run pactl');
        }
        return '';
    }

    _parsePactlList(output, type) {
        const items = [];
        // Split on lines that start with "Sink #" or "Source #"
        const blocks = output.split(/\n(?=(?:Sink|Source) #\d+)/);
        
        for (const block of blocks) {
            if (!block.trim()) continue;
            
            // Match the header line: "Sink #59" or "Source #59"
            const idMatch = block.match(/^(?:Sink|Source) #(\d+)/);
            // Match tab-indented fields
            const nameMatch = block.match(/\n\tName: (.+)/);
            const descMatch = block.match(/\n\tDescription: (.+)/);
            const stateMatch = block.match(/\n\tState: (.+)/);
            
            if (idMatch && nameMatch) {
                items.push({
                    id: parseInt(idMatch[1]),
                    name: nameMatch[1].trim(),
                    description: descMatch ? descMatch[1].trim() : nameMatch[1].trim(),
                    state: stateMatch ? stateMatch[1].trim() : 'UNKNOWN',
                    type: type,
                });
            }
        }
        
        return items;
    }

    _fetchSinks() {
        const output = this._runPactl('list sinks');
        this._sinks = this._parsePactlList(output, 'sink');
    }

    _fetchSources() {
        const output = this._runPactl('list sources');
        // Filter out monitor sources (they mirror sinks)
        this._sources = this._parsePactlList(output, 'source')
            .filter(s => !s.name.includes('.monitor'));
    }

    // Detect existing lichen routes on startup
    _detectExistingRoutes() {
        // Get all modules to find their IDs
        const modulesOutput = this._runPactl('list modules');
        const moduleMap = this._parseModules(modulesOutput);

        // Find lichen output sinks (combined sinks)
        for (const sink of this._sinks) {
            if (sink.name.startsWith('lichen_output_')) {
                // Already tracked?
                if (this._createdRoutes.some(r => r.sinkName === sink.name)) continue;

                const moduleIds = moduleMap.get(sink.name) || [];
                this._createdRoutes.push({
                    id: `output_restored_${Date.now()}_${Math.random()}`,
                    sinkName: sink.name,
                    type: 'output',
                    description: sink.description,
                    moduleIds: moduleIds,
                    deviceNames: [], // Unknown for restored routes
                });
            }
        }

        // Find lichen input sinks (null sinks for mixing)
        for (const sink of this._sinks) {
            if (sink.name.startsWith('lichen_input_') && sink.name.endsWith('_null')) {
                const baseName = sink.name.replace(/_null$/, '');
                // Already tracked?
                if (this._createdRoutes.some(r => r.sinkName === baseName)) continue;

                // Find the null sink module and associated loopbacks
                const moduleIds = [];
                const nullModuleId = moduleMap.get(sink.name);
                if (nullModuleId) moduleIds.push(...nullModuleId);
                
                // Find loopback modules that target this sink
                for (const [key, ids] of moduleMap.entries()) {
                    if (key.includes(`sink=${sink.name}`)) {
                        moduleIds.push(...ids);
                    }
                }

                // Find the remapped source (_mic) to get the user-facing description
                const remappedSourceName = `${baseName}_mic`;
                const remappedSource = this._sources.find(s => s.name === remappedSourceName);
                const description = remappedSource ? remappedSource.description : 'LichenMixedInput';

                // Find the remap-source module ID
                const remapKey = `remap-source=${remappedSourceName}`;
                const remapModuleIds = moduleMap.get(remapKey) || [];
                moduleIds.push(...remapModuleIds);

                this._createdRoutes.push({
                    id: `input_restored_${Date.now()}_${Math.random()}`,
                    sinkName: baseName,
                    type: 'input',
                    description: description,
                    moduleIds: moduleIds,
                    deviceNames: [], // Unknown for restored routes
                });
            }
        }

        // Find orphaned remap-source modules (where the null sink was removed but remap-source remains)
        for (const [key, moduleIds] of moduleMap.entries()) {
            if (!key.startsWith('remap-source=lichen_input_')) continue;
            
            const sourceName = key.replace('remap-source=', '');
            // Check if this is already tracked by a proper route
            if (this._createdRoutes.some(r => r.type === 'input' && r.moduleIds.some(id => moduleIds.includes(id)))) {
                continue;
            }
            
            // This is an orphan - the remap-source exists but the null sink is gone
            const source = this._sources.find(s => s.name === sourceName);
            const description = source ? source.description : 'Orphaned LichenMixedInput';
            
            this._createdRoutes.push({
                id: `orphan_${Date.now()}_${Math.random()}`,
                sinkName: sourceName,
                type: 'input',
                description: `${description} (orphaned)`,
                moduleIds: moduleIds,
                deviceNames: [],
                isOrphan: true,
            });
        }

        this._notifyListeners();
    }

    // Clean up orphaned hearback loopback modules (from previous sessions)
    _cleanupOrphanedHearbackModules() {
        const modulesOutput = this._runPactl('list modules short');
        const lines = modulesOutput.split('\n');
        
        for (const line of lines) {
            if (!line.includes('module-loopback')) continue;
            if (!line.includes('lichen_input_') || !line.includes('lichen_output_')) continue;
            
            // This is a hearback loopback - check if the source/sink still exist
            const parts = line.split('\t');
            if (parts.length < 3) continue;
            
            const moduleId = parts[0];
            const args = parts[2] || '';
            
            // Extract source and sink from args
            const sourceMatch = args.match(/source=([^\s]+)/);
            const sinkMatch = args.match(/sink=([^\s]+)/);
            
            if (sourceMatch && sinkMatch) {
                const sourceName = sourceMatch[1];
                const sinkName = sinkMatch[1];
                
                // Check if the sink exists
                const sinkExists = this._sinks.some(s => s.name === sinkName);
                // Check if the source exists (need to check raw sources including monitors)
                const sourceExists = this._runPactl('list sources short').includes(sourceName);
                
                if (!sinkExists || !sourceExists) {
                    // Orphaned module - unload it
                    log(`Cleaning up orphaned hearback module ${moduleId}`);
                    try {
                        GLib.spawn_command_line_sync(`pactl unload-module ${moduleId}`);
                    } catch (e) {
                        // Ignore errors
                    }
                }
            }
        }
    }

    // Parse pactl list modules to map sink names to module IDs
    _parseModules(output) {
        const moduleMap = new Map();
        const blocks = output.split(/\n(?=Module #\d+)/);

        for (const block of blocks) {
            if (!block.trim()) continue;

            const idMatch = block.match(/^Module #(\d+)/);
            const nameMatch = block.match(/\n\tName: (.+)/);
            const argsMatch = block.match(/\n\tArgument: (.+)/);

            if (idMatch && nameMatch) {
                const moduleId = parseInt(idMatch[1]);
                const moduleName = nameMatch[1].trim();
                const args = argsMatch ? argsMatch[1].trim() : '';

                // For combine-sink, extract sink_name
                if (moduleName === 'module-combine-sink') {
                    const sinkNameMatch = args.match(/sink_name=(\S+)/);
                    if (sinkNameMatch) {
                        const sinkName = sinkNameMatch[1];
                        if (!moduleMap.has(sinkName)) moduleMap.set(sinkName, []);
                        moduleMap.get(sinkName).push(moduleId);
                    }
                }

                // For null-sink, extract sink_name
                if (moduleName === 'module-null-sink') {
                    const sinkNameMatch = args.match(/sink_name=(\S+)/);
                    if (sinkNameMatch) {
                        const sinkName = sinkNameMatch[1];
                        if (!moduleMap.has(sinkName)) moduleMap.set(sinkName, []);
                        moduleMap.get(sinkName).push(moduleId);
                    }
                }

                // For loopback, store with sink= as key
                if (moduleName === 'module-loopback') {
                    const sinkMatch = args.match(/sink=(\S+)/);
                    if (sinkMatch) {
                        const key = `sink=${sinkMatch[1]}`;
                        if (!moduleMap.has(key)) moduleMap.set(key, []);
                        moduleMap.get(key).push(moduleId);
                    }
                }

                // For remap-source, extract source_name
                if (moduleName === 'module-remap-source') {
                    const sourceNameMatch = args.match(/source_name=(\S+)/);
                    if (sourceNameMatch) {
                        const sourceName = sourceNameMatch[1];
                        const key = `remap-source=${sourceName}`;
                        if (!moduleMap.has(key)) moduleMap.set(key, []);
                        moduleMap.get(key).push(moduleId);
                    }
                }
            }
        }

        return moduleMap;
    }

    get sinks() {
        // Filter out sinks we created (tracked routes + any lichen_* sinks)
        const createdNames = this._createdRoutes
            .filter(r => r.type === 'output')
            .map(r => r.sinkName);
        return this._sinks.filter(s => 
            !createdNames.includes(s.name) && 
            !s.name.startsWith('lichen_')
        );
    }

    get sources() {
        // Filter out internal lichen sources that shouldn't be shown to users
        return this._sources.filter(s => {
            // Hide monitors of combined output sinks (not useful as mic)
            if (s.name.startsWith('lichen_output_') && s.name.endsWith('.monitor')) {
                return false;
            }
            // Hide the internal null sink monitors (the _mic remapped source is the user-facing one)
            if (s.name.startsWith('lichen_input_') && s.name.endsWith('_null.monitor')) {
                return false;
            }
            // Hide the remapped _mic sources (these are our created virtual mics, shown in routes)
            if (s.name.startsWith('lichen_input_') && s.name.endsWith('_mic')) {
                return false;
            }
            return true;
        });
    }
    
    // Get the mixed input sources (virtual mics) we've created
    get mixedInputSources() {
        // Return the remapped sources (ending in _mic) which are the proper virtual mics
        return this._sources.filter(s => 
            s.name.startsWith('lichen_input_') && s.name.endsWith('_mic')
        );
    }

    get createdRoutes() {
        return this._createdRoutes;
    }

    // Create a combined virtual sink for multiple output devices
    createCombinedSink(name, sinkNames, description) {
        if (sinkNames.length < 2) {
            log('Need at least 2 sinks to combine');
            return false;
        }

        const slaves = sinkNames.join(',');
        const sinkDesc = description || `LichenMixedOutput`;
        const cmd = `pactl load-module module-combine-sink sink_name=${name} slaves=${slaves} sink_properties=device.description="${sinkDesc}"`;
        
        try {
            const [ok, stdout, stderr, exitStatus] = GLib.spawn_command_line_sync(cmd);
            if (ok && exitStatus === 0) {
                const moduleId = new TextDecoder().decode(stdout).trim();
                if (moduleId) {
                    const routeId = `output_${Date.now()}`;
                    // Get descriptions for the combined sinks
                    const deviceDescriptions = sinkNames.map(sn => {
                        const sink = this._sinks.find(s => s.name === sn);
                        return sink ? sink.description : sn;
                    });
                    this._createdRoutes.push({
                        id: routeId,
                        sinkName: name,
                        type: 'output',
                        description: description || `Combined: ${sinkNames.length} outputs`,
                        moduleIds: [parseInt(moduleId)],
                        deviceNames: deviceDescriptions,
                    });
                }
                this.refresh();
                return true;
            }
        } catch (e) {
            logError(e, 'Failed to create combined sink');
        }
        return false;
    }

    // Create a virtual source that mixes multiple microphones
    createMixedSource(name, sourceNames, description) {
        // Strategy: Create a null sink, loopback all sources into it,
        // then use module-remap-source to expose the monitor as a proper source
        // that browsers/apps will recognize as a microphone (not a monitor)
        
        const micDesc = description || `LichenMixedInput`;
        const nullSinkName = `${name}_null`;
        const remappedSourceName = `${name}_mic`;
        
        // Step 1: Create null sink to mix audio into (internal, hidden from user)
        // Mark as internal with device.class=filter so apps like Google Meet hide it
        const nullSinkCmd = `pactl load-module module-null-sink sink_name=${nullSinkName} sink_properties='device.description="LichenInternal" device.class="filter"'`;
        
        try {
            let [ok, stdout, stderr, exitStatus] = GLib.spawn_command_line_sync(nullSinkCmd);
            if (!ok || exitStatus !== 0) {
                return false;
            }
            
            const moduleIds = [];
            const nullModuleId = new TextDecoder().decode(stdout).trim();
            if (nullModuleId) {
                moduleIds.push(parseInt(nullModuleId));
            }

            // Step 2: Create loopback for each source to the null sink
            for (const sourceName of sourceNames) {
                const loopbackCmd = `pactl load-module module-loopback source=${sourceName} sink=${nullSinkName} latency_msec=1`;
                const [lok, lstdout] = GLib.spawn_command_line_sync(loopbackCmd);
                if (lok) {
                    const loopbackId = new TextDecoder().decode(lstdout).trim();
                    if (loopbackId) {
                        moduleIds.push(parseInt(loopbackId));
                    }
                }
            }

            // Step 3: Create a remap-source to expose the monitor as a proper mic source
            // This makes it appear as a real microphone to browsers/apps like Google Meet
            const remapCmd = `pactl load-module module-remap-source source_name=${remappedSourceName} master=${nullSinkName}.monitor source_properties=device.description="${micDesc}"`;
            const [rok, rstdout] = GLib.spawn_command_line_sync(remapCmd);
            if (rok) {
                const remapId = new TextDecoder().decode(rstdout).trim();
                if (remapId) {
                    moduleIds.push(parseInt(remapId));
                }
            }

            const routeId = `input_${Date.now()}`;
            // Get descriptions for the mixed sources
            const deviceDescriptions = sourceNames.map(sn => {
                const source = this._sources.find(s => s.name === sn);
                return source ? source.description : sn;
            });
            this._createdRoutes.push({
                id: routeId,
                sinkName: name,
                sourceName: remappedSourceName,  // Track the actual source name for apps
                type: 'input',
                description: description || `Mixed: ${sourceNames.length} inputs`,
                moduleIds: moduleIds,
                deviceNames: deviceDescriptions,
            });

            this.refresh();
            return true;
        } catch (e) {
            logError(e, 'Failed to create mixed source');
        }
        return false;
    }

    // Remove a specific route by ID
    removeRoute(routeId) {
        const route = this._createdRoutes.find(r => r.id === routeId);
        if (!route) return false;

        // Disable hearback if we're removing a route it depends on
        if (this._hearbackEnabled && (route.type === 'input' || route.type === 'output')) {
            this.disableHearback();
        }

        // If we have module IDs, unload them
        if (route.moduleIds && route.moduleIds.length > 0) {
            for (const moduleId of route.moduleIds) {
                try {
                    GLib.spawn_command_line_sync(`pactl unload-module ${moduleId}`);
                } catch (e) {
                    // Module may already be unloaded, ignore
                }
            }
        } else {
            // No module IDs - try to find and unload by name
            const modulesOutput = this._runPactl('list modules');
            const moduleMap = this._parseModules(modulesOutput);
            
            if (route.type === 'output') {
                const moduleIds = moduleMap.get(route.sinkName) || [];
                for (const moduleId of moduleIds) {
                    try {
                        GLib.spawn_command_line_sync(`pactl unload-module ${moduleId}`);
                    } catch (e) {}
                }
            } else if (route.type === 'input') {
                // Unload null sink
                const nullSinkName = `${route.sinkName}_null`;
                const nullModuleIds = moduleMap.get(nullSinkName) || [];
                // Unload loopbacks first
                for (const [key, ids] of moduleMap.entries()) {
                    if (key === `sink=${nullSinkName}`) {
                        for (const moduleId of ids) {
                            try {
                                GLib.spawn_command_line_sync(`pactl unload-module ${moduleId}`);
                            } catch (e) {}
                        }
                    }
                }
                // Then unload null sink
                for (const moduleId of nullModuleIds) {
                    try {
                        GLib.spawn_command_line_sync(`pactl unload-module ${moduleId}`);
                    } catch (e) {}
                }
            }
        }

        this._createdRoutes = this._createdRoutes.filter(r => r.id !== routeId);
        this.refresh();
        return true;
    }

    // Reset - unload all modules we've created
    resetToDefaults() {
        // Disable hearback first
        this.disableHearback();

        for (const route of this._createdRoutes) {
            for (const moduleId of route.moduleIds) {
                try {
                    GLib.spawn_command_line_sync(`pactl unload-module ${moduleId}`);
                } catch (e) {
                    // Module may already be unloaded, ignore
                }
            }
        }
        this._createdRoutes = [];
        this.refresh();
        return true;
    }

    get hasActiveRoutes() {
        return this._createdRoutes.length > 0;
    }

    // Move an application's audio to a specific sink
    moveAppToSink(appStreamId, sinkName) {
        const cmd = `pactl move-sink-input ${appStreamId} ${sinkName}`;
        try {
            GLib.spawn_command_line_sync(cmd);
            return true;
        } catch (e) {
            logError(e, 'Failed to move app to sink');
        }
        return false;
    }

    // Set default sink
    setDefaultSink(sinkName) {
        const cmd = `pactl set-default-sink ${sinkName}`;
        try {
            GLib.spawn_command_line_sync(cmd);
            return true;
        } catch (e) {
            logError(e, 'Failed to set default sink');
        }
        return false;
    }

    // Set default source
    setDefaultSource(sourceName) {
        const cmd = `pactl set-default-source ${sourceName}`;
        try {
            GLib.spawn_command_line_sync(cmd);
            return true;
        } catch (e) {
            logError(e, 'Failed to set default source');
        }
        return false;
    }

    // Get hearback volume (0-100)
    get hearbackVolume() {
        return this._hearbackVolume;
    }

    // Get hearback enabled state (volume > 0)
    get hearbackEnabled() {
        return this._hearbackVolume > 0 && this._hearbackModuleId !== null;
    }

    // Set hearback volume (0-100)
    // Creates the loopback if needed, adjusts volume, or removes if 0
    setHearbackVolume(volume) {
        volume = Math.max(0, Math.min(100, volume));
        this._hearbackVolume = volume;

        if (volume === 0) {
            // Disable hearback
            this._disableHearback();
            return true;
        }

        // Enable hearback if not already enabled
        if (!this._hearbackModuleId) {
            if (!this._enableHearback()) {
                return false;
            }
        }

        // Set the volume on the loopback's sink-input
        this._setHearbackSinkInputVolume(volume);
        return true;
    }

    // Find and store the sink-input index for the hearback loopback
    _findHearbackSinkInput() {
        if (!this._hearbackModuleId) return null;

        // List sink-inputs and find the one from our loopback module
        const output = this._runPactl('list sink-inputs');
        const blocks = output.split(/\n(?=Sink Input #\d+)/);

        for (const block of blocks) {
            if (!block.trim()) continue;

            const idMatch = block.match(/^Sink Input #(\d+)/);
            // The property is pulse.module.id in PipeWire
            const moduleMatch = block.match(/pulse\.module\.id = "(\d+)"/);

            if (idMatch && moduleMatch) {
                const moduleId = parseInt(moduleMatch[1]);
                if (moduleId === this._hearbackModuleId) {
                    return parseInt(idMatch[1]);
                }
            }
        }
        return null;
    }

    // Set the volume on the hearback sink-input
    _setHearbackSinkInputVolume(volumePercent) {
        // Find the sink-input if we don't have it yet
        if (!this._hearbackSinkInputIndex) {
            this._hearbackSinkInputIndex = this._findHearbackSinkInput();
        }

        if (!this._hearbackSinkInputIndex) {
            log('Could not find hearback sink-input');
            return false;
        }

        // Convert percentage to PulseAudio volume (65536 = 100%)
        const paVolume = Math.round((volumePercent / 100) * 65536);
        const cmd = `pactl set-sink-input-volume ${this._hearbackSinkInputIndex} ${paVolume}`;

        try {
            GLib.spawn_command_line_sync(cmd);
            return true;
        } catch (e) {
            logError(e, 'Failed to set hearback volume');
        }
        return false;
    }

    // Enable hearback - route mixed input to output so you can hear yourself
    _enableHearback() {
        // Find the active mixed input route
        const inputRoute = this._createdRoutes.find(r => r.type === 'input');
        if (!inputRoute) {
            log('No mixed input route found for hearback');
            return false;
        }

        // Find the active combined output route
        const outputRoute = this._createdRoutes.find(r => r.type === 'output');
        if (!outputRoute) {
            log('No combined output route found for hearback');
            return false;
        }

        // Get the null sink monitor (the source that has the mixed mic audio)
        const nullSinkMonitor = `${inputRoute.sinkName}_null.monitor`;
        const outputSinkName = outputRoute.sinkName;

        // Create a loopback from the mixed input to the combined output
        const loopbackCmd = `pactl load-module module-loopback source=${nullSinkMonitor} sink=${outputSinkName} latency_msec=1`;
        
        try {
            const [ok, stdout, stderr, exitStatus] = GLib.spawn_command_line_sync(loopbackCmd);
            if (ok && exitStatus === 0) {
                const moduleId = new TextDecoder().decode(stdout).trim();
                if (moduleId) {
                    this._hearbackModuleId = parseInt(moduleId);
                    this._hearbackSinkInputIndex = null;  // Will be found on first volume set
                    this._notifyListeners();
                    return true;
                }
            }
        } catch (e) {
            logError(e, 'Failed to enable hearback');
        }
        return false;
    }

    // Disable hearback
    _disableHearback() {
        if (this._hearbackModuleId) {
            try {
                GLib.spawn_command_line_sync(`pactl unload-module ${this._hearbackModuleId}`);
            } catch (e) {
                // Module may already be unloaded
            }
            this._hearbackModuleId = null;
            this._hearbackSinkInputIndex = null;
        }
        this._notifyListeners();
        return true;
    }

    // Disable hearback (public method for cleanup)
    disableHearback() {
        this._hearbackVolume = 0;
        return this._disableHearback();
    }

    // Check if hearback can be enabled (requires both input and output routes)
    get canEnableHearback() {
        const hasInput = this._createdRoutes.some(r => r.type === 'input');
        const hasOutput = this._createdRoutes.some(r => r.type === 'output');
        return hasInput && hasOutput;
    }
};