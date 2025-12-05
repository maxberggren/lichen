const { GLib, Gio, Gtk, Adw, GObject } = imports.gi;
const { AudioManager } = imports.audio.audioManager;
const { MainWindow } = imports.ui.mainWindow;

// ============================================================================
// Lichen Application
// ============================================================================

var LichenApplication = GObject.registerClass(
class LichenApplication extends Adw.Application {
    _init() {
        super._init({
            application_id: 'com.github.lichen',
            flags: Gio.ApplicationFlags.FLAGS_NONE,
        });

        this._audioManager = null;
    }

    vfunc_activate() {
        let win = this.active_window;
        if (!win) {
            this._audioManager = new AudioManager();
            win = new MainWindow(this, this._audioManager);
        }
        win.present();
    }

    vfunc_startup() {
        super.vfunc_startup();

        // Set up application actions
        const quitAction = new Gio.SimpleAction({ name: 'quit' });
        quitAction.connect('activate', () => this.quit());
        this.add_action(quitAction);
        this.set_accels_for_action('app.quit', ['<Control>q']);

        const refreshAction = new Gio.SimpleAction({ name: 'refresh' });
        refreshAction.connect('activate', () => {
            if (this._audioManager) {
                this._audioManager.refresh();
            }
        });
        this.add_action(refreshAction);
        this.set_accels_for_action('app.refresh', ['<Control>r']);
    }

    get audioManager() {
        return this._audioManager;
    }
});

