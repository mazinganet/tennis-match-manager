/**
 * Storage Module - Gestione salvataggio dati con Firebase Realtime Database
 */
const Storage = {
    KEYS: {
        PLAYERS: 'tennis_players',
        COURTS: 'tennis_courts',
        MATCHES: 'tennis_matches',
        SCHEDULED: 'tennis_scheduled',
        SETTINGS: 'tennis_settings',
        PLANNING_TEMPLATES: 'planning_templates',
        RECURRING_PLANNING: 'recurring_planning',
        COURT_RATES: 'tennis_court_rates'
    },

    // Cache locale per evitare letture ripetute
    cache: {},

    // Listeners per aggiornamenti real-time
    listeners: {},

    isInitialized: false, // Flag per bloccare salvataggi durante init

    /**
     * Salva dati - Firebase se disponibile, altrimenti localStorage
     * Ora è SINCRONA per compatibilità, ma salva su Firebase in background
     */
    save(key, data) {
        // Durante l'inizializzazione, blocca salvataggi per evitare di sovrascrivere Firebase
        if (!this.isInitialized && key === this.KEYS.PLAYERS) {
            console.warn(`⚠️ [STORAGE] Blocking save for ${key} during initialization`);
            return false;
        }

        console.log(`💾 [STORAGE] Saving ${key}, items:`, Array.isArray(data) ? data.length : 'object');

        // Aggiorna cache
        this.cache[key] = data;

        // Salva sempre in localStorage come backup
        try {
            localStorage.setItem(key, JSON.stringify(data));
            console.log(`💾 [STORAGE] Saved to localStorage: ${key}`);
        } catch (e) {
            console.error('Errore salvataggio localStorage:', e);
        }

        // Salva su Firebase se disponibile (in background)
        if (typeof firebaseReady !== 'undefined' && firebaseReady && database) {
            console.log(`🔥 [FIREBASE] Syncing ${key} to Firebase...`);
            database.ref('tennis-manager/' + key).set(data)
                .then(() => console.log(`✅ [FIREBASE] Sincronizzato: ${key}`))
                .catch(e => console.error('❌ [FIREBASE] Errore sync:', e));
        } else {
            console.warn(`⚠️ [FIREBASE] Not connected, firebaseReady=${typeof firebaseReady !== 'undefined' ? firebaseReady : 'undefined'}, database=${database ? 'exists' : 'null'}`);
        }
        return true;
    },

    /**
     * Carica dati - SINCRONA per compatibilità
     * Usa cache se disponibile, altrimenti localStorage
     */
    load(key, defaultValue = null) {
        // Prima controlla la cache (popolata da Firebase listeners)
        if (this.cache[key] !== undefined) {
            return this.cache[key];
        }

        // Fallback su localStorage
        try {
            const data = localStorage.getItem(key);
            const parsed = data ? JSON.parse(data) : defaultValue;
            this.cache[key] = parsed;
            return parsed;
        } catch (e) {
            console.error('Errore caricamento localStorage:', e);
            return defaultValue;
        }
    },

    /**
     * Carica dati da Firebase in modo asincrono
     * Usato all'inizializzazione per popolare la cache
     */
    async loadFromFirebase(key, defaultValue = null) {
        console.log(`📥 [LOAD] Loading ${key} from Firebase...`);
        if (typeof firebaseReady !== 'undefined' && firebaseReady && database) {
            try {
                const snapshot = await database.ref('tennis-manager/' + key).once('value');
                const data = snapshot.val();
                console.log(`📥 [LOAD] Firebase returned for ${key}:`, data !== null ? (Array.isArray(data) ? `${data.length} items` : 'object') : 'null');
                if (data !== null) {
                    // Aggiorna cache e localStorage
                    this.cache[key] = data;
                    localStorage.setItem(key, JSON.stringify(data));
                    console.log(`📥 [LOAD] Cache updated for ${key}`);
                    return data;
                }
            } catch (e) {
                console.error('❌ [LOAD] Errore caricamento Firebase:', e);
            }
        } else {
            console.warn(`⚠️ [LOAD] Firebase not ready, using localStorage for ${key}`);
        }
        // Fallback su localStorage
        return this.load(key, defaultValue);
    },

    /**
     * Sottoscrivi a cambiamenti real-time per una chiave
     */
    subscribe(key, callback) {
        if (typeof firebaseReady !== 'undefined' && firebaseReady && database) {
            const ref = database.ref('tennis-manager/' + key);
            ref.on('value', (snapshot) => {
                const data = snapshot.val();
                console.log(`📡 [SUBSCRIBE] Received update for ${key}:`, data !== null ? (Array.isArray(data) ? `${data.length} items` : 'object') : 'null');
                this.cache[key] = data;
                // Aggiorna localStorage
                try {
                    localStorage.setItem(key, JSON.stringify(data));
                } catch (e) { }
                if (callback) callback(data);
            });
            this.listeners[key] = ref;
            console.log(`📡 [SUBSCRIBE] Sottoscritto a aggiornamenti: ${key}`);
        }
    },

    /**
     * Rimuovi sottoscrizione
     */
    unsubscribe(key) {
        if (this.listeners[key]) {
            this.listeners[key].off();
            delete this.listeners[key];
        }
    },

    generateId() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    },

    async initializeDefaults() {
        console.log('🚀 [INIT] initializeDefaults called');

        // Se Firebase è connesso, carica i dati prima
        if (this.isFirebaseConnected()) {
            console.log('🔄 [INIT] Firebase connected, loading data...');
            await Promise.all([
                this.loadFromFirebase(this.KEYS.PLAYERS, []),
                this.loadFromFirebase(this.KEYS.COURTS, []),
                this.loadFromFirebase(this.KEYS.MATCHES, []),
                this.loadFromFirebase(this.KEYS.SCHEDULED, []),
                this.loadFromFirebase(this.KEYS.SETTINGS, {}),
                this.loadFromFirebase(this.KEYS.PLANNING_TEMPLATES, {}),
                this.loadFromFirebase(this.KEYS.COURT_RATES, {})
            ]);
            console.log('✅ [INIT] Data loaded from Firebase');
            console.log('📊 [INIT] Players in cache:', this.cache[this.KEYS.PLAYERS]?.length || 0);
            console.log('📊 [INIT] Courts in cache:', this.cache[this.KEYS.COURTS]?.length || 0);

            // Se abbiamo caricato dati da Firebase, NON sovrascrivere con defaults
            if (this.cache[this.KEYS.PLAYERS] && this.cache[this.KEYS.PLAYERS].length > 0) {
                console.log('✅ [INIT] Players loaded from Firebase, skipping defaults');
                this.isInitialized = true;
                return; // Exit early, don't overwrite with defaults
            }
            if (this.cache[this.KEYS.COURTS] && this.cache[this.KEYS.COURTS].length > 0) {
                console.log('✅ [INIT] Courts loaded from Firebase, skipping defaults');
                this.isInitialized = true;
                return; // Exit early, don't overwrite with defaults  
            }
        } else {
            console.log('⚠️ [INIT] Firebase not connected, using localStorage');
        }

        // Inizializza defaults SOLO se NON abbiamo dati da Firebase o localStorage
        console.log('🔧 [INIT] Checking if defaults needed...');
        const courts = this.load(this.KEYS.COURTS);
        if (!courts || !Array.isArray(courts) || courts.length === 0) {
            console.log('🔧 [INIT] No courts found, creating defaults');
            const defaultCourts = [
                { id: this.generateId(), name: 'Campo 1', type: 'winter', surface: 'terra-rossa', available: true, reservations: [] },
                { id: this.generateId(), name: 'Campo 2', type: 'winter', surface: 'terra-rossa', available: true, reservations: [] },
                { id: this.generateId(), name: 'Campo 3', type: 'winter', surface: 'terra-rossa', available: true, reservations: [] },
                { id: this.generateId(), name: 'Campo 4', type: 'winter', surface: 'terra-rossa', available: true, reservations: [] },
                { id: this.generateId(), name: 'Campo 5', type: 'summer', surface: 'terra-rossa', available: true, reservations: [] },
                { id: this.generateId(), name: 'Campo 6', type: 'summer', surface: 'terra-rossa', available: true, reservations: [] }
            ];
            this.save(this.KEYS.COURTS, defaultCourts);
        }

        const players = this.load(this.KEYS.PLAYERS);
        if (!players || !Array.isArray(players)) {
            console.log('🔧 [INIT] No players array found, initializing empty');
            this.save(this.KEYS.PLAYERS, []);
        } else {
            console.log('✅ [INIT] Players already exist:', players.length);
        }

        if (!this.load(this.KEYS.MATCHES)) this.save(this.KEYS.MATCHES, []);
        if (!this.load(this.KEYS.SCHEDULED)) this.save(this.KEYS.SCHEDULED, []);
        if (!this.load(this.KEYS.SETTINGS)) {
            this.save(this.KEYS.SETTINGS, { season: 'winter', minCompatibility: 30, maxLevelDifference: 1 });
        }
        if (!this.load(this.KEYS.COURT_RATES)) {
            this.save(this.KEYS.COURT_RATES, {
                seasonCoveredStart: '',
                seasonUncoveredStart: '',
                timeSlots: {
                    morningStart: '08:00',
                    afternoonStart: '13:00',
                    eveningStart: '19:00'
                },
                rates: {
                    covered: {
                        morning: { member: 5, nonMember: 8 },
                        afternoon: { member: 7, nonMember: 10 },
                        evening: { member: 8, nonMember: 12 }
                    },
                    uncovered: {
                        morning: { member: 3, nonMember: 5 },
                        afternoon: { member: 5, nonMember: 7 },
                        evening: { member: 6, nonMember: 8 }
                    }
                }
            });
        }

        this.isInitialized = true;
        console.log('✅ [INIT] Initialization complete, saves enabled');
    },

    /**
     * Esporta tutti i dati (per backup)
     */
    exportData() {
        return {
            players: this.load(this.KEYS.PLAYERS, []),
            courts: this.load(this.KEYS.COURTS, []),
            matches: this.load(this.KEYS.MATCHES, []),
            scheduled: this.load(this.KEYS.SCHEDULED, []),
            settings: this.load(this.KEYS.SETTINGS, {}),
            planning_templates: this.load(this.KEYS.PLANNING_TEMPLATES, {}),
            exportDate: new Date().toISOString()
        };
    },

    /**
     * Importa dati da backup
     */
    importData(data) {
        if (data.players) this.save(this.KEYS.PLAYERS, data.players);
        if (data.courts) this.save(this.KEYS.COURTS, data.courts);
        if (data.matches) this.save(this.KEYS.MATCHES, data.matches);
        if (data.scheduled) this.save(this.KEYS.SCHEDULED, data.scheduled);
        if (data.settings) this.save(this.KEYS.SETTINGS, data.settings);
        if (data.planning_templates) this.save(this.KEYS.PLANNING_TEMPLATES, data.planning_templates);
    },

    /**
     * Scarica un backup completo dei dati in formato JSON
     */
    downloadBackup() {
        const data = this.exportData();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const date = new Date().toISOString().split('T')[0];
        a.href = url;
        a.download = `tennis-backup-${date}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        console.log('Backup scaricato con successo!');
    },

    /**
     * Carica dati da un file JSON di backup
     */
    loadFromBackup(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = JSON.parse(e.target.result);
                    this.importData(data);
                    console.log('Backup caricato con successo!');
                    resolve(data);
                } catch (err) {
                    console.error('Errore parsing backup:', err);
                    reject(err);
                }
            };
            reader.onerror = () => reject(reader.error);
            reader.readAsText(file);
        });
    },

    /**
     * Migra tutti i dati da localStorage a Firebase
     */
    async migrateToFirebase() {
        if (!this.isFirebaseConnected()) {
            alert('❌ Firebase non è configurato correttamente!\n\nSegui le istruzioni nel file js/firebase-config.js');
            return false;
        }

        if (!confirm('Questa operazione migrerà tutti i dati locali a Firebase.\nI dati su Firebase (se presenti) verranno sovrascritti.\n\nContinuare?')) {
            return false;
        }

        try {
            console.log('🔄 Inizio migrazione dati a Firebase...');

            // Leggi tutti i dati da localStorage
            const localData = {
                [this.KEYS.PLAYERS]: JSON.parse(localStorage.getItem(this.KEYS.PLAYERS) || '[]'),
                [this.KEYS.COURTS]: JSON.parse(localStorage.getItem(this.KEYS.COURTS) || '[]'),
                [this.KEYS.MATCHES]: JSON.parse(localStorage.getItem(this.KEYS.MATCHES) || '[]'),
                [this.KEYS.SCHEDULED]: JSON.parse(localStorage.getItem(this.KEYS.SCHEDULED) || '[]'),
                [this.KEYS.SETTINGS]: JSON.parse(localStorage.getItem(this.KEYS.SETTINGS) || '{}'),
                [this.KEYS.PLANNING_TEMPLATES]: JSON.parse(localStorage.getItem(this.KEYS.PLANNING_TEMPLATES) || '{}')
            };

            // Salva tutto su Firebase
            for (const [key, value] of Object.entries(localData)) {
                if (value && (Array.isArray(value) ? value.length > 0 : Object.keys(value).length > 0)) {
                    await database.ref('tennis-manager/' + key).set(value);
                    console.log(`✅ Migrato: ${key}`);
                }
            }

            console.log('✅ Migrazione completata con successo!');
            alert('✅ Migrazione completata!\n\nI dati sono ora sincronizzati su Firebase.\nQualsiasi dispositivo potrà vedere le stesse informazioni.');

            // Ricarica la pagina per applicare le sottoscrizioni real-time
            location.reload();
            return true;
        } catch (error) {
            console.error('❌ Errore durante la migrazione:', error);
            alert('❌ Errore durante la migrazione: ' + error.message);
            return false;
        }
    },

    /**
     * Verifica lo stato della connessione Firebase
     */
    isFirebaseConnected() {
        return typeof firebaseReady !== 'undefined' && firebaseReady && database !== null;
    }
};

// Migration: convert old 'medio' level to 'intermedio' (runs after load)
async function migratePlayerLevels() {
    const players = Storage.load(Storage.KEYS.PLAYERS, []);
    let changed = false;
    players.forEach(p => {
        if (p.level === 'medio') {
            p.level = 'intermedio';
            changed = true;
        }
    });
    if (changed) {
        Storage.save(Storage.KEYS.PLAYERS, players);
        console.log('Migrazione livelli completata: medio → intermedio');
    }
}
