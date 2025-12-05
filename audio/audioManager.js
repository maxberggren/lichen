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
        
        this.refresh();
        this._detectExistingRoutes();
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

                this._createdRoutes.push({
                    id: `input_restored_${Date.now()}_${Math.random()}`,
                    sinkName: baseName,
                    type: 'input',
                    description: sink.description || 'Mixed Input',
                    moduleIds: moduleIds,
                    deviceNames: [], // Unknown for restored routes
                });
            }
        }

        this._notifyListeners();
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
};