/**
 * Main Application - Tennis Match Manager
 */
const App = {
    currentTab: 'dashboard',
    currentSeason: 'winter',
    currentProposals: [],
    currentPlanningDate: new Date(), // Start of the week displayed in planning
    activePlayerSlot: 1, // Slot attivo per inserimento giocatore (1-4)

    init() {
        this.loadSettings();
        this.bindEvents();
        this.showTab('dashboard');
        this.updateDashboard();

        // Subscribe to real-time updates for planning templates
        if (Storage.isFirebaseConnected && Storage.isFirebaseConnected()) {
            Storage.subscribe(Storage.KEYS.PLANNING_TEMPLATES, () => {
                console.log('📡 Admin: Planning templates aggiornati da remoto');
                if (this.currentTab === 'planning') {
                    this.renderPlanning();
                }
            });
            Storage.subscribe(Storage.KEYS.COURTS, () => {
                console.log('📡 Admin: Courts aggiornati da remoto');
                this.refreshCurrentTab();
            });
            Storage.subscribe(Storage.KEYS.PLAYERS, () => {
                console.log('📡 Admin: Players aggiornati da remoto');
                Players.renderTable();
                if (this.currentTab === 'players') {
                    this.refreshCurrentTab();
                }
            });
            Storage.subscribe(Storage.KEYS.COURT_RATES, () => {
                console.log('📡 Admin: Tariffe aggiornate da remoto');
                this.loadCourtRates();
            });
            // Subscribe to SETTINGS for cleanup dropdown sync
            Storage.subscribe(Storage.KEYS.SETTINGS, (data) => {
                console.log('📡 Settings aggiornati da remoto, data:', JSON.stringify(data));
                const select = document.getElementById('auto-cleanup-months');
                console.log('📋 [CLEANUP] Dropdown element found:', !!select);
                if (select && data) {
                    const months = data.autoCleanupMonths !== undefined ? data.autoCleanupMonths : 0;
                    select.value = months.toString();
                    console.log(`📋 [CLEANUP] Dropdown aggiornato a: ${months} mesi`);
                }
            });
        }

        // Initialize view mode - always start with horizontal view
        this.planningViewMode = 'horizontal';
        this.togglePlanningView('horizontal');

        // Initialize cleanup settings UI and run auto-cleanup for any user
        // Wait a bit for Firebase to be fully ready
        setTimeout(() => {
            Storage.loadCleanupSettings().then(() => {
                // Run silent auto-cleanup on any user startup after settings are loaded
                const deleted = Storage.runAutoCleanup(true);
                if (deleted > 0) {
                    console.log(`🗑️ [AUTO-CLEANUP] Cancellate ${deleted} prenotazioni vecchie all'avvio`);
                }
            });
        }, 1500);

        // Also try to update the dropdown after 3 seconds as backup
        setTimeout(() => {
            const settings = Storage.load(Storage.KEYS.SETTINGS, {});
            const select = document.getElementById('auto-cleanup-months');
            if (select && settings.autoCleanupMonths !== undefined) {
                select.value = settings.autoCleanupMonths.toString();
                console.log(`📋 [CLEANUP] Dropdown aggiornato (backup): ${settings.autoCleanupMonths} mesi`);
            }
        }, 3000);

        // Load PayPal configuration
        this.loadPayPalConfig();
    },

    loadSettings() {
        const settings = Storage.load(Storage.KEYS.SETTINGS, {});
        this.currentSeason = settings.season || 'winter';
        document.getElementById('season-select').value = this.currentSeason;

        // Load court rates
        this.loadCourtRates();
    },

    loadCourtRates() {
        const defaultRates = {
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
        };

        // Load rates per club (winter = Viserba, summer = Rivabella)
        const allRates = Storage.load(Storage.KEYS.COURT_RATES, {});
        const clubKey = this.currentSeason; // 'winter' or 'summer'
        const storedRates = allRates[clubKey] || defaultRates;

        // Merge with defaults to ensure structure exists if upgrading from old version
        const rates = {
            ...defaultRates,
            ...storedRates,
            timeSlots: { ...defaultRates.timeSlots, ...(storedRates.timeSlots || {}) },
            rates: {
                covered: {
                    morning: { ...defaultRates.rates.covered.morning, ...(storedRates.rates?.covered?.morning || {}) },
                    afternoon: { ...defaultRates.rates.covered.afternoon, ...(storedRates.rates?.covered?.afternoon || {}) },
                    evening: { ...defaultRates.rates.covered.evening, ...(storedRates.rates?.covered?.evening || {}) }
                },
                uncovered: {
                    morning: { ...defaultRates.rates.uncovered.morning, ...(storedRates.rates?.uncovered?.morning || {}) },
                    afternoon: { ...defaultRates.rates.uncovered.afternoon, ...(storedRates.rates?.uncovered?.afternoon || {}) },
                    evening: { ...defaultRates.rates.uncovered.evening, ...(storedRates.rates?.uncovered?.evening || {}) }
                }
            }
        };

        // Populate Season Dates
        const scs = document.getElementById('season-covered-start');
        const sus = document.getElementById('season-uncovered-start');
        if (scs) scs.value = rates.seasonCoveredStart || '';
        if (sus) sus.value = rates.seasonUncoveredStart || '';

        // Populate Time Slots
        const tsm = document.getElementById('slot-morning-start');
        const tsa = document.getElementById('slot-afternoon-start');
        const tse = document.getElementById('slot-evening-start');
        if (tsm) tsm.value = rates.timeSlots.morningStart;
        if (tsa) tsa.value = rates.timeSlots.afternoonStart;
        if (tse) tse.value = rates.timeSlots.eveningStart;

        // Helper to safely set values
        const setVal = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.value = val;
        };

        // Populate Covered Rates
        setVal('rate-covered-morning-member', rates.rates.covered.morning.member);
        setVal('rate-covered-morning-nonmember', rates.rates.covered.morning.nonMember);
        setVal('rate-covered-afternoon-member', rates.rates.covered.afternoon.member);
        setVal('rate-covered-afternoon-nonmember', rates.rates.covered.afternoon.nonMember);
        setVal('rate-covered-evening-member', rates.rates.covered.evening.member);
        setVal('rate-covered-evening-nonmember', rates.rates.covered.evening.nonMember);

        // Populate Uncovered Rates
        setVal('rate-uncovered-morning-member', rates.rates.uncovered.morning.member);
        setVal('rate-uncovered-morning-nonmember', rates.rates.uncovered.morning.nonMember);
        setVal('rate-uncovered-afternoon-member', rates.rates.uncovered.afternoon.member);
        setVal('rate-uncovered-afternoon-nonmember', rates.rates.uncovered.afternoon.nonMember);
        setVal('rate-uncovered-evening-member', rates.rates.uncovered.evening.member);
        setVal('rate-uncovered-evening-nonmember', rates.rates.uncovered.evening.nonMember);

        // Populate mobile summary table
        this.renderMobileRatesSummary();
    },

    saveCourtRates() {
        const getVal = (id, def) => parseFloat(document.getElementById(id)?.value) || def;
        const getStr = (id, def) => document.getElementById(id)?.value || def;

        const clubRates = {
            seasonCoveredStart: getStr('season-covered-start', ''),
            seasonUncoveredStart: getStr('season-uncovered-start', ''),
            timeSlots: {
                morningStart: getStr('slot-morning-start', '08:00'),
                afternoonStart: getStr('slot-afternoon-start', '13:00'),
                eveningStart: getStr('slot-evening-start', '19:00')
            },
            rates: {
                covered: {
                    morning: {
                        member: getVal('rate-covered-morning-member', 5),
                        nonMember: getVal('rate-covered-morning-nonmember', 8)
                    },
                    afternoon: {
                        member: getVal('rate-covered-afternoon-member', 7),
                        nonMember: getVal('rate-covered-afternoon-nonmember', 10)
                    },
                    evening: {
                        member: getVal('rate-covered-evening-member', 8),
                        nonMember: getVal('rate-covered-evening-nonmember', 12)
                    }
                },
                uncovered: {
                    morning: {
                        member: getVal('rate-uncovered-morning-member', 3),
                        nonMember: getVal('rate-uncovered-morning-nonmember', 5)
                    },
                    afternoon: {
                        member: getVal('rate-uncovered-afternoon-member', 5),
                        nonMember: getVal('rate-uncovered-afternoon-nonmember', 7)
                    },
                    evening: {
                        member: getVal('rate-uncovered-evening-member', 6),
                        nonMember: getVal('rate-uncovered-evening-nonmember', 8)
                    }
                }
            }
        };

        // Save rates per club (winter = Viserba, summer = Rivabella)
        const allRates = Storage.load(Storage.KEYS.COURT_RATES, {});
        const clubKey = this.currentSeason; // 'winter' or 'summer'
        allRates[clubKey] = clubRates;

        Storage.save(Storage.KEYS.COURT_RATES, allRates);
        const clubName = clubKey === 'winter' ? 'Viserba' : 'Rivabella';
        alert(`✅ Tariffe per ${clubName} salvate!`);
        console.log(`💰 Tariffe ${clubName} salvate:`, clubRates);
        // Update mobile summary
        this.renderMobileRatesSummary();
    },

    // Render read-only rates summary for mobile view
    renderMobileRatesSummary() {
        const container = document.getElementById('mobile-rates-table');
        if (!container) return;

        const defaultRates = {
            seasonCoveredStart: '',
            seasonUncoveredStart: '',
            timeSlots: { morningStart: '08:00', afternoonStart: '13:00', eveningStart: '19:00' },
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
        };

        // Load rates per club (winter = Viserba, summer = Rivabella)
        const allRates = Storage.load(Storage.KEYS.COURT_RATES, {});
        const clubKey = this.currentSeason; // 'winter' or 'summer'
        const storedRates = allRates[clubKey] || defaultRates;
        const rates = { ...defaultRates, ...storedRates };
        const clubName = clubKey === 'winter' ? 'Viserba' : 'Rivabella';

        // Format date for display
        const formatDate = (dateStr) => {
            if (!dateStr) return 'Non impostata';
            const d = new Date(dateStr);
            return d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
        };

        // Build HTML
        let html = `
            <!-- Season Dates -->
            <div class="rates-section-title">📅 Stagioni</div>
            <table class="rates-summary-table">
                <tr>
                    <td class="row-header">❄️ Campi Coperti</td>
                    <td class="season-info">${formatDate(rates.seasonCoveredStart)}</td>
                </tr>
                <tr>
                    <td class="row-header">☀️ Campi Scoperti</td>
                    <td class="season-info">${formatDate(rates.seasonUncoveredStart)}</td>
                </tr>
            </table>

            <!-- Time Slots -->
            <div class="rates-section-title">⏰ Fasce Orarie</div>
            <table class="rates-summary-table">
                <tr>
                    <td class="row-header">🌅 Mattina</td>
                    <td>${rates.timeSlots?.morningStart || '08:00'}</td>
                </tr>
                <tr>
                    <td class="row-header">☀️ Pomeriggio</td>
                    <td>${rates.timeSlots?.afternoonStart || '13:00'}</td>
                </tr>
                <tr>
                    <td class="row-header">🌙 Sera</td>
                    <td>${rates.timeSlots?.eveningStart || '19:00'}</td>
                </tr>
            </table>

            <!-- Covered Rates -->
            <div class="rates-section-title">❄️ Tariffe Campo Coperto (€)</div>
            <table class="rates-summary-table">
                <thead>
                    <tr>
                        <th>Fascia</th>
                        <th>🏅 Socio</th>
                        <th>👤 Non Socio</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td class="row-header">Mattina</td>
                        <td>${rates.rates?.covered?.morning?.member || 0}</td>
                        <td>${rates.rates?.covered?.morning?.nonMember || 0}</td>
                    </tr>
                    <tr>
                        <td class="row-header">Pomeriggio</td>
                        <td>${rates.rates?.covered?.afternoon?.member || 0}</td>
                        <td>${rates.rates?.covered?.afternoon?.nonMember || 0}</td>
                    </tr>
                    <tr>
                        <td class="row-header">Sera</td>
                        <td>${rates.rates?.covered?.evening?.member || 0}</td>
                        <td>${rates.rates?.covered?.evening?.nonMember || 0}</td>
                    </tr>
                </tbody>
            </table>

            <!-- Uncovered Rates -->
            <div class="rates-section-title">☀️ Tariffe Campo Scoperto (€)</div>
            <table class="rates-summary-table">
                <thead>
                    <tr>
                        <th>Fascia</th>
                        <th>🏅 Socio</th>
                        <th>👤 Non Socio</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td class="row-header">Mattina</td>
                        <td>${rates.rates?.uncovered?.morning?.member || 0}</td>
                        <td>${rates.rates?.uncovered?.morning?.nonMember || 0}</td>
                    </tr>
                    <tr>
                        <td class="row-header">Pomeriggio</td>
                        <td>${rates.rates?.uncovered?.afternoon?.member || 0}</td>
                        <td>${rates.rates?.uncovered?.afternoon?.nonMember || 0}</td>
                    </tr>
                    <tr>
                        <td class="row-header">Sera</td>
                        <td>${rates.rates?.uncovered?.evening?.member || 0}</td>
                        <td>${rates.rates?.uncovered?.evening?.nonMember || 0}</td>
                    </tr>
                </tbody>
            </table>
        `;

        container.innerHTML = html;
    },

    getPlayerRate(playerName, bookingDate, bookingTime) {
        // Find player by name
        const players = Players.getAll();
        const player = players.find(p => p.name === playerName);

        const defaultRates = {
            seasonCoveredStart: '',
            seasonUncoveredStart: '',
            timeSlots: { morningStart: '08:00', afternoonStart: '13:00', eveningStart: '19:00' },
            rates: {
                covered: { morning: { member: 5, nonMember: 8 }, afternoon: { member: 5, nonMember: 8 }, evening: { member: 5, nonMember: 8 } },
                uncovered: { morning: { member: 3, nonMember: 5 }, afternoon: { member: 3, nonMember: 5 }, evening: { member: 3, nonMember: 5 } }
            }
        };

        // Load rates per club (winter = Viserba, summer = Rivabella)
        const allRates = Storage.load(Storage.KEYS.COURT_RATES, {});
        const clubKey = this.currentSeason; // 'winter' or 'summer'
        const storedRates = allRates[clubKey] || defaultRates;

        // Ensure structure (simple merge for safety)
        const rates = { ...defaultRates, ...storedRates };
        if (!rates.timeSlots) rates.timeSlots = defaultRates.timeSlots;
        if (!rates.rates) rates.rates = defaultRates.rates;

        if (!player) return 0;
        const isMember = player.isMember === true;

        // 1. Determine Season (Covered vs Uncovered)
        let isCovered = true; // Default
        if (rates.seasonCoveredStart && rates.seasonUncoveredStart) {
            const currentDate = new Date(bookingDate);
            const coveredStart = new Date(rates.seasonCoveredStart);
            const uncoveredStart = new Date(rates.seasonUncoveredStart);

            if (coveredStart < uncoveredStart) {
                isCovered = currentDate >= coveredStart && currentDate < uncoveredStart;
            } else {
                isCovered = currentDate >= coveredStart || currentDate < uncoveredStart;
            }
        }

        // 2. Determine Time Slot
        // bookingTime format is "HH:MM", e.g., "14:30"
        // We compare simple strings since they are fixed length HH:MM (24h)
        const time = bookingTime || '12:00';
        let timeSlot = 'morning'; // Default

        const { morningStart, afternoonStart, eveningStart } = rates.timeSlots;

        if (time >= morningStart && time < afternoonStart) {
            timeSlot = 'morning';
        } else if (time >= afternoonStart && time < eveningStart) {
            timeSlot = 'afternoon';
        } else if (time >= eveningStart) {
            timeSlot = 'evening';
        } else {
            // Handle pre-morning times (e.g. 07:00). 
            // Logic: if it's before morningStart, what is it?
            // Usually clubs are closed, or we can treat as morning/evening default?
            // Let's assume matches 'evening' of previous day or 'morning' depending on club rules.
            // For simplicity, anything before afternoonStart is morning if we follow logic above,
            // BUT if time < morningStart (e.g. 06:00), we probably want morning rate or distinct.
            // Given the requirements, we'll stick to the 3 slots defined.
            // If time < morningStart, default to 'morning' rate as catch-all for early birds.
            timeSlot = 'morning';
        }

        // 3. Get Rate
        const seasonKey = isCovered ? 'covered' : 'uncovered';
        const rateObj = rates.rates?.[seasonKey]?.[timeSlot];

        // Fallback for missing deep objects
        const fallback = isCovered ? 5 : 3;

        if (!rateObj) return fallback;

        return isMember ? rateObj.member : rateObj.nonMember;
    },

    bindEvents() {
        // Navigation
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.addEventListener('click', () => this.showTab(btn.dataset.tab));
        });

        // Season toggle - also reload rates for the new club
        document.getElementById('season-select').addEventListener('change', (e) => {
            this.currentSeason = e.target.value;
            const settings = Storage.load(Storage.KEYS.SETTINGS, {});
            settings.season = this.currentSeason;
            Storage.save(Storage.KEYS.SETTINGS, settings);
            this.loadCourtRates(); // Reload rates for the selected club
            this.refreshCurrentTab();
        });

        // Players
        document.getElementById('add-player-btn')?.addEventListener('click', () => this.showPlayerModal());
        document.getElementById('player-search')?.addEventListener('input', () => this.filterPlayers());
        document.getElementById('level-filter')?.addEventListener('change', () => this.filterPlayers());
        document.getElementById('players-tbody')?.addEventListener('click', (e) => this.handlePlayerAction(e));

        // Courts
        document.getElementById('add-court-btn')?.addEventListener('click', () => this.showCourtModal());
        document.getElementById('courts-grid')?.addEventListener('click', (e) => this.handleCourtAction(e));

        // Matching
        document.getElementById('generate-matches-btn')?.addEventListener('click', () => this.generateMatches());
        document.getElementById('generate-weekly-btn')?.addEventListener('click', () => this.generateWeeklyMatches());
        document.getElementById('confirm-matches-btn')?.addEventListener('click', () => this.confirmMatches());
        document.getElementById('clear-matches-btn')?.addEventListener('click', () => this.clearMatches());
        document.getElementById('match-date')?.addEventListener('change', () => { });
        document.getElementById('matches-list')?.addEventListener('click', (e) => this.handleMatchAction(e));

        // History
        document.getElementById('history-tbody')?.addEventListener('click', (e) => this.handleHistoryAction(e));
        document.getElementById('history-from')?.addEventListener('change', () => this.filterHistory());
        document.getElementById('history-to')?.addEventListener('change', () => this.filterHistory());
        document.getElementById('history-type-filter')?.addEventListener('change', () => this.filterHistory());

        // Modal
        document.getElementById('modal-close')?.addEventListener('click', () => this.closeModal());
        document.getElementById('modal-overlay')?.addEventListener('click', (e) => {
            if (e.target.id === 'modal-overlay') this.closeModal();
        });

        // Planning Navigation
        document.getElementById('planning-prev-day')?.addEventListener('click', () => this.changePlanningDay(-1));
        document.getElementById('planning-next-day')?.addEventListener('click', () => this.changePlanningDay(1));
        document.getElementById('planning-date')?.addEventListener('change', (e) => {
            this.currentPlanningDate = new Date(e.target.value);
            this.renderPlanning();
        });
        document.getElementById('planning-start-hour')?.addEventListener('change', () => this.renderPlanning());
        document.getElementById('planning-end-hour')?.addEventListener('change', () => this.renderPlanning());
        document.getElementById('planning-body')?.addEventListener('click', (e) => this.handlePlanningAction(e));

        // Set default date
        const today = new Date().toISOString().split('T')[0];
        if (document.getElementById('match-date')) {
            document.getElementById('match-date').value = today;
        }
    },

    showTab(tabId) {
        document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));

        document.getElementById(tabId)?.classList.add('active');
        document.querySelector(`[data-tab="${tabId}"]`)?.classList.add('active');

        this.currentTab = tabId;
        this.refreshCurrentTab();
    },

    refreshCurrentTab() {
        switch (this.currentTab) {
            case 'dashboard': this.updateDashboard(); break;
            case 'players': Players.renderTable(); break;
            case 'courts': Courts.renderGrid(this.currentSeason); break;
            case 'matching': this.updateMatchingView(); break;
            case 'history': History.renderTable(); break;
            case 'planning': this.renderPlanning(); break;
            case 'recurring': this.renderRecurringPlanning(); break;
        }
    },

    updateDashboard() {
        const players = Players.getAll() || [];
        const courts = Courts.getAvailable(this.currentSeason) || [];
        const stats = History.getStats() || { total: 0 };
        const scheduled = Matching.getScheduled() || [];

        const totalPlayersEl = document.getElementById('total-players');
        const totalCourtsEl = document.getElementById('total-courts');
        const totalMatchesEl = document.getElementById('total-matches');
        const scheduledMatchesEl = document.getElementById('scheduled-matches');
        const waImporterEl = document.getElementById('whatsapp-importer');

        if (totalPlayersEl) totalPlayersEl.textContent = players.length;
        if (totalCourtsEl) totalCourtsEl.textContent = courts.length;
        if (totalMatchesEl) totalMatchesEl.textContent = stats.total || 0;
        if (scheduledMatchesEl) scheduledMatchesEl.textContent = scheduled.length;
        if (waImporterEl) waImporterEl.style.display = 'block';
    },

    parseWhatsApp() {
        const text = document.getElementById('wa-import-text').value;
        if (!text) return;

        // Esempio semplice di parsing: cerca nomi di giorni e ore
        const days = ['lunedi', 'martedi', 'mercoledi', 'giovedi', 'venerdi', 'sabato', 'domenica'];
        const foundDay = days.find(d => text.toLowerCase().includes(d));

        // Cerca orari (es. 18:00, 18.00, 18)
        const timeMatch = text.match(/(\d{1,2})[:.]?(\d{2})?/);

        if (foundDay && timeMatch) {
            const hour = timeMatch[1].padStart(2, '0');
            const mins = timeMatch[2] || '00';
            const time = `${hour}:${mins}`;

            alert(`Trovata disponibilità: ${foundDay} alle ${time}. (Logica di aggiornamento automatico in sviluppo)`);
            // Qui andrebbe la logica per trovare il giocatore e aggiornare availability.extra
        } else {
            alert('Non ho riconosciuto giorno o ora nel messaggio.');
        }
        document.getElementById('wa-import-text').value = '';
    },

    changePlanningDay(days) {
        this.currentPlanningDate.setDate(this.currentPlanningDate.getDate() + days);
        this.renderPlanning();
    },

    // Alias for HTML onclick compatibility
    changeDay(days) {
        this.changePlanningDay(days);
    },

    // Direct date selection from date picker
    goToDate(dateStr) {
        if (!dateStr) return;
        this.currentPlanningDate = new Date(dateStr);
        this.renderPlanning();
        // Update the date picker to reflect the selected date
        const picker = document.getElementById('planning-date-picker');
        if (picker) picker.value = dateStr;
    },

    renderPlanning() {
        const container = document.getElementById('planning-flex-container');
        const dateInput = document.getElementById('planning-date');
        const dayLabel = document.getElementById('planning-day-name');
        const dateDisplay = document.getElementById('planning-date-display');
        if (!container || !dateInput) return;

        const dateStr = this.currentPlanningDate.toISOString().split('T')[0];
        dateInput.value = dateStr;
        const dayName = Matching.getDayNameFromDate(dateStr);
        if (dayLabel) dayLabel.textContent = dayName.charAt(0).toUpperCase() + dayName.slice(1);

        // Format date as DD/MM
        const dateObj = new Date(dateStr);
        const day = String(dateObj.getDate()).padStart(2, '0');
        const month = String(dateObj.getMonth() + 1).padStart(2, '0');
        if (dateDisplay) dateDisplay.textContent = `${day}/${month}`;

        // Update header navigation display (new elements)
        const headerDateEl = document.getElementById('current-date-display');
        if (headerDateEl) {
            headerDateEl.textContent = `${day}/${month}/${dateObj.getFullYear()}`;
        }
        const headerDayEl = document.getElementById('current-day-name');
        if (headerDayEl) {
            const days = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'];
            headerDayEl.textContent = days[dateObj.getDay()];
        }

        // Safety check: ensure view mode matches
        if (this.planningViewMode === 'horizontal') {
            const verticalContainer = document.getElementById('planning-vertical-container');
            if (verticalContainer) verticalContainer.style.setProperty('display', 'none', 'important');
        }

        // Sync date picker input
        const datePicker = document.getElementById('planning-date-picker');
        if (datePicker) datePicker.value = dateStr;

        const courts = Courts.getAvailable(this.currentSeason);
        const scheduled = Storage.load(Storage.KEYS.SCHEDULED, []) || [];

        // Load custom planning times per court/day
        const planningTemplates = Storage.load('planning_templates', {});
        const dayTemplate = planningTemplates[dateStr] || {};

        // Generate standard time slots
        const defaultTimes = ['08.30', '09.30', '10.30', '11.30', '12.30', '13.30', '14.30', '15.30', '16.30', '17.30', '18.30', '19.30', '20.30', '21.30', '22.30'];

        // Build horizontal table: courts as rows, each with its own time headers
        let tableHtml = `
            <table class="planning-horizontal-table">
                <tbody>
        `;

        courts.forEach(court => {
            const times = dayTemplate[court.id] || [...defaultTimes];

            // Riga orari editabili per questo campo
            tableHtml += `
                <tr class="court-time-row">
                    <td class="court-name-cell" style="font-size:0.6rem; background:#d0d0d0;">⏰ Orari</td>
                    ${times.map((time, index) => `
                        <td class="time-edit-cell" style="padding:0;">
                            <input type="text" 
                                   class="time-input" 
                                   value="${time}" 
                                   data-court="${court.id}" 
                                   data-index="${index}"
                                   style="width:100%; border:none; text-align:center; font-size:0.6rem; padding:2px; background:transparent;"
                                   onchange="App.handleTimeChange(event)"
                                   onclick="this.select()">
                        </td>
                    `).join('')}
                </tr>
            `;

            // Riga attività
            tableHtml += `<tr><td class="court-name-cell">${court.name}</td>`;

            times.forEach((time, index) => {
                const standardizedTime = time.replace('.', ':');
                const nextTime = times[index + 1] || Matching.addTime(standardizedTime, 60);
                const standardizedNextTime = nextTime.replace('.', ':');

                const isReserved = !Courts.isFree(court.id, dayName, standardizedTime, standardizedNextTime, dateStr);
                const reservations = court.reservations || [];
                const match = (scheduled || []).find(m => {
                    if (m.date !== dateStr || m.court !== court.id) return false;
                    const mEnd = Matching.addTime(m.time, 90);
                    return (standardizedTime < mEnd && standardizedNextTime > m.time);
                });

                let statusClass = 'activity-free';
                let playersHtml = '';
                let res = null;  // Initialize res here so it's accessible for tooltip

                if (match) {
                    statusClass = 'activity-confirmed';
                    const p1 = Players.getById(match.players[0])?.name || '?';
                    const p2 = Players.getById(match.players[1])?.name || '?';
                    playersHtml = `<span class="cell-label">${p1} e ${p2}</span>`;
                } else if (isReserved) {
                    // Find reservation - prioritize date-specific over recurring (no date)
                    res = reservations.find(r => {
                        return r.date === dateStr && (standardizedTime < r.to && standardizedNextTime > r.from);
                    });
                    if (!res) {
                        res = reservations.find(r => {
                            return !r.date && r.day === dayName && (standardizedTime < r.to && standardizedNextTime > r.from);
                        });
                    }

                    const activityLabels = ['match', 'scuola', 'ago', 'promo', 'torneo', 'manutenzione'];

                    if (res?.players && res.players.some(p => p)) {
                        const hasOnlyFirst = res.players[0] && !res.players[1] && !res.players[2] && !res.players[3];
                        const firstPlayerLower = res.players[0]?.toLowerCase() || '';
                        const isActivity = activityLabels.includes(firstPlayerLower);

                        if (hasOnlyFirst && isActivity) {
                            statusClass = `activity-${firstPlayerLower}`;
                            playersHtml = `<span class="cell-label">${res.players[0]}</span>`;
                        } else if (hasOnlyFirst) {
                            statusClass = 'activity-single-player';
                            playersHtml = `<span class="cell-label">${res.players[0]}</span>`;
                        } else {
                            statusClass = 'activity-players';
                            const filledPlayers = res.players.filter(p => p && p.trim());

                            if (filledPlayers.length === 2) {
                                playersHtml = `
                                    <div class="cell-players-vertical">
                                        <span class="cell-player-single">${filledPlayers[0]}</span>
                                        <span class="cell-player-single">${filledPlayers[1]}</span>
                                    </div>`;
                            } else {
                                playersHtml = `
                                    <div class="cell-players-grid">
                                        <span class="cell-player">${res.players[0] || ''}</span>
                                        <span class="cell-player">${res.players[1] || ''}</span>
                                        <span class="cell-player">${res.players[2] || ''}</span>
                                        <span class="cell-player">${res.players[3] || ''}</span>
                                    </div>`;
                            }
                            // Add payment method badge
                            const pmIcon = { contanti: '💵', carta: '💳', paypal: '🅿️' }[res.paymentMethod] || '';
                            if (pmIcon) {
                                playersHtml += `<span class="payment-badge" style="position:absolute;top:2px;right:2px;font-size:10px;">${pmIcon}</span>`;
                            }
                        }
                    } else {
                        statusClass = `activity-${res?.type || 'reserved'}`;
                        const label = res?.label && res.label !== 'Prenotato' ? res.label : (res?.type ? res.type.toUpperCase() : 'Prenotato');
                        playersHtml = `<span class="cell-label">${label}</span>`;
                    }
                }

                // Build data-players attribute for tooltip
                let dataPlayersAttr = '';
                if (res?.players && res.players.some(p => p && p.trim())) {
                    const names = res.players.filter(p => p && p.trim()).join(' | ');
                    dataPlayersAttr = `data-players="${names.replace(/"/g, '&quot;')}"`;
                }

                tableHtml += `
                    <td class="planning-cell">
                        <div class="planning-activity-cell ${statusClass}" 
                             data-court="${court.id}" data-time="${standardizedTime}" data-index="${index}"
                             ${dataPlayersAttr}>
                            ${playersHtml}
                        </div>
                    </td>
                `;
            });

            tableHtml += `</tr>`;
        });

        tableHtml += `</tbody></table>`;
        container.innerHTML = tableHtml;

        // Bind events
        container.querySelectorAll('.planning-activity-cell').forEach(cell => {
            cell.addEventListener('click', (e) => this.handlePlanningAction(e));

            // Magnifying glass popup on hover
            cell.addEventListener('mouseenter', (e) => {
                const content = cell.innerHTML.trim();
                if (!content || content === '') return;

                // Remove existing popup
                const existing = document.getElementById('magnify-popup');
                if (existing) existing.remove();

                // Build popup content with payment info if available
                let popupContent = content;

                // Check data attributes for payment info
                const courtId = cell.dataset.court;
                const time = cell.dataset.time;
                const dateStr = App.currentPlanningDate.toISOString().split('T')[0];
                const court = Courts.getById(courtId);

                if (court?.reservations) {
                    const dayName = Matching.getDayNameFromDate(dateStr);
                    const res = court.reservations.find(r => {
                        if (r.date === dateStr) {
                            return time >= r.from && time < r.to;
                        }
                        return !r.date && r.day === dayName && time >= r.from && time < r.to;
                    });

                    if (res?.players && res.players.some(p => p && p.trim())) {
                        const lines = res.players.map((player, i) => {
                            if (!player || !player.trim()) return '';
                            const quota = res.payments?.[i] || 0;
                            const paid = res.paid?.[i] || 0;
                            return `${player} (Quota: ${quota}€ / Pagato: ${paid}€)`;
                        }).filter(l => l);

                        // Add payment method indicator
                        const paymentMethodIcons = { contanti: '💵', carta: '💳', paypal: '🅿️' };
                        const paymentMethodLabels = { contanti: 'Contanti', carta: 'Carta di Credito', paypal: 'PayPal' };
                        const methodIcon = paymentMethodIcons[res.paymentMethod] || '💵';
                        const methodLabel = paymentMethodLabels[res.paymentMethod] || 'Contanti';

                        popupContent = lines.join('<br>') + `<br><span style="color:#22c55e;margin-top:5px;display:inline-block;">${methodIcon} ${methodLabel}</span>`;
                    }
                }

                // Create popup
                const popup = document.createElement('div');
                popup.id = 'magnify-popup';
                popup.innerHTML = popupContent;
                popup.style.cssText = `
                    position: fixed;
                    background: #1a1a2e;
                    color: #fff;
                    padding: 12px 15px;
                    border-radius: 8px;
                    font-size: 0.9rem;
                    font-weight: 500;
                    text-align: left;
                    z-index: 99999;
                    box-shadow: 0 8px 30px rgba(0,0,0,0.5);
                    border: 2px solid #2d8a4e;
                    min-width: 180px;
                    max-width: 350px;
                    pointer-events: none;
                `;
                document.body.appendChild(popup);

                // Position near mouse
                const rect = cell.getBoundingClientRect();
                popup.style.left = Math.min(rect.left, window.innerWidth - popup.offsetWidth - 20) + 'px';
                popup.style.top = (rect.bottom + 10) + 'px';
            });

            cell.addEventListener('mouseleave', () => {
                const popup = document.getElementById('magnify-popup');
                if (popup) popup.remove();
            });
        });

        // Sync top scrollbar with main container
        const topScroll = document.getElementById('planning-top-scroll');
        const topScrollSpacer = document.getElementById('planning-top-scroll-spacer');
        if (topScroll && topScrollSpacer) {
            topScrollSpacer.style.width = container.scrollWidth + 'px';
            topScroll.onscroll = () => {
                container.scrollLeft = topScroll.scrollLeft;
            };
            container.onscroll = () => {
                topScroll.scrollLeft = container.scrollLeft;
            };
        }

        // Also render mobile view
        this.populateMobileCourtSelector();
        this.renderMobilePlanning();

        // Also render vertical view with quotes if in that mode
        if (this.planningViewMode === 'vertical') {
            this.renderVerticalPlanning();
        }
    },

    planningViewMode: 'horizontal', // 'horizontal' or 'vertical'

    togglePlanningView(mode) {
        this.planningViewMode = mode;
        console.log(`[VIEW] Switching to ${mode} mode`);

        const updateView = () => {
            const horizontalContainer = document.getElementById('planning-flex-container');
            const verticalContainer = document.getElementById('planning-vertical-container');
            const topScroll = document.getElementById('planning-top-scroll');

            // Force hide/show with explicit priority
            if (mode === 'horizontal') {
                if (horizontalContainer) horizontalContainer.style.setProperty('display', 'block', 'important');
                if (verticalContainer) verticalContainer.style.setProperty('display', 'none', 'important');
                if (topScroll) topScroll.style.setProperty('display', 'block', 'important');
            } else {
                if (horizontalContainer) horizontalContainer.style.setProperty('display', 'none', 'important');
                if (verticalContainer) verticalContainer.style.setProperty('display', 'flex', 'important');
                if (topScroll) topScroll.style.setProperty('display', 'none', 'important');
                this.renderVerticalPlanning();
            }
        };

        updateView();
        // Fallback in case DOM is sluggish or overwritten
        setTimeout(updateView, 50);

        // Save preference
        localStorage.setItem('planningViewMode', mode);
    },

    renderVerticalPlanning() {
        const container = document.getElementById('planning-vertical-container');
        if (!container) return;

        const dateStr = this.currentPlanningDate.toISOString().split('T')[0];
        const dayName = Matching.getDayNameFromDate(dateStr);
        const courts = Courts.getAvailable(this.currentSeason);
        const planningTemplates = Storage.load('planning_templates', {});
        const defaultTimes = ['08.30', '09.30', '10.30', '11.30', '12.30', '13.30', '14.30', '15.30', '16.30', '17.30', '18.30', '19.30', '20.30', '21.30', '22.30'];

        // Activity colors mapping (same as print) - with text colors for readability
        const activityColors = {
            'ago': { bg: '#f97316', text: '#fff' },
            'scuola': { bg: '#f97316', text: '#fff' },
            'promo': { bg: '#22c55e', text: '#fff' },
            'torneo': { bg: '#3b82f6', text: '#fff' },
            'manutenzione': { bg: '#6b7280', text: '#fff' },
            'match': { bg: '#ffffff', text: '#000' },
            'players': { bg: '#ffffff', text: '#000' },
            'nasty': { bg: '#22c55e', text: '#fff' }
        };

        let html = '<div class="vertical-planning-wrapper" style="display: flex; gap: 8px; flex-wrap: nowrap; width: 100%;">';

        courts.forEach(court => {
            const dayTemplate = planningTemplates[dateStr] || {};
            const times = dayTemplate[court.id] || [...defaultTimes];
            const reservations = court.reservations || [];

            let rowsHtml = '';
            times.forEach((time, index) => {
                const standardizedTime = time.replace('.', ':');
                const nextTime = times[index + 1] || Matching.addTime(standardizedTime, 60);
                const standardizedNextTime = nextTime.replace('.', ':');

                // Find reservation for this slot
                let res = reservations.find(r => {
                    return r.date === dateStr && (standardizedTime < r.to && standardizedNextTime > r.from);
                });
                if (!res) {
                    res = reservations.find(r => {
                        return !r.date && r.day === dayName && (standardizedTime < r.to && standardizedNextTime > r.from);
                    });
                }

                let cellContent = '';
                let cellStyle = 'background: #fff; color: #000;';
                let quotaCol = '';
                let paidCol = '';

                if (res?.players && res.players.some(p => p && p.trim())) {
                    const filledPlayers = res.players.filter(p => p && p.trim());
                    const activityLabels = ['match', 'scuola', 'ago', 'promo', 'torneo', 'manutenzione', 'nasty'];
                    const firstPlayerLower = (res.players[0] || '').toLowerCase();
                    const isActivity = activityLabels.includes(firstPlayerLower);

                    if (isActivity) {
                        const colors = activityColors[firstPlayerLower] || { bg: '#f97316', text: '#fff' };
                        cellStyle = `background: ${colors.bg}; color: ${colors.text};`;
                        cellContent = res.players[0].toUpperCase();
                    } else {
                        // Players - white background, black text
                        cellStyle = 'background: #fff; color: #000;';

                        // Build quota and paid values
                        const quotaVals = filledPlayers.map((playerName) => {
                            const originalIdx = res.players.indexOf(playerName);
                            return res.payments?.[originalIdx] || 0;
                        });
                        const paidVals = filledPlayers.map((playerName) => {
                            const originalIdx = res.players.indexOf(playerName);
                            return res.paid?.[originalIdx] || 0;
                        });

                        // Build content based on player count - all same fixed height
                        if (filledPlayers.length <= 2) {
                            // 1-2 players: stack vertically
                            cellContent = filledPlayers.map(p => `<div style="line-height: 1.1;">${p}</div>`).join('');
                            quotaCol = quotaVals.map(q => `<div style="line-height: 1.1;">${q}</div>`).join('');
                            paidCol = paidVals.map(p => `<div style="line-height: 1.1;">${p}</div>`).join('');
                        } else {
                            // 3-4 players: 2x2 grid - fixed height
                            cellContent = `<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0; line-height: 1.1;">
                                <span>${filledPlayers[0] || ''}</span>
                                <span>${filledPlayers[1] || ''}</span>
                                <span>${filledPlayers[2] || ''}</span>
                                <span>${filledPlayers[3] || ''}</span>
                            </div>`;
                            quotaCol = `<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0; line-height: 1.1;">
                                <span>${quotaVals[0] || ''}</span>
                                <span>${quotaVals[1] || ''}</span>
                                <span>${quotaVals[2] || ''}</span>
                                <span>${quotaVals[3] || ''}</span>
                            </div>`;
                            paidCol = `<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0; line-height: 1.1;">
                                <span>${paidVals[0] || ''}</span>
                                <span>${paidVals[1] || ''}</span>
                                <span>${paidVals[2] || ''}</span>
                                <span>${paidVals[3] || ''}</span>
                            </div>`;
                        }
                    }
                } else if (res) {
                    const colors = activityColors[res.type] || { bg: '#f97316', text: '#fff' };
                    cellStyle = `background: ${colors.bg}; color: ${colors.text};`;
                    cellContent = res.label || res.type?.toUpperCase() || 'Prenotato';
                }

                rowsHtml += `
                    <tr style="height: 32px; font-family: 'Roboto Condensed', Arial Narrow, sans-serif;">
                        <td style="border: 1px solid #000; padding: 2px 4px; text-align: center; font-weight: bold; vertical-align: middle; background: #374151; color: #fff; width: 45px;">${time}</td>
                        <td class="vertical-activity-cell" style="border: 1px solid #000; padding: 2px 6px; ${cellStyle} text-align: left; vertical-align: middle; cursor: pointer;"
                            data-court="${court.id}" data-time="${standardizedTime}" data-index="${index}"
                            onclick="App.handlePlanningAction(event)">${cellContent}</td>
                        <td style="border: 1px solid #000; padding: 2px 4px; text-align: center; vertical-align: middle; background: #374151; color: #fff; width: 40px;">${quotaCol}</td>
                        <td style="border: 1px solid #000; padding: 2px 4px; text-align: center; vertical-align: middle; background: #374151; color: #fff; width: 40px;">${paidCol}</td>
                    </tr>
                `;
            });

            html += `
                <div style="flex: 1;">
                    <table style="border-collapse: collapse; width: 100%; font-size: 11px; font-family: 'Roboto Condensed', Arial Narrow, sans-serif; table-layout: fixed;">
                        <thead>
                            <tr style="height: 28px;">
                                <th style="border: 1px solid #000; padding: 4px; background: #166534; color: #fff; width: 45px;">Ora</th>
                                <th style="border: 1px solid #000; padding: 4px; background: #166534; color: #fff;">${court.name}</th>
                                <th style="border: 1px solid #000; padding: 4px; background: #166534; color: #fff; width: 40px;">Q</th>
                                <th style="border: 1px solid #000; padding: 4px; background: #166534; color: #fff; width: 40px;">P</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rowsHtml}
                        </tbody>
                    </table>
                </div>
            `;
        });

        html += '</div>';
        container.innerHTML = html;
    },

    // Populate the mobile court selector dropdown
    populateMobileCourtSelector() {
        try {
            const select = document.getElementById('admin-mobile-court-select');
            if (!select) {
                console.log('[MOBILE] Court selector not found');
                return;
            }

            const courts = Courts.getAvailable(this.currentSeason) || [];
            console.log('[MOBILE] Courts available:', courts.length, 'Season:', this.currentSeason);

            if (courts.length === 0) {
                select.innerHTML = '<option value="">Nessun campo</option>';
                return;
            }

            const currentValue = select.value;

            select.innerHTML = '';
            courts.forEach((court, index) => {
                const option = document.createElement('option');
                option.value = court.id;
                option.textContent = court.name;
                if (court.id === currentValue || (index === 0 && !currentValue)) {
                    option.selected = true;
                }
                select.appendChild(option);
            });
            console.log('[MOBILE] Court selector populated with', courts.length, 'courts');
        } catch (e) {
            console.error('[MOBILE] Error in populateMobileCourtSelector:', e);
        }
    },

    // Render mobile vertical table for selected court
    renderMobilePlanning() {
        try {
            const mobileTable = document.getElementById('admin-mobile-planning-table');
            const select = document.getElementById('admin-mobile-court-select');
            console.log('[MOBILE] renderMobilePlanning called, table:', !!mobileTable, 'select:', !!select);
            if (!mobileTable || !select) return;

            const dateStr = this.currentPlanningDate.toISOString().split('T')[0];
            const dayName = Matching.getDayNameFromDate(dateStr);
            const courts = Courts.getAvailable(this.currentSeason) || [];
            const scheduled = Storage.load(Storage.KEYS.SCHEDULED, []) || [];

            const selectedCourtId = select.value;
            console.log('[MOBILE] Selected court ID:', selectedCourtId, 'Total courts:', courts.length);
            const court = courts.find(c => c.id === selectedCourtId) || courts[0];
            if (!court) {
                mobileTable.innerHTML = '<tbody><tr><td colspan="2" style="padding:20px;text-align:center;">Nessun campo disponibile. Vai alla sezione Campi per aggiungerne.</td></tr></tbody>';
                return;
            }

            const planningTemplates = Storage.load('planning_templates', {}) || {};
            const dayTemplate = (planningTemplates && planningTemplates[dateStr]) ? planningTemplates[dateStr] : {};
            const defaultTimes = ['08.30', '09.30', '10.30', '11.30', '12.30', '13.30', '14.30', '15.30', '16.30', '17.30', '18.30', '19.30', '20.30', '21.30', '22.30'];
            const times = dayTemplate[court.id] || defaultTimes;

            const activityLabels = ['match', 'scuola', 'ago', 'promo', 'torneo', 'manutenzione'];

            let tableHtml = '<colgroup><col style="width:75px"><col style="width:auto"></colgroup>';
            tableHtml += '<tbody>';
            tableHtml += '<tr><th colspan="2" style="background:#2d8a4e;color:#fff;font-size:1.1rem;padding:12px;">' + court.name + '</th></tr>';

            for (let t = 0; t < times.length; t++) {
                const time = times[t];
                const standardizedTime = time.replace('.', ':');
                const nextTime = times[t + 1] || Matching.addTime(standardizedTime, 60);
                const standardizedNextTime = nextTime.replace('.', ':');

                const isReserved = !Courts.isFree(court.id, dayName, standardizedTime, standardizedNextTime, dateStr);
                const reservations = court.reservations || [];

                let cellClass = 'activity-free';
                let cellContent = '-';

                if (isReserved) {
                    let res = reservations.find(function (r) {
                        return r.date === dateStr && (standardizedTime < r.to && standardizedNextTime > r.from);
                    });
                    if (!res) {
                        res = reservations.find(function (r) {
                            return !r.date && r.day === dayName && (standardizedTime < r.to && standardizedNextTime > r.from);
                        });
                    }

                    if (res) {
                        if (res.players && res.players.some(function (p) { return p; })) {
                            const filledPlayers = res.players.filter(function (p) { return p && p.trim(); });
                            const hasOnlyFirst = res.players[0] && !res.players[1] && !res.players[2] && !res.players[3];
                            const firstPlayerLower = (res.players[0] || '').toLowerCase();
                            const isActivity = activityLabels.indexOf(firstPlayerLower) !== -1;

                            if (hasOnlyFirst && isActivity) {
                                cellClass = 'activity-' + firstPlayerLower;
                                cellContent = res.players[0];
                            } else if (hasOnlyFirst) {
                                cellClass = 'activity-single-player';
                                // Show quote and paid amount for single player if available
                                let quote = '';
                                let paidInfo = '';
                                if (res.payments && res.payments[0]) {
                                    quote = ' (' + res.payments[0] + '€)';
                                } else {
                                    // Try to calculate rate
                                    const rate = this.getPlayerRate(res.players[0], dateStr, standardizedTime);
                                    if (rate > 0) quote = ' (' + rate + '€)';
                                }
                                // Always show paid amount (even if 0)
                                const paidAmount = (res.paid && res.paid[0] !== undefined) ? res.paid[0] : 0;
                                paidInfo = ' [' + paidAmount + '€]';
                                // Payment method indicator
                                const pmIcon = { contanti: '💵', carta: '💳', paypal: '🅿️' }[res.paymentMethod] || '';
                                cellContent = res.players[0] + quote + paidInfo + (pmIcon ? ' ' + pmIcon : '');
                            } else {
                                cellClass = 'activity-players';
                                // Show each player with their quote and paid amount
                                const playersWithQuotes = filledPlayers.map((playerName, idx) => {
                                    const originalIdx = res.players.indexOf(playerName);
                                    let quote = '';
                                    let paidInfo = '';
                                    if (res.payments && res.payments[originalIdx]) {
                                        quote = ' (' + res.payments[originalIdx] + '€)';
                                    } else {
                                        // Try to calculate rate
                                        const rate = this.getPlayerRate(playerName, dateStr, standardizedTime);
                                        if (rate > 0) quote = ' (' + rate + '€)';
                                    }
                                    // Always show paid amount (even if 0)
                                    const paidAmount = (res.paid && res.paid[originalIdx] !== undefined) ? res.paid[originalIdx] : 0;
                                    paidInfo = ' [' + paidAmount + '€]';
                                    return playerName + quote + paidInfo;
                                });
                                // Payment method indicator for mobile view
                                const pmIconMobile = { contanti: '💵', carta: '💳', paypal: '🅿️' }[res.paymentMethod] || '';
                                cellContent = playersWithQuotes.join('<br>') + (pmIconMobile ? '<br><span style="font-size:12px;">' + pmIconMobile + '</span>' : '');
                            }
                        } else {
                            cellClass = 'activity-' + (res.type || 'reserved');
                            cellContent = res.label || (res.type ? res.type.toUpperCase() : 'Prenotato');
                        }
                    }
                }

                // Check for scheduled matches
                const match = (scheduled || []).find(m => {
                    if (m.date !== dateStr || m.court !== court.id) return false;
                    const mEnd = Matching.addTime(m.time, 90);
                    return (standardizedTime < mEnd && standardizedNextTime > m.time);
                });

                if (match) {
                    cellClass = 'activity-confirmed';
                    const p1 = Players.getById(match.players[0])?.name || '?';
                    const p2 = Players.getById(match.players[1])?.name || '?';
                    cellContent = p1 + ' vs ' + p2;
                }

                tableHtml += '<tr>';
                tableHtml += '<td class="time-column mobile-time-editable" data-court="' + court.id + '" data-index="' + t + '">' + time + '</td>';
                tableHtml += '<td class="activity-cell ' + cellClass + '" data-court="' + court.id + '" data-time="' + standardizedTime + '" data-index="' + t + '">' + cellContent + '</td>';
                tableHtml += '</tr>';
            }

            tableHtml += '</tbody>';
            mobileTable.innerHTML = tableHtml;

            // Bind click events for mobile cells
            mobileTable.querySelectorAll('.activity-cell').forEach(cell => {
                cell.addEventListener('click', (e) => this.handlePlanningAction(e));
            });

            // Bind click events for mobile time cells (edit time on tap)
            mobileTable.querySelectorAll('.mobile-time-editable').forEach(cell => {
                cell.addEventListener('click', (e) => this.showMobileTimeEditModal(e));
            });
        } catch (e) {
            console.error('[MOBILE] Error in renderMobilePlanning:', e);
        }
    },

    handleTimeChange(e) {
        const courtId = e.target.dataset.court;
        const index = parseInt(e.target.dataset.index);
        const newTime = e.target.value;
        const dateStr = this.currentPlanningDate.toISOString().split('T')[0];

        const planningTemplates = Storage.load('planning_templates', {});
        if (!planningTemplates[dateStr]) planningTemplates[dateStr] = {};
        if (!planningTemplates[dateStr][courtId]) {
            // Initial default if not exists
            planningTemplates[dateStr][courtId] = ['08.30', '09.30', '10.30', '11.30', '12.30', '13.30', '14.30', '15.30', '16.30', '17.30', '18.30', '19.30', '20.30', '21.30', '22.30'];
        }

        planningTemplates[dateStr][courtId][index] = newTime;
        Storage.save('planning_templates', planningTemplates);
        this.renderPlanning();
    },

    // Modal semplificato per modificare l'orario di una cella da mobile
    showMobileTimeEditModal(e) {
        const cell = e.target.closest('.mobile-time-editable');
        if (!cell) return;

        const courtId = cell.dataset.court;
        const index = parseInt(cell.dataset.index);
        const currentTime = cell.textContent.trim();
        const dateStr = this.currentPlanningDate.toISOString().split('T')[0];

        // Parse current time
        const timeParts = currentTime.replace('.', ':').split(':');
        const currentHour = timeParts[0] || '08';
        const currentMin = timeParts[1] || '00';

        const court = Courts.getById(courtId);
        const courtName = court?.name || 'Campo';

        const title = `✏️ Modifica Orario - ${courtName}`;

        const body = `
            <div style="text-align: center; padding: 10px 0;">
                <p style="color: #a0aec0; margin-bottom: 20px;">Orario attuale: <strong style="color: #2d8a4e;">${currentTime}</strong></p>
                <div style="display: flex; justify-content: center; align-items: center; gap: 10px;">
                    <select id="mobile-time-hour" class="filter-select" style="padding: 12px 20px; font-size: 1.2rem; min-width: 80px;">
                        ${Array.from({ length: 16 }, (_, i) => i + 8)
                .map(h => `<option value="${String(h).padStart(2, '0')}" ${String(h).padStart(2, '0') === currentHour ? 'selected' : ''}>${String(h).padStart(2, '0')}</option>`)
                .join('')}
                    </select>
                    <span style="font-size: 1.5rem; font-weight: bold;">:</span>
                    <select id="mobile-time-min" class="filter-select" style="padding: 12px 20px; font-size: 1.2rem; min-width: 80px;">
                        ${Array.from({ length: 60 }, (_, i) => i)
                .map(m => `<option value="${String(m).padStart(2, '0')}" ${String(m).padStart(2, '0') === currentMin ? 'selected' : ''}>${String(m).padStart(2, '0')}</option>`)
                .join('')}
                    </select>
                </div>
            </div>
        `;

        const footer = `
            <div style="display: flex; justify-content: center; gap: 15px;">
                <button class="btn btn-secondary" onclick="App.closeModal()">Annulla</button>
                <button class="btn btn-primary" onclick="App.confirmMobileTimeEdit('${courtId}', ${index})">✓ Salva</button>
            </div>
        `;

        this.showModal(title, body, footer);
    },

    // Conferma modifica orario da mobile
    confirmMobileTimeEdit(courtId, index) {
        const hourEl = document.getElementById('mobile-time-hour');
        const minEl = document.getElementById('mobile-time-min');

        if (!hourEl || !minEl) {
            console.error('[MOBILE TIME] Elements not found');
            return;
        }

        const newTime = `${hourEl.value}.${minEl.value}`;
        const dateStr = this.currentPlanningDate.toISOString().split('T')[0];

        const planningTemplates = Storage.load('planning_templates', {});
        if (!planningTemplates[dateStr]) planningTemplates[dateStr] = {};
        if (!planningTemplates[dateStr][courtId]) {
            planningTemplates[dateStr][courtId] = ['08.30', '09.30', '10.30', '11.30', '12.30', '13.30', '14.30', '15.30', '16.30', '17.30', '18.30', '19.30', '20.30', '21.30', '22.30'];
        }

        planningTemplates[dateStr][courtId][index] = newTime;
        Storage.save('planning_templates', planningTemplates);

        this.closeModal();
        this.renderPlanning();
    },

    handlePlanningAction(e) {
        // Support desktop (.planning-activity-cell), vertical desktop (.vertical-activity-cell) and mobile (.activity-cell) clicks
        let cell = e.target.closest('.planning-activity-cell');
        if (!cell) {
            cell = e.target.closest('.vertical-activity-cell');
        }
        if (!cell) {
            cell = e.target.closest('.activity-cell');
        }
        if (!cell) return;

        const courtId = cell.dataset.court;
        const time = cell.dataset.time;
        const index = cell.dataset.index;
        const dateStr = this.currentPlanningDate.toISOString().split('T')[0];

        // Apre il modal per qualsiasi cella (inclusi i match generati automaticamente)
        this.showPlanningSlotModal(courtId, dateStr, time, index);
    },

    showPlanningSlotModal(courtId, dateStr, time, index) {
        // Save context for other functions to use (e.g. rate calculation)
        this.activePlanningSlot = { courtId, dateStr, time, index };

        const allPlayers = Players.getAll() || [];
        console.log(`[MODAL] Apertura. Giocatori presenti in archivio: ${allPlayers.length}`);

        // Get available players to determine who is unavailable
        const availablePlayers = Availability.getAvailablePlayers(dateStr, time, 'singles');
        const availableIds = new Set(availablePlayers.map(p => p.id));

        // Helper function to get player time preferences for the selected day
        const getPlayerTimePrefsForDay = (player, dateStr, dayName) => {
            const av = player?.availability || {};
            const rec = Array.isArray(av.recurring) ? av.recurring : [];
            const ext = Array.isArray(av.extra) ? av.extra : [];

            // First check extra (date-specific) preferences
            const todayExtras = ext.filter(e => e.date === dateStr);
            if (todayExtras.length > 0) {
                return todayExtras.map(e => `${e.from}-${e.to}`).join(', ');
            }

            // Then check recurring (day-based) preferences
            const todayRecs = rec.filter(r => r.day.toLowerCase().trim() === dayName.toLowerCase());
            if (todayRecs.length > 0) {
                return todayRecs.map(r => `${r.from}-${r.to}`).join(', ');
            }

            return ''; // No preferences for this day
        };

        // Get day name BEFORE using it in the player mapping
        const court = Courts.getById(courtId);
        const dayName = Matching.getDayNameFromDate(dateStr);

        // Mark players with availability status and time preferences
        const players = allPlayers.map(p => {
            const timePrefs = getPlayerTimePrefsForDay(p, dateStr, dayName);
            return {
                ...p,
                isAvailable: availableIds.has(p.id),
                timePrefsDisplay: timePrefs ? `🕒 ${timePrefs}` : ''
            };
        });

        console.log(`[MODAL] Giocatori disponibili: ${availablePlayers.length}, totali: ${allPlayers.length}`);

        // Helper function to convert time to minutes for accurate comparison
        const timeToMin = (t) => {
            if (!t) return 0;
            const [h, m] = t.replace('.', ':').split(':').map(Number);
            return (h * 60) + (m || 0);
        };
        const clickedTimeMin = timeToMin(time);

        // Cerca se esiste già una prenotazione manuale in questo slot - priorità a quelle con data
        let existingResIndex = court.reservations?.findIndex(r => {
            const fromMin = timeToMin(r.from);
            const toMin = timeToMin(r.to);
            return r.date === dateStr && (clickedTimeMin >= fromMin && clickedTimeMin < toMin);
        }) ?? -1;
        // Se non trovata con data, cerca con nome giorno (vecchio formato)
        if (existingResIndex === -1) {
            existingResIndex = court.reservations?.findIndex(r => {
                const fromMin = timeToMin(r.from);
                const toMin = timeToMin(r.to);
                return !r.date && r.day === dayName && (clickedTimeMin >= fromMin && clickedTimeMin < toMin);
            }) ?? -1;
        }
        const existingRes = existingResIndex !== -1 ? court.reservations[existingResIndex] : null;

        // Cerca anche nei match (generati dal vecchio sistema accoppiamenti)
        const existingMatchIndex = court.matches?.findIndex(m =>
            m.day === dayName && m.time === time
        ) ?? -1;
        const existingMatch = existingMatchIndex !== -1 ? court.matches[existingMatchIndex] : null;

        // Usa esistingRes o existingMatch
        const hasExisting = existingRes || existingMatch;

        // Calculate end time - always use next grid slot, NOT the reservation's full range
        const planningTemplates = Storage.load('planning_templates', {});
        const times = planningTemplates[dateStr]?.[courtId] || ['08.30', '09.30', '10.30', '11.30', '12.30', '13.30', '14.30', '15.30', '16.30', '17.30', '18.30', '19.30', '20.30', '21.30', '22.30'];
        const currentIndex = parseInt(index);
        const nextTimeRaw = times[currentIndex + 1];
        // Use only the next grid slot time, not the reservation's full span
        const endTime = nextTimeRaw ? nextTimeRaw.replace('.', ':') : Matching.addTime(time, 60);

        // For display in modal: always use the clicked cell's time slot, not the full reservation range
        // This allows the user to modify just the clicked slot or expand the range as needed
        const displayStartTime = time;
        const displayEndTime = endTime;

        const activityTypes = [
            { id: 'scuola', label: 'Scuola' },
            { id: 'torneo', label: 'Torneo' },
            { id: 'ago', label: 'AGO' },
            { id: 'promo', label: 'PROMO' },
            { id: 'manutenzione', label: 'Manutenzione' }
        ];

        const capitalizedDay = dayName.charAt(0).toUpperCase() + dayName.slice(1);
        const title = existingRes ? `Gestione Attività - ${capitalizedDay} - ${court.name}` : `Nuova Attività - ${capitalizedDay} - ${court.name} (${time} - ${endTime})`;

        const body = `
            <div class="modal-three-columns">
                <!-- Row for Activity/Player selection with radio buttons -->
                <div class="selection-row" id="selection-row">
                    <div class="selection-option">
                        <input type="radio" id="mode-activity" name="selection-mode" value="activity" checked onchange="App.toggleSelectionMode('activity')">
                        <label for="mode-activity">Attività</label>
                        <select id="activity-type-select" class="form-control" onchange="
                            var type = this.value;
                            document.getElementById('selected-type').value = type;
                            if(type !== 'match') {
                                document.getElementById('slot-player-1').value = this.options[this.selectedIndex].text;
                                document.getElementById('slot-player-2').value = '';
                                document.getElementById('slot-player-3').value = '';
                                document.getElementById('slot-player-4').value = '';
                                App.updateSlotLabel();
                            }
                        ">
                            <option value="match" ${existingRes?.type === 'match' || !existingRes?.type ? 'selected' : ''}>Match</option>
                            ${activityTypes.map(type => `
                                <option value="${type.id}" ${existingRes?.type === type.id ? 'selected' : ''}>${type.label}</option>
                            `).join('')}
                        </select>
                    </div>
                    <div class="selection-option">
                        <input type="radio" id="mode-player" name="selection-mode" value="player" onchange="App.toggleSelectionMode('player')">
                        <label for="mode-player">Giocatore</label>
                        <select id="player-select" class="form-control" disabled onchange="
                            if(this.value) {
                                App.insertPlayerInActiveSlot(this.value);
                                this.value = '';
                            }
                        ">
                            <option value="">-- Scegli --</option>
                            ${players.map(p => `
                                <option value="${p.name}" ${!p.isAvailable ? 'style="color:#999;"' : ''}>${p.name} (${p.level || 'N/A'})${p.timePrefsDisplay ? ' ' + p.timePrefsDisplay : ''}${!p.isAvailable ? ' ⚠️' : ''}</option>
                            `).join('')}
                        </select>
                    </div>
                
                <!-- Colonna centrale: Nominativi + Orario -->
                <div class="center-column">
                    <div class="form-group">
                        <label>Nominativi e Quote (€) / Pagato (€)</label>
                        <div class="players-grid-input">
                            <div class="player-row">
                                <input type="text" id="slot-player-1" class="player-input" placeholder="Giocatore 1" 
                                       value="${existingRes?.players?.[0] || ''}" onfocus="App.setActivePlayerInput(1)">
                                <input type="number" id="slot-payment-1" class="payment-input" placeholder="Quota" min="0" step="0.5"
                                       value="${existingRes?.payments?.[0] ?? ''}" style="width: 50px;" title="Quota calcolata">
                                <input type="number" id="slot-paid-1" class="payment-input" placeholder="Pagato" min="0" step="0.5"
                                       value="${existingRes?.paid?.[0] ?? ''}" style="width: 50px;" title="Importo effettivamente pagato">
                            </div>
                            <div class="player-row">
                                <input type="text" id="slot-player-2" class="player-input" placeholder="Giocatore 2"
                                       value="${existingRes?.players?.[1] || ''}" onfocus="App.setActivePlayerInput(2)">
                                <input type="number" id="slot-payment-2" class="payment-input" placeholder="Quota" min="0" step="0.5"
                                       value="${existingRes?.payments?.[1] ?? ''}" style="width: 50px;" title="Quota calcolata">
                                <input type="number" id="slot-paid-2" class="payment-input" placeholder="Pagato" min="0" step="0.5"
                                       value="${existingRes?.paid?.[1] ?? ''}" style="width: 50px;" title="Importo effettivamente pagato">
                            </div>
                            <div class="player-row">
                                <input type="text" id="slot-player-3" class="player-input" placeholder="Giocatore 3"
                                       value="${existingRes?.players?.[2] || ''}" onfocus="App.setActivePlayerInput(3)">
                                <input type="number" id="slot-payment-3" class="payment-input" placeholder="Quota" min="0" step="0.5"
                                       value="${existingRes?.payments?.[2] ?? ''}" style="width: 50px;" title="Quota calcolata">
                                <input type="number" id="slot-paid-3" class="payment-input" placeholder="Pagato" min="0" step="0.5"
                                       value="${existingRes?.paid?.[2] ?? ''}" style="width: 50px;" title="Importo effettivamente pagato">
                            </div>
                            <div class="player-row">
                                <input type="text" id="slot-player-4" class="player-input" placeholder="Giocatore 4"
                                       value="${existingRes?.players?.[3] || ''}" onfocus="App.setActivePlayerInput(4)">
                                <input type="number" id="slot-payment-4" class="payment-input" placeholder="Quota" min="0" step="0.5"
                                       value="${existingRes?.payments?.[3] ?? ''}" style="width: 50px;" title="Quota calcolata">
                                <input type="number" id="slot-paid-4" class="payment-input" placeholder="Pagato" min="0" step="0.5"
                                       value="${existingRes?.paid?.[3] ?? ''}" style="width: 50px;" title="Importo effettivamente pagato">
                            </div>
                        </div>
                        <input type="hidden" id="slot-label" value="${existingRes?.label || ''}">
                    </div>
                    
                    <div class="time-selection" style="margin-top: 10px;">
                        <div class="form-row">
                            <div class="form-group">
                                <label>Orario Inizio</label>
                                <div style="display: flex; gap: 5px; align-items: center;">
                                    <select id="slot-start-hour" class="filter-select">
                                        ${Array.from({ length: 16 }, (_, i) => i + 8)
                .map(h => `<option value="${String(h).padStart(2, '0')}" ${String(h).padStart(2, '0') === displayStartTime.split(':')[0] ? 'selected' : ''}>${String(h).padStart(2, '0')}</option>`)
                .join('')}
                                    </select>
                                    <span>:</span>
                                    <select id="slot-start-min" class="filter-select">
                                        <option value="00" ${displayStartTime.split(':')[1] === '00' ? 'selected' : ''}>00</option>
                                        <option value="30" ${displayStartTime.split(':')[1] === '30' ? 'selected' : ''}>30</option>
                                    </select>
                                </div>
                            </div>
                            <div class="form-group">
                                <label>Orario Fine</label>
                                <div style="display: flex; gap: 5px; align-items: center;">
                                    <select id="slot-end-hour" class="filter-select">
                                        ${Array.from({ length: 16 }, (_, i) => i + 8)
                .map(h => `<option value="${String(h).padStart(2, '0')}" ${String(h).padStart(2, '0') === displayEndTime.split(':')[0] ? 'selected' : ''}>${String(h).padStart(2, '0')}</option>`)
                .join('')}
                                    </select>
                                    <span>:</span>
                                    <select id="slot-end-min" class="filter-select">
                                        <option value="00" ${displayEndTime.split(':')[1] === '00' ? 'selected' : ''}>00</option>
                                        <option value="30" ${displayEndTime.split(':')[1] === '30' ? 'selected' : ''}>30</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                        
                        <!-- Pulsanti di Eliminazione -->
                        <div class="delete-buttons-section" style="margin-top: 15px; padding: 10px; background: rgba(239, 68, 68, 0.1); border-radius: 8px; border: 1px solid rgba(239, 68, 68, 0.3);">
                            <label style="display: block; margin-bottom: 8px; color: var(--text-primary); font-weight: 500;">🗑️ Elimina Prenotazioni</label>
                            <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                                ${hasExisting ? `<button class="btn btn-danger btn-sm" onclick="App.deleteSlotFromModal('${courtId}', '${dayName}')">🗑️ Elimina Range</button>` : ''}
                                <button class="btn btn-warning btn-sm" onclick="App.deleteAllDayReservations('${courtId}', '${dayName}')">📅 Elimina Giornata</button>
                                <button class="btn btn-outline btn-sm" onclick="App.clearAllReservations()" style="border-color: #ef4444; color: #ef4444;">🧹 Pulisci Tutto</button>
                            </div>
                        </div>
                </div>
            </div>
            <input type="hidden" id="selected-type" value="${existingRes?.type || 'match'}">
        `;

        const footer = `
            <div class="modal-footer-buttons" style="display: flex; justify-content: flex-end; gap: 10px;">
                <button class="btn btn-secondary" onclick="App.closeModal()">Annulla</button>
                <button class="btn btn-success" onclick="App.initiatePayment()" style="background: #22c55e; color: white;" title="Paga la prenotazione">💳 Paga Ora</button>
                <button class="btn btn-primary" onclick="App.confirmPlanningSlot('${courtId}', '${dayName}', ${existingResIndex})">
                    ${hasExisting ? '💾 Salva' : '✓ Conferma'}
                </button>
            </div>
        `;

        this.showModal(title, body, footer);
    },

    confirmPlanningSlot(courtId, day, existingIndex = -1) {
        console.log('[CONFIRM] Called with:', courtId, day, existingIndex);

        // Get elements with null checks
        const typeEl = document.getElementById('selected-type');
        const labelEl = document.getElementById('slot-label');
        const startHourEl = document.getElementById('slot-start-hour');
        const startMinEl = document.getElementById('slot-start-min');
        const endHourEl = document.getElementById('slot-end-hour');
        const endMinEl = document.getElementById('slot-end-min');

        // Check if all required elements exist
        if (!typeEl || !startHourEl || !startMinEl || !endHourEl || !endMinEl) {
            console.error('[CONFIRM] Missing required elements:', {
                typeEl: !!typeEl,
                startHourEl: !!startHourEl,
                startMinEl: !!startMinEl,
                endHourEl: !!endHourEl,
                endMinEl: !!endMinEl
            });
            alert('Errore: Elementi del form non trovati. Riapri il modal e riprova.');
            return;
        }

        const type = typeEl.value;
        let label = labelEl ? labelEl.value : '';

        // Read times from the selectors
        const startHour = startHourEl.value;
        const startMin = startMinEl.value;
        const endHour = endHourEl.value;
        const endMin = endMinEl.value;

        const time = `${startHour}:${startMin}`;
        const endTime = `${endHour}:${endMin}`;

        // Validate time range
        if (time >= endTime) {
            alert('L\'orario di fine deve essere successivo a quello di inizio');
            return;
        }

        // If no label, use the activity type name capitalized
        if (!label) {
            label = type.charAt(0).toUpperCase() + type.slice(1);
        }

        const priceEl = document.getElementById('slot-price');
        const price = priceEl ? priceEl.value : '';

        // Collect 4 players
        const playersArray = [];
        for (let i = 1; i <= 4; i++) {
            const input = document.getElementById(`slot-player-${i}`);
            if (input) {
                playersArray.push(input.value.trim());
            }
        }

        // Collect 4 payments
        const paymentsArray = [];
        for (let i = 1; i <= 4; i++) {
            const input = document.getElementById(`slot-payment-${i}`);
            if (input) {
                paymentsArray.push(parseFloat(input.value) || 0);
            }
        }

        // Collect 4 paid amounts (actual paid by player)
        const paidArray = [];
        for (let i = 1; i <= 4; i++) {
            const input = document.getElementById(`slot-paid-${i}`);
            if (input) {
                paidArray.push(parseFloat(input.value) || 0);
            }
        }

        console.log('[CONFIRM] Starting confirmPlanningSlot', { courtId, day, existingIndex });
        console.log('[CONFIRM] Time range:', time, '-', endTime);
        console.log('[CONFIRM] Players:', playersArray);
        console.log('[CONFIRM] Payments:', paymentsArray);

        // Check if there's any content to save
        const hasPlayers = playersArray.some(p => p && p.length > 0);
        const isActivityType = type !== 'match';

        if (!hasPlayers && !isActivityType) {
            alert('Inserisci almeno un nominativo o seleziona un tipo di attività diverso da Match.');
            return;
        }

        const court = Courts.getById(courtId);
        if (!court) {
            console.error('[CONFIRM] Court not found:', courtId);
            alert('Errore: Campo non trovato. Riprova.');
            return;
        }
        court.reservations = court.reservations || [];

        const reservationData = {
            day: day,
            date: this.currentPlanningDate.toISOString().split('T')[0],
            from: time,
            to: endTime,
            type: type,
            label: label,
            players: playersArray,
            payments: paymentsArray,
            paid: paidArray,
            price: price,
            paymentMethod: document.querySelector('input[name="payment-method"]:checked')?.value || 'contanti'
        };

        // First, remove all reservations that overlap with the new time range
        const newReservationsList = [];
        const currentDateStr = this.currentPlanningDate.toISOString().split('T')[0];
        court.reservations.forEach(r => {
            // Match by date if both have date, otherwise by day name for old reservations
            let isMatchingDay = false;
            if (r.date) {
                // New format: match by exact date
                isMatchingDay = r.date === currentDateStr;
            } else {
                // Old format (no date): match by day name
                isMatchingDay = r.day === day;
            }

            if (!isMatchingDay) {
                // Different date/day, keep it
                newReservationsList.push(r);
                return;
            }

            // Check if this reservation overlaps with the new one
            const overlaps = (r.from < endTime && r.to > time);

            if (!overlaps) {
                // No overlap, keep it
                newReservationsList.push(r);
            } else {
                // Overlaps - check if we need to keep parts of it

                // Part before the new reservation
                if (r.from < time) {
                    newReservationsList.push({
                        ...r,
                        to: time
                    });
                }

                // Part after the new reservation
                if (r.to > endTime) {
                    newReservationsList.push({
                        ...r,
                        from: endTime
                    });
                }
            }
        });

        // Add the new reservation
        newReservationsList.push(reservationData);
        court.reservations = newReservationsList;

        Courts.update(courtId, court);
        this.closeModal();
        this.renderPlanning();
    },

    deleteSlotFromModal(courtId, day) {
        // Read the time range from the modal selectors
        const startHour = document.getElementById('slot-start-hour').value;
        const startMin = document.getElementById('slot-start-min').value;
        const endHour = document.getElementById('slot-end-hour').value;
        const endMin = document.getElementById('slot-end-min').value;

        const deleteFrom = `${startHour}:${startMin}`;
        const deleteTo = `${endHour}:${endMin}`;

        // Validate time range
        if (deleteFrom >= deleteTo) {
            alert('L\'orario di fine deve essere successivo a quello di inizio');
            return;
        }

        // Call the existing delete function with the range from the modal
        this.deletePlanningSlot(courtId, day, deleteFrom, deleteTo);
    },

    deletePlanningSlot(courtId, day, deleteFrom, deleteTo) {
        // Use the time parameters directly - they come from the clicked cell
        if (!confirm(`Sei sicuro di voler eliminare l'attività dalle ${deleteFrom} alle ${deleteTo}?`)) return;

        const court = Courts.getById(courtId);
        const currentDateStr = this.currentPlanningDate.toISOString().split('T')[0];
        console.log(`[DELETE] Trying to delete: court=${courtId}, day=${day}, date=${currentDateStr}, from=${deleteFrom}, to=${deleteTo}`);

        // Helper function to convert time to minutes for accurate comparison
        const timeToMin = (t) => {
            if (!t) return 0;
            const [h, m] = t.replace('.', ':').split(':').map(Number);
            return (h * 60) + (m || 0);
        };

        const deleteFromMin = timeToMin(deleteFrom);
        const deleteToMin = timeToMin(deleteTo);

        if (court) {
            // Log all reservations before filtering
            console.log(`[DELETE] Reservations before:`, court.reservations?.map(r => `${r.date || r.day} ${r.from}-${r.to} ${r.label}`));

            // Remove or split reservations that overlap with the selected time range
            if (court.reservations) {
                const newReservations = [];
                court.reservations.forEach(r => {
                    // Only delete reservations with matching date
                    // Keep all reservations without date (recurring/old format)
                    const isMatchingDate = r.date && r.date === currentDateStr;
                    if (!isMatchingDate) {
                        console.log(`[DELETE] KEEP (different/no date): ${r.date || r.day} ${r.from}-${r.to}`);
                        newReservations.push(r);
                        return;
                    }

                    // Convert reservation times to minutes for accurate comparison
                    const rFromMin = timeToMin(r.from);
                    const rToMin = timeToMin(r.to);

                    // Check if this reservation overlaps with the delete range
                    const overlaps = (rFromMin < deleteToMin && rToMin > deleteFromMin);

                    if (!overlaps) {
                        console.log(`[DELETE] KEEP (no overlap): ${r.from}-${r.to}`);
                        newReservations.push(r);
                        return;
                    }

                    // This reservation overlaps - split it if needed
                    console.log(`[DELETE] REMOVING: ${r.from}-${r.to}, delete range ${deleteFrom}-${deleteTo}`);

                    // Keep the part BEFORE the delete range
                    if (rFromMin < deleteFromMin) {
                        console.log(`[DELETE] Keeping before part: ${r.from}-${deleteFrom}`);
                        newReservations.push({ ...r, to: deleteFrom });
                    }

                    // Keep the part AFTER the delete range
                    if (rToMin > deleteToMin) {
                        console.log(`[DELETE] Keeping after part: ${deleteTo}-${r.to}`);
                        newReservations.push({ ...r, from: deleteTo });
                    }
                });
                court.reservations = newReservations;
            }

            console.log(`[DELETE] Reservations after:`, court.reservations?.map(r => `${r.date || r.day} ${r.from}-${r.to} ${r.label}`));

            // Remove matches that overlap with the selected time range
            if (court.matches) {
                court.matches = court.matches.filter(m => {
                    if (m.day !== day) return true;
                    // Match time in format HH:MM
                    const matchTime = m.time;
                    const overlaps = (matchTime >= deleteFrom && matchTime < deleteTo);
                    return !overlaps;
                });
            }

            Courts.update(courtId, court);
            this.closeModal();
            this.renderPlanning();
        }
    },

    deleteAllDayReservations(courtId, day) {
        if (!confirm(`Sei sicuro di voler eliminare TUTTE le prenotazioni di ${day} per questo campo?`)) return;

        const court = Courts.getById(courtId);
        const currentDateStr = this.currentPlanningDate.toISOString().split('T')[0];
        if (court) {
            // Remove all reservations for this specific date
            if (court.reservations) {
                court.reservations = court.reservations.filter(r => {
                    // Match by date if available, otherwise by day name
                    const isMatchingDay = r.date ? r.date === currentDateStr : r.day === day;
                    return !isMatchingDay;
                });
            }

            // Remove all matches for this day (from old matching system)
            if (court.matches) {
                court.matches = court.matches.filter(m => m.day !== day);
            }

            Courts.update(courtId, court);
            this.closeModal();
            this.renderPlanning();
            alert(`Tutte le prenotazioni di ${day} sono state eliminate.`);
        }
    },

    clearAllReservations() {
        if (!confirm('⚠️ ATTENZIONE: Sei sicuro di voler eliminare TUTTE le prenotazioni e i match da TUTTI i campi? Questa azione non può essere annullata!')) return;

        const courts = Courts.getAll();
        courts.forEach(court => {
            court.matches = [];
            court.reservations = [];
            Courts.update(court.id, court);
        });

        // Pulisce anche i match schedulati e lo storico
        Storage.save(Storage.KEYS.SCHEDULED, []);
        Storage.save(Storage.KEYS.MATCHES, []);

        this.closeModal();
        this.renderPlanning();
        alert('✅ Tutte le prenotazioni e i match sono stati eliminati da tutti i campi!');
    },

    autoMatchPlayers(dateStr, time) {
        // Read match type from dropdown
        const matchTypeSelect = document.getElementById('match-type-auto');
        const matchType = matchTypeSelect ? matchTypeSelect.value : 'singles';
        const requiredPlayers = matchType === 'doubles' ? 4 : 2;
        const dayName = Matching.getDayNameFromDate(dateStr);

        // Get available players for this time slot
        let availablePlayers = Availability.getAvailablePlayers(dateStr, time, matchType);

        // Filter out players who are already booked for this day
        const courts = Courts.getAll();
        const bookedPlayersToday = new Set();

        courts.forEach(court => {
            // Check reservations
            if (court.reservations) {
                court.reservations.forEach(r => {
                    // Prenotazioni con data specifica devono corrispondere esattamente
                    // Prenotazioni ricorrenti (senza data) corrispondono per giorno della settimana
                    const isMatchingDate = r.date ? (r.date === dateStr) : (r.day === dayName);

                    if (isMatchingDate && r.players) {
                        r.players.forEach(playerName => {
                            if (playerName) bookedPlayersToday.add(playerName.toLowerCase());
                        });
                    }
                });
            }
            // Check matches
            if (court.matches) {
                court.matches.forEach(m => {
                    // Anche per i match, controlliamo la data se disponibile
                    const isMatchingDate = m.date ? (m.date === dateStr) : (m.day === dayName);

                    if (isMatchingDate && m.players) {
                        m.players.forEach(playerId => {
                            const player = Players.getById(playerId);
                            if (player) bookedPlayersToday.add(player.name.toLowerCase());
                        });
                    }
                });
            }
        });

        // Filter out already booked players
        availablePlayers = availablePlayers.filter(p =>
            !bookedPlayersToday.has(p.name.toLowerCase())
        );

        if (availablePlayers.length < requiredPlayers) {
            alert(`Non ci sono abbastanza giocatori disponibili per un ${matchType === 'doubles' ? 'doppio' : 'singolo'} (minimo ${requiredPlayers}). Alcuni potrebbero essere già prenotati oggi.`);
            return;
        }

        // Group players by level
        const playersByLevel = {};
        availablePlayers.forEach(player => {
            const level = player.level || 'N/D';
            if (!playersByLevel[level]) {
                playersByLevel[level] = [];
            }
            playersByLevel[level].push(player);
        });

        // Find levels with enough players for the match type
        const matchableLevels = Object.keys(playersByLevel).filter(
            level => playersByLevel[level].length >= requiredPlayers
        );

        if (matchableLevels.length === 0) {
            alert(`Non ci sono abbastanza giocatori dello stesso livello per un ${matchType === 'doubles' ? 'doppio' : 'singolo'}.`);
            return;
        }

        // Take the first level with enough players
        const selectedLevel = matchableLevels[0];
        const playersOfLevel = playersByLevel[selectedLevel];

        // Shuffle to randomize selection
        const shuffled = playersOfLevel.sort(() => Math.random() - 0.5);

        // Fill the player inputs (2 for singles, 4 for doubles)
        for (let i = 0; i < 4; i++) {
            const input = document.getElementById(`slot-player-${i + 1}`);
            if (input) {
                input.value = i < requiredPlayers ? shuffled[i].name : '';
            }
        }

        // Update the hidden label field
        this.updateSlotLabel();

        // Show feedback
        const tipoPart = matchType === 'doubles' ? 'Doppio' : 'Singolo';
        alert(`${tipoPart}: ${requiredPlayers} giocatori di livello "${selectedLevel}" selezionati!`);
    },

    setActivePlayerInput(slotNum) {
        this.activePlayerSlot = slotNum;
        // Evidenzia visivamente lo slot attivo
        document.querySelectorAll('.player-input').forEach((input, index) => {
            input.classList.toggle('active-slot', index + 1 === slotNum);
        });
    },

    toggleSelectionMode(mode) {
        const activitySelect = document.getElementById('activity-type-select');
        const playerSelect = document.getElementById('player-select');

        if (mode === 'activity') {
            activitySelect.disabled = false;
            playerSelect.disabled = true;
        } else {
            activitySelect.disabled = true;
            playerSelect.disabled = false;
        }
    },

    insertPlayerInActiveSlot(playerName) {
        // Controlla se il nome è già presente in un altro slot della stessa cella
        for (let i = 1; i <= 4; i++) {
            const slot = document.getElementById(`slot-player-${i}`);
            if (slot && slot.value.toLowerCase() === playerName.toLowerCase() && i !== this.activePlayerSlot) {
                alert(`${playerName} è già presente nello slot ${i}!`);
                return;
            }
        }

        // Trova il giocatore selezionato
        const allPlayers = Players.getAll();
        const selectedPlayer = allPlayers.find(p => p.name.toLowerCase() === playerName.toLowerCase());

        // Controlla se uno dei giocatori già inseriti ha messo "non vuole giocare con" il giocatore selezionato
        if (selectedPlayer) {
            for (let i = 1; i <= 4; i++) {
                if (i === this.activePlayerSlot) continue;
                const slot = document.getElementById(`slot-player-${i}`);
                if (slot && slot.value.trim()) {
                    const existingPlayerName = slot.value.trim();
                    const existingPlayer = allPlayers.find(p => p.name.toLowerCase() === existingPlayerName.toLowerCase());
                    if (existingPlayer && existingPlayer.avoidPlayers && existingPlayer.avoidPlayers.includes(selectedPlayer.id)) {
                        const proceed = confirm(`⚠️ Attenzione: ${existingPlayer.name} ha impostato di NON voler giocare con ${playerName}!\n\nVuoi inserirlo comunque?`);
                        if (!proceed) return;
                    }
                    // Controlla anche il contrario: se il giocatore selezionato non vuole giocare con quello già inserito
                    if (selectedPlayer.avoidPlayers && existingPlayer && selectedPlayer.avoidPlayers.includes(existingPlayer.id)) {
                        const proceed = confirm(`⚠️ Attenzione: ${playerName} ha impostato di NON voler giocare con ${existingPlayer.name}!\n\nVuoi inserirlo comunque?`);
                        if (!proceed) return;
                    }
                }
            }
        }

        // Controlla se il giocatore è già prenotato in un'altra cella della giornata
        const dateStr = this.currentPlanningDate.toISOString().split('T')[0];
        const dayName = Matching.getDayNameFromDate(dateStr);
        const courts = Courts.getAll();

        let alreadyBookedAt = null;
        courts.forEach(court => {
            if (court.reservations) {
                court.reservations.forEach(r => {
                    // Verifica: prenotazioni con data specifica devono corrispondere esattamente
                    // Prenotazioni ricorrenti (senza data) corrispondono per giorno della settimana
                    const isMatchingDate = r.date ? (r.date === dateStr) : (r.day === dayName);

                    if (isMatchingDate && r.players) {
                        r.players.forEach(pName => {
                            if (pName && pName.toLowerCase() === playerName.toLowerCase()) {
                                alreadyBookedAt = { court: court.name, from: r.from, to: r.to };
                            }
                        });
                    }
                });
            }
        });

        if (alreadyBookedAt) {
            const proceed = confirm(`⚠️ ${playerName} è già prenotato oggi:\n${alreadyBookedAt.court} dalle ${alreadyBookedAt.from} alle ${alreadyBookedAt.to}\n\nVuoi inserirlo comunque?`);
            if (!proceed) return;
        }

        const input = document.getElementById(`slot-player-${this.activePlayerSlot}`);
        if (input) {
            input.value = playerName;

            // Auto-fill payment based on player membership and date
            const paymentInput = document.getElementById(`slot-payment-${this.activePlayerSlot}`);
            if (paymentInput) {
                const bookingDate = this.currentPlanningDate.toISOString().split('T')[0];
                const bookingTime = this.activePlanningSlot?.time || '12:00';
                const rate = this.getPlayerRate(playerName, bookingDate, bookingTime);
                if (rate > 0) {
                    paymentInput.value = rate;
                }
            }

            // Passa automaticamente allo slot successivo
            if (this.activePlayerSlot < 4) {
                this.setActivePlayerInput(this.activePlayerSlot + 1);
                document.getElementById(`slot-player-${this.activePlayerSlot}`).focus();
            }
            // Aggiorna il campo hidden label
            this.updateSlotLabel();
        }
    },

    updateSlotLabel() {
        const players = [];
        for (let i = 1; i <= 4; i++) {
            const input = document.getElementById(`slot-player-${i}`);
            if (input && input.value.trim()) {
                players.push(input.value.trim());
            }
        }
        document.getElementById('slot-label').value = players.join(' / ');
    },

    // Initiate payment flow for the current booking
    initiatePayment() {
        // Calculate total amount from the payment inputs
        let playerPayments = [];

        for (let i = 1; i <= 4; i++) {
            const playerInput = document.getElementById(`slot-player-${i}`);
            const paymentInput = document.getElementById(`slot-payment-${i}`);
            const paidInput = document.getElementById(`slot-paid-${i}`);

            if (playerInput && playerInput.value.trim() && paymentInput) {
                const quota = parseFloat(paymentInput.value) || 0;
                const paid = parseFloat(paidInput?.value) || 0;
                const remaining = quota - paid;

                if (playerInput.value.trim()) {
                    playerPayments.push({
                        index: i,
                        player: playerInput.value.trim(),
                        quota: quota,
                        paid: paid,
                        remaining: remaining > 0 ? remaining : 0
                    });
                }
            }
        }

        if (playerPayments.length === 0) {
            alert('⚠️ Inserisci almeno un giocatore per procedere al pagamento.');
            return;
        }

        // Show new payment modal with player selection
        this.showPaymentModal(playerPayments);
    },

    showPaymentModal(playerPayments) {
        const dateStr = this.currentPlanningDate.toISOString().split('T')[0];
        const description = `Prenotazione Tennis - ${dateStr}`;

        // Build player selection list with checkboxes
        const playersListHtml = playerPayments.map((p, idx) => `
            <div class="payment-player-row" style="display: flex; align-items: center; gap: 10px; padding: 10px; background: ${p.remaining > 0 ? 'rgba(239, 68, 68, 0.1)' : 'rgba(34, 197, 94, 0.1)'}; border-radius: 8px; margin-bottom: 8px; border: 1px solid ${p.remaining > 0 ? 'rgba(239, 68, 68, 0.3)' : 'rgba(34, 197, 94, 0.3)'};">
                <input type="checkbox" id="pay-player-${p.index}" class="pay-player-checkbox" data-index="${p.index}" 
                       onchange="App.updatePaymentTotal()">
                <div style="flex: 1;">
                    <div style="font-weight: 500; color: var(--text-primary);">${p.player} ${p.remaining > 0 ? '⚠️' : '✅'}</div>
                    <div style="font-size: 0.8rem; color: var(--text-muted);">
                        Quota: €${p.quota.toFixed(2)} | Già pagato: €${p.paid.toFixed(2)} ${p.remaining > 0 ? `| <span style="color:#ef4444;">Da pagare: €${p.remaining.toFixed(2)}</span>` : ''}
                    </div>
                </div>
                <div style="display: flex; align-items: center; gap: 5px;">
                    <span style="color: var(--text-secondary);">€</span>
                    <input type="number" id="pay-amount-${p.index}" class="payment-input" 
                           value="${p.remaining.toFixed(2)}" min="0" step="0.5" 
                           style="width: 70px; text-align: right;" 
                           onchange="App.updatePaymentTotal()">
                </div>
            </div>
        `).join('');

        const innerBody = `
            <div style="padding: 15px;">
                <h4 style="color: var(--text-primary); margin-bottom: 15px; text-align: center;">📋 Seleziona Pagamenti</h4>
                
                <!-- Player Selection -->
                <div class="payment-players-list" style="margin-bottom: 20px;">
                    ${playersListHtml}
                </div>

                <!-- Payment Total -->
                <div style="display: flex; justify-content: space-between; padding: 15px; background: rgba(34, 197, 94, 0.1); border-radius: 8px; margin-bottom: 20px; border: 1px solid rgba(34, 197, 94, 0.3);">
                    <span style="font-weight: 600; color: var(--text-primary);">Totale da pagare:</span>
                    <span id="payment-total-amount" style="font-weight: 700; font-size: 1.3rem; color: #22c55e;">€0.00</span>
                </div>

                <!-- Payment Method Selection -->
                <div style="margin-bottom: 20px;">
                    <label style="display: block; margin-bottom: 10px; color: var(--text-primary); font-weight: 500;">💳 Metodo di Pagamento</label>
                    <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                        <label style="display: flex; align-items: center; gap: 5px; cursor: pointer; padding: 10px 15px; background: var(--bg-card); border-radius: 8px; border: 2px solid var(--border-color); flex: 1; justify-content: center;" 
                               onclick="App.selectPaymentMethod('contanti')">
                            <input type="radio" name="modal-payment-method" value="contanti" checked>
                            <span>💵 Contanti</span>
                        </label>
                        <label style="display: flex; align-items: center; gap: 5px; cursor: pointer; padding: 10px 15px; background: var(--bg-card); border-radius: 8px; border: 2px solid var(--border-color); flex: 1; justify-content: center;"
                               onclick="App.selectPaymentMethod('carta')">
                            <input type="radio" name="modal-payment-method" value="carta">
                            <span>💳 Carta</span>
                        </label>
                        <label style="display: flex; align-items: center; gap: 5px; cursor: pointer; padding: 10px 15px; background: var(--bg-card); border-radius: 8px; border: 2px solid var(--border-color); flex: 1; justify-content: center;"
                               onclick="App.selectPaymentMethod('paypal')">
                            <input type="radio" name="modal-payment-method" value="paypal">
                            <span>🅿️ PayPal</span>
                        </label>
                    </div>
                </div>

                <!-- PayPal/Stripe Container -->
                <div id="payment-method-container" style="display: none; margin-bottom: 15px;"></div>

                <!-- Action Buttons -->
                <div style="display: flex; gap: 10px;">
                    <button class="btn btn-secondary" onclick="App.closePaymentModal()" style="flex: 1;">Annulla</button>
                    <button class="btn btn-success" id="confirm-payment-btn" onclick="App.confirmPayment()" style="flex: 2; background: #22c55e; color: white;">
                        ✓ Conferma Pagamento
                    </button>
                </div>
            </div>
        `;

        // Store player payments for later use
        this.pendingPayments = playerPayments;

        // Create sub-modal
        const subModal = document.createElement('div');
        subModal.id = 'payment-sub-modal';
        subModal.className = 'modal-overlay active';
        subModal.innerHTML = `
            <div class="modal" style="max-width: 500px; max-height: 90vh; display: flex; flex-direction: column;">
                <div class="modal-header">
                    <h3>💳 Pagamento Prenotazione</h3>
                    <button class="modal-close" onclick="App.closePaymentModal()">×</button>
                </div>
                <div class="modal-body" style="overflow-y: auto; flex: 1;">${innerBody}</div>
            </div>
        `;
        document.body.appendChild(subModal);

        // Calculate initial total
        setTimeout(() => this.updatePaymentTotal(), 50);
    },

    // Update payment total based on selected players
    updatePaymentTotal() {
        let total = 0;
        const checkboxes = document.querySelectorAll('.pay-player-checkbox:checked');

        checkboxes.forEach(cb => {
            const idx = cb.dataset.index;
            const amountInput = document.getElementById(`pay-amount-${idx}`);
            if (amountInput) {
                total += parseFloat(amountInput.value) || 0;
            }
        });

        const totalEl = document.getElementById('payment-total-amount');
        if (totalEl) {
            totalEl.textContent = `€${total.toFixed(2)}`;
        }
    },

    // Select payment method and update UI
    selectPaymentMethod(method) {
        const container = document.getElementById('payment-method-container');
        const confirmBtn = document.getElementById('confirm-payment-btn');

        if (!container) return;

        // Update radio button
        const radio = document.querySelector(`input[name="modal-payment-method"][value="${method}"]`);
        if (radio) radio.checked = true;

        if (method === 'contanti') {
            container.style.display = 'none';
            if (confirmBtn) {
                confirmBtn.textContent = '✓ Registra Pagamento';
                confirmBtn.onclick = () => this.confirmPayment();
            }
        } else if (method === 'paypal') {
            container.style.display = 'block';
            container.innerHTML = '<div id="paypal-buttons-modal" style="min-height: 120px;"></div>';
            if (confirmBtn) {
                confirmBtn.style.display = 'none';
            }
            // Render PayPal buttons
            setTimeout(() => {
                const total = this.calculateSelectedTotal();
                if (total > 0) {
                    this.renderPayPalButtons(total, `Prenotazione Tennis - ${this.currentPlanningDate.toISOString().split('T')[0]}`);
                }
            }, 100);
        } else if (method === 'carta') {
            container.style.display = 'block';
            const total = this.calculateSelectedTotal();
            container.innerHTML = `
                <button class="btn btn-primary" onclick="App.openStripePayment(${total}, 'Prenotazione Tennis')" 
                        style="width: 100%; padding: 15px; font-size: 1.1rem; background: linear-gradient(135deg, #635bff, #a855f7);">
                    💳 Paga €${total.toFixed(2)} con Carta
                </button>
            `;
            if (confirmBtn) {
                confirmBtn.style.display = 'none';
            }
        }
    },

    // Calculate total from selected checkboxes
    calculateSelectedTotal() {
        let total = 0;
        const checkboxes = document.querySelectorAll('.pay-player-checkbox:checked');

        checkboxes.forEach(cb => {
            const idx = cb.dataset.index;
            const amountInput = document.getElementById(`pay-amount-${idx}`);
            if (amountInput) {
                total += parseFloat(amountInput.value) || 0;
            }
        });

        return total;
    },

    // Confirm payment and update paid fields
    confirmPayment() {
        const checkboxes = document.querySelectorAll('.pay-player-checkbox:checked');
        console.log('[PAYMENT DEBUG] Found checked checkboxes:', checkboxes.length);

        if (checkboxes.length === 0) {
            alert('⚠️ Seleziona almeno un giocatore da pagare.');
            return;
        }

        const paymentMethod = document.querySelector('input[name="modal-payment-method"]:checked')?.value || 'contanti';
        console.log('[PAYMENT DEBUG] Payment method:', paymentMethod);

        // Calculate total BEFORE closing modal (since we need the payment amounts)
        let total = 0;
        const paidPlayers = [];

        // Update paid fields in the main modal - ONLY for checked players
        checkboxes.forEach(cb => {
            const idx = cb.dataset.index;
            console.log('[PAYMENT DEBUG] Processing checkbox for player index:', idx);

            const amountInput = document.getElementById(`pay-amount-${idx}`);
            const mainPaidInput = document.getElementById(`slot-paid-${idx}`);

            console.log('[PAYMENT DEBUG] Amount input found:', !!amountInput, 'value:', amountInput?.value);
            console.log('[PAYMENT DEBUG] Main paid input found:', !!mainPaidInput, 'current value:', mainPaidInput?.value);

            if (amountInput && mainPaidInput) {
                const currentPaid = parseFloat(mainPaidInput.value) || 0;
                const newPayment = parseFloat(amountInput.value) || 0;

                console.log('[PAYMENT DEBUG] Current paid:', currentPaid, 'New payment:', newPayment);

                if (newPayment > 0) {
                    const newTotal = currentPaid + newPayment;
                    mainPaidInput.value = newTotal.toFixed(2);
                    total += newPayment;
                    paidPlayers.push(idx);
                    console.log('[PAYMENT DEBUG] Updated slot-paid-', idx, 'to:', newTotal.toFixed(2));
                }
            }
        });

        console.log('[PAYMENT DEBUG] Total paid:', total, 'Players paid:', paidPlayers);

        // Close payment modal
        this.closePaymentModal();

        if (total > 0) {
            alert(`✅ Pagamento di €${total.toFixed(2)} registrato come ${paymentMethod === 'contanti' ? 'Contanti' : paymentMethod === 'carta' ? 'Carta' : 'PayPal'}.\n\nGiocatori pagati: ${paidPlayers.length}\nRicordati di salvare la prenotazione!`);
        } else {
            alert('⚠️ Nessun importo da pagare.');
        }
    },

    renderPayPalButtons(totalAmount, description) {
        const container = document.getElementById('paypal-buttons-modal');
        if (!container) return;

        // Clear any existing buttons
        container.innerHTML = '';

        try {
            paypal.Buttons({
                style: {
                    layout: 'vertical',
                    color: 'gold',
                    shape: 'rect',
                    label: 'paypal'
                },
                createOrder: function (data, actions) {
                    return actions.order.create({
                        purchase_units: [{
                            description: description,
                            amount: {
                                currency_code: 'EUR',
                                value: totalAmount.toFixed(2)
                            }
                        }]
                    });
                },
                onApprove: function (data, actions) {
                    return actions.order.capture().then(function (orderData) {
                        console.log('PayPal payment captured:', orderData);

                        // Mark payments as paid in the form - ONLY for checked players
                        const checkboxes = document.querySelectorAll('.pay-player-checkbox:checked');
                        checkboxes.forEach(cb => {
                            const idx = cb.dataset.index;
                            const amountInput = document.getElementById(`pay-amount-${idx}`);
                            const paidInput = document.getElementById(`slot-paid-${idx}`);

                            if (amountInput && paidInput) {
                                const currentPaid = parseFloat(paidInput.value) || 0;
                                const newPayment = parseFloat(amountInput.value) || 0;
                                if (newPayment > 0) {
                                    paidInput.value = (currentPaid + newPayment).toFixed(2);
                                }
                            }
                        });

                        App.closePaymentModal();
                        alert('✅ Pagamento PayPal completato con successo!\n\nID Transazione: ' + orderData.id);
                    });
                },
                onError: function (err) {
                    console.error('PayPal error:', err);
                    alert('❌ Errore durante il pagamento PayPal. Riprova.');
                },
                onCancel: function () {
                    console.log('PayPal payment cancelled');
                }
            }).render('#paypal-buttons-modal');
        } catch (e) {
            console.error('Error rendering PayPal buttons:', e);
            container.innerHTML = `
                <div style="text-align: center; padding: 20px; color: #f87171;">
                    <p>⚠️ PayPal non disponibile</p>
                    <p style="font-size: 0.8rem; margin-top: 10px;">Assicurati di avere una connessione internet attiva.</p>
                </div>
            `;
        }
    },

    openStripePayment(amount, description) {
        // For now, we'll use a Stripe Payment Link simulation
        // In production, you would create a Stripe Checkout session via your backend
        // or use Stripe Payment Links

        const stripeConfig = Storage.load('stripe_config', null);

        if (stripeConfig && stripeConfig.paymentLink) {
            // If a Stripe Payment Link is configured, redirect to it
            const url = `${stripeConfig.paymentLink}?amount=${amount * 100}&description=${encodeURIComponent(description)}`;
            window.open(url, '_blank');
        } else {
            // Show instructions for setting up Stripe
            alert(`💳 Pagamento con Carta di Credito\n\nPer abilitare i pagamenti con carta:\n\n1. Crea un account Stripe (stripe.com)\n2. Crea un Payment Link nella dashboard\n3. Configura il link nelle impostazioni dell'app\n\nImporto da pagare: €${amount.toFixed(2)}\n\n📝 Per ora, registra manualmente il pagamento come "Pagato" nel form.`);
        }

        this.closePaymentModal();
    },

    closePaymentModal() {
        const modal = document.getElementById('payment-sub-modal');
        if (modal) {
            modal.remove();
        }
    },

    showAllPlayersInModal() {
        const players = Players.getAll() || [];
        const container = document.getElementById('modal-players-list');
        if (!container) return;

        container.innerHTML = players.map(p => `
            <div class="selection-item player-selection-item" 
                 onclick="const lab=document.getElementById('slot-label'); lab.value = lab.value ? lab.value + ', ' + '${p.name}' : '${p.name}';">
                <span>${p.name}</span>
                <span class="item-sub">${p.level}</span>
            </div>
        `).join('');
    },

    updateMatchingView() {
        const courts = Courts.getAvailable(this.currentSeason);
        const slotsContainer = document.getElementById('slots-list');

        slotsContainer.innerHTML = courts.map(c => `
            <div class="slot-item">
                🏟️ ${c.name} - ${Courts.formatSurface(c.surface)}
            </div>
        `).join('') || '<p class="empty-state">Nessun campo disponibile</p>';

        Matching.renderProposals(this.currentProposals);
    },

    filterPlayers() {
        const query = document.getElementById('player-search').value;
        const level = document.getElementById('level-filter').value;
        const players = Players.search(query, level);
        Players.renderTable(players); // Use the centralized render function
    },

    filterHistory() {
        const filters = {
            from: document.getElementById('history-from').value,
            to: document.getElementById('history-to').value,
            type: document.getElementById('history-type-filter').value
        };
        History.renderTable(filters);
    },

    generateMatches() {
        const date = document.getElementById('match-date').value;
        const type = document.getElementById('match-type-select').value;

        if (!date) {
            alert('Seleziona una data');
            return;
        }

        this.currentProposals = Matching.generateMatches(date, type);
        Matching.renderProposals(this.currentProposals);
    },

    generateWeeklyMatches() {
        const date = document.getElementById('match-date').value;
        const type = document.getElementById('match-type-select').value;
        if (!date) {
            alert('Seleziona una data di inizio');
            return;
        }
        this.currentProposals = Matching.generateWeeklyMatches(date, type);
        Matching.renderProposals(this.currentProposals);
    },

    confirmMatches() {
        if (this.currentProposals.length === 0) {
            alert('Nessun accoppiamento da confermare');
            return;
        }
        Matching.confirmMatches(this.currentProposals);
        alert(`${this.currentProposals.length} partite programmate!`);
        this.currentProposals = [];
        Matching.renderProposals([]);
        this.updateDashboard();
    },

    clearMatches() {
        this.currentProposals = [];
        Matching.renderProposals([]);
    },

    handleMatchAction(e) {
        const item = e.target.closest('.match-item');
        if (!item) return;
        const matchId = item.dataset.id;
        const match = this.currentProposals.find(m => m.id === matchId);

        if (e.target.classList.contains('send-match-wa')) {
            const playerNames = match.players.map(id => Players.getById(id)?.name || 'Sconosciuto');
            const court = Courts.getById(match.court);
            const dateObj = new Date(match.date);
            const formattedDate = dateObj.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });

            const message = `Ciao! 🎾 Saresti disponibile per un match il ${formattedDate} alle ${match.time} sul ${court?.name || 'campo TBD'}? Rispondi SÌ o NO.`;

            // Invia al primo giocatore per ora (l'admin può ripetere per gli altri)
            const firstPlayer = Players.getById(match.players[0]);
            this.openWhatsApp(firstPlayer?.phone, message);
        }
    },

    // Modal handlers
    showModal(title, body, footer = '') {
        document.getElementById('modal-title').textContent = title;
        document.getElementById('modal-body').innerHTML = body;
        document.getElementById('modal-footer').innerHTML = footer;
        document.getElementById('modal-overlay').classList.add('active');
    },

    closeModal() {
        document.getElementById('modal-overlay').classList.remove('active');
    },

    showPlayerModal(playerId = null) {
        const player = playerId ? Players.getById(playerId) : null;
        const title = player ? 'Modifica Giocatore' : 'Nuovo Giocatore';
        this.editingPlayerId = playerId;

        const body = `
            <form id="player-form">
                <div class="form-group">
                    <label>Nome Completo</label>
                    <input type="text" id="player-name" required value="${player?.name || ''}">
                </div>
                <div class="form-group">
                    <label>Telefono</label>
                    <input type="tel" id="player-phone" value="${player?.phone || ''}" placeholder="es. 347 1234567">
                </div>
                <div class="form-group">
                    <label>Livello</label>
                    <select id="player-level" required>
                        <option value="principiante" ${player?.level === 'principiante' ? 'selected' : ''}>Principiante</option>
                        <option value="intermedio" ${player?.level === 'intermedio' ? 'selected' : ''}>Intermedio</option>
                        <option value="avanzato" ${player?.level === 'avanzato' ? 'selected' : ''}>Avanzato</option>
                        <option value="agonista" ${player?.level === 'agonista' ? 'selected' : ''}>Agonista</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>N. partite desiderate a settimana</label>
                    <input type="number" id="matches-per-week" min="1" max="7" value="${player?.matchesPerWeek || 2}">
                </div>
                <div class="form-group">
                    <label>Tipo di Gioco</label>
                    <div class="checkbox-group">
                        <label class="checkbox-label">
                            <input type="checkbox" id="plays-singles" ${player?.playsSingles !== false ? 'checked' : ''}>
                            Singoli
                        </label>
                        <label class="checkbox-label">
                            <input type="checkbox" id="plays-doubles" ${player?.playsDoubles !== false ? 'checked' : ''}>
                            Doppi
                        </label>
                    </div>
                </div>
                <div class="form-group">
                    <label class="checkbox-label" style="font-size: 1rem;">
                        <input type="checkbox" id="is-member" ${player?.isMember ? 'checked' : ''}>
                        🏅 Socio del circolo
                    </label>
                </div>
                
                <!-- Sezione Disponibilità -->
                <div class="availability-section">
                    <h4>📅 Disponibilità Settimanali</h4>
                    <div class="availability-editor" id="availability-editor">
                        ${this.renderAvailabilityDays(player?.availability?.recurring || [])}
                    </div>
                    
                    <h4 style="margin-top: 20px;">📆 Disponibilità Extra</h4>
                    <div id="extra-availability-list">
                        ${this.renderExtraAvailability(player?.availability?.extra || [])}
                    </div>
                    <button type="button" class="btn btn-secondary btn-sm" onclick="App.showAddExtraModal()">
                        + Aggiungi Disponibilità Extra
                    </button>
                </div>
                
                ${this.renderPreferencesEditor(player)}
            </form>
        `;

        const footer = `
            <button class="btn btn-secondary" onclick="App.closeModal()">Annulla</button>
            <button class="btn btn-primary" onclick="App.savePlayer('${playerId || ''}')">Salva</button>
        `;

        this.showModal(title, body, footer);
        this.bindAvailabilityEvents();
    },

    renderAvailabilityDays(recurring) {
        const days = [
            { key: 'lunedi', label: 'Lunedì' },
            { key: 'martedi', label: 'Martedì' },
            { key: 'mercoledi', label: 'Mercoledì' },
            { key: 'giovedi', label: 'Giovedì' },
            { key: 'venerdi', label: 'Venerdì' },
            { key: 'sabato', label: 'Sabato' },
            { key: 'domenica', label: 'Domenica' }
        ];

        return days.map(day => {
            const daySlots = recurring.filter(r => r.day === day.key);
            return `
                <div class="availability-day" data-day="${day.key}">
                    <span class="day-name">${day.label}</span>
                    <div class="time-slots">
                        ${daySlots.map((slot, idx) => `
                            <div class="time-slot" data-index="${idx}">
                                <span>${slot.from} - ${slot.to}</span>
                                <button type="button" class="remove-slot" onclick="App.removeTimeSlot('${day.key}', ${idx})">×</button>
                            </div>
                        `).join('')}
                        <button type="button" class="add-slot-btn" onclick="App.showAddSlotModal('${day.key}')">+ Aggiungi</button>
                    </div>
                </div>
            `;
        }).join('');
    },

    renderExtraAvailability(extra) {
        if (!extra || extra.length === 0) {
            return '<p class="empty-state" style="padding: 10px;">Nessuna disponibilità extra</p>';
        }
        return extra.map((e, idx) => `
            <div class="time-slot" data-extra-index="${idx}">
                <span>📆 ${e.date}: ${e.from} - ${e.to}</span>
                <button type="button" class="remove-slot" onclick="App.removeExtraSlot(${idx})">×</button>
            </div>
        `).join('');
    },

    tempAvailability: { recurring: [], extra: [] },

    bindAvailabilityEvents() {
        // Inizializza disponibilità temporanea dal giocatore corrente
        if (this.editingPlayerId) {
            const player = Players.getById(this.editingPlayerId);
            this.tempAvailability = JSON.parse(JSON.stringify(player?.availability || { recurring: [], extra: [] }));
        } else {
            this.tempAvailability = { recurring: [], extra: [] };
        }
    },

    showAddSlotModal(day) {
        const dayLabels = {
            'lunedi': 'Lunedì', 'martedi': 'Martedì', 'mercoledi': 'Mercoledì',
            'giovedi': 'Giovedì', 'venerdi': 'Venerdì', 'sabato': 'Sabato', 'domenica': 'Domenica'
        };

        const hoursOptions = Array.from({ length: 15 }, (_, i) => i + 8)
            .map(h => `<option value="${String(h).padStart(2, '0')}">${String(h).padStart(2, '0')}</option>`)
            .join('');

        const innerBody = `
            <div class="form-group">
                <label>Giorno: <strong>${dayLabels[day]}</strong></label>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Dalle</label>
                    <div style="display: flex; gap: 8px; align-items: center;">
                        <select id="slot-from-hour" class="filter-select">${hoursOptions}</select>
                        <span>:</span>
                        <select id="slot-from-min" class="filter-select">
                            <option value="00">00</option>
                            <option value="30">30</option>
                        </select>
                    </div>
                </div>
                <div class="form-group">
                    <label>Alle</label>
                    <div style="display: flex; gap: 8px; align-items: center;">
                        <select id="slot-to-hour" class="filter-select">
                            ${Array.from({ length: 15 }, (_, i) => i + 8)
                .map(h => `<option value="${String(h).padStart(2, '0')}" ${h === 10 ? 'selected' : ''}>${String(h).padStart(2, '0')}</option>`)
                .join('')}
                        </select>
                        <span>:</span>
                        <select id="slot-to-min" class="filter-select">
                            <option value="00">00</option>
                            <option value="30">30</option>
                        </select>
                    </div>
                </div>
            </div>
        `;

        const subModal = document.createElement('div');
        subModal.id = 'sub-modal-overlay';
        subModal.className = 'modal-overlay active';
        subModal.innerHTML = `
            <div class="modal" style="max-width: 400px;">
                <div class="modal-header">
                    <h3>Aggiungi Fascia Oraria</h3>
                    <button class="modal-close" onclick="App.closeSubModal()">×</button>
                </div>
                <div class="modal-body">${innerBody}</div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" onclick="App.closeSubModal()">Annulla</button>
                    <button class="btn btn-primary" onclick="App.confirmAddSlot('${day}')">Aggiungi</button>
                </div>
            </div>
        `;
        document.body.appendChild(subModal);
    },

    closeSubModal() {
        const subModal = document.getElementById('sub-modal-overlay');
        if (subModal) subModal.remove();
    },

    confirmAddSlot(day) {
        const fromHour = document.getElementById('slot-from-hour').value;
        const fromMin = document.getElementById('slot-from-min').value;
        const toHour = document.getElementById('slot-to-hour').value;
        const toMin = document.getElementById('slot-to-min').value;

        const from = `${fromHour}:${fromMin}`;
        const to = `${toHour}:${toMin}`;

        if (from >= to) {
            alert('L\'orario di fine deve essere successivo a quello di inizio');
            return;
        }

        this.tempAvailability.recurring.push({ day, from, to });
        this.closeSubModal();
        this.refreshAvailabilityUI();
    },

    removeTimeSlot(day, index) {
        const daySlots = this.tempAvailability.recurring.filter(r => r.day === day);
        const slotToRemove = daySlots[index];
        const actualIndex = this.tempAvailability.recurring.findIndex(r =>
            r.day === slotToRemove.day && r.from === slotToRemove.from && r.to === slotToRemove.to
        );
        if (actualIndex !== -1) {
            this.tempAvailability.recurring.splice(actualIndex, 1);
            this.refreshAvailabilityUI();
        }
    },

    showAddExtraModal() {
        const today = new Date().toISOString().split('T')[0];
        const hoursOptions = Array.from({ length: 15 }, (_, i) => i + 8)
            .map(h => `<option value="${String(h).padStart(2, '0')}">${String(h).padStart(2, '0')}</option>`)
            .join('');

        const innerBody = `
            <div class="form-group">
                <label>Data</label>
                <input type="date" id="extra-date" value="${today}">
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Dalle</label>
                    <div style="display: flex; gap: 8px; align-items: center;">
                        <select id="extra-from-hour" class="filter-select">${hoursOptions}</select>
                        <span>:</span>
                        <select id="extra-from-min" class="filter-select">
                            <option value="00">00</option>
                            <option value="30">30</option>
                        </select>
                    </div>
                </div>
                <div class="form-group">
                    <label>Alle</label>
                    <div style="display: flex; gap: 8px; align-items: center;">
                        <select id="extra-to-hour" class="filter-select">
                            ${Array.from({ length: 15 }, (_, i) => i + 8)
                .map(h => `<option value="${String(h).padStart(2, '0')}" ${h === 10 ? 'selected' : ''}>${String(h).padStart(2, '0')}</option>`)
                .join('')}
                        </select>
                        <span>:</span>
                        <select id="extra-to-min" class="filter-select">
                            <option value="00">00</option>
                            <option value="30">30</option>
                        </select>
                    </div>
                </div>
            </div>
        `;

        const subModal = document.createElement('div');
        subModal.id = 'sub-modal-overlay';
        subModal.className = 'modal-overlay active';
        subModal.innerHTML = `
            <div class="modal" style="max-width: 400px;">
                <div class="modal-header">
                    <h3>Aggiungi Disponibilità Extra</h3>
                    <button class="modal-close" onclick="App.closeSubModal()">×</button>
                </div>
                <div class="modal-body">${innerBody}</div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" onclick="App.closeSubModal()">Annulla</button>
                    <button class="btn btn-primary" onclick="App.confirmAddExtra()">Aggiungi</button>
                </div>
            </div>
        `;
        document.body.appendChild(subModal);
    },

    confirmAddExtra() {
        const date = document.getElementById('extra-date').value;
        const fromHour = document.getElementById('extra-from-hour').value;
        const fromMin = document.getElementById('extra-from-min').value;
        const toHour = document.getElementById('extra-to-hour').value;
        const toMin = document.getElementById('extra-to-min').value;

        const from = `${fromHour}:${fromMin}`;
        const to = `${toHour}:${toMin}`;

        if (!date) {
            alert('Seleziona una data');
            return;
        }
        if (from >= to) {
            alert('L\'orario di fine deve essere successivo a quello di inizio');
            return;
        }

        this.tempAvailability.extra.push({ date, from, to });
        this.closeSubModal();
        this.refreshAvailabilityUI();
    },

    removeExtraSlot(index) {
        this.tempAvailability.extra.splice(index, 1);
        this.refreshAvailabilityUI();
    },

    refreshAvailabilityUI() {
        document.getElementById('availability-editor').innerHTML = this.renderAvailabilityDays(this.tempAvailability.recurring);
        document.getElementById('extra-availability-list').innerHTML = this.renderExtraAvailability(this.tempAvailability.extra);
    },

    renderPreferencesEditor(player) {
        const otherPlayers = Players.getAll().filter(p => !player || p.id !== player.id);
        if (otherPlayers.length === 0) return '';

        const preferred = player?.preferredPlayers || [];
        const avoid = player?.avoidPlayers || [];

        return `
            <div class="preferences-section" style="margin-top: 24px;">
                <div class="form-group">
                    <label>🔍 Cerca Giocatori nelle liste sotto</label>
                    <input type="text" placeholder="Filtra giocatori..." oninput="App.filterPreferenceLists(this.value)">
                </div>

                <div class="form-row">
                    <div class="form-group">
                        <label>💚 Vuole giocare con:</label>
                        <div class="checkbox-list scrollable-list" id="preferred-list">
                            ${otherPlayers.map(p => `
                                <label class="checkbox-label preference-item" data-name="${p.name.toLowerCase()}">
                                    <input type="checkbox" name="preferred" value="${p.id}" ${preferred.includes(p.id) ? 'checked' : ''} onchange="App.handlePreferenceChange(this, 'preferred')">
                                    ${p.name}
                                </label>
                            `).join('')}
                        </div>
                    </div>
                    <div class="form-group">
                        <label>🚫 NON vuole giocare con:</label>
                        <div class="checkbox-list scrollable-list" id="avoid-list">
                            ${otherPlayers.map(p => `
                                <label class="checkbox-label preference-item" data-name="${p.name.toLowerCase()}">
                                    <input type="checkbox" name="avoid" value="${p.id}" ${avoid.includes(p.id) ? 'checked' : ''} onchange="App.handlePreferenceChange(this, 'avoid')">
                                    ${p.name}
                                </label>
                            `).join('')}
                        </div>
                    </div>
                </div>
            </div>
            
            <style>
                .scrollable-list {
                    max-height: 200px;
                    overflow-y: auto;
                    background: var(--bg-card-hover);
                    padding: 8px;
                    border-radius: var(--radius-sm);
                    border: 1px solid rgba(255,255,255,0.1);
                }
                .preference-item {
                    padding: 4px 0;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    font-size: 0.9rem;
                }
                .preference-item:hover {
                    background: rgba(255,255,255,0.05);
                }
            </style>
        `;
    },

    filterPreferenceLists(query) {
        const q = query.toLowerCase();
        document.querySelectorAll('.preference-item').forEach(item => {
            const name = item.dataset.name;
            item.style.display = name.includes(q) ? 'flex' : 'none';
        });
    },

    // Mutua esclusione: se selezioni in "preferred", deseleziona in "avoid" e viceversa
    handlePreferenceChange(checkbox, type) {
        if (!checkbox.checked) return; // Solo quando viene selezionato

        const playerId = checkbox.value;
        const oppositeType = type === 'preferred' ? 'avoid' : 'preferred';

        // Trova e deseleziona il checkbox opposto per lo stesso giocatore
        const oppositeCheckbox = document.querySelector(`input[name="${oppositeType}"][value="${playerId}"]`);
        if (oppositeCheckbox && oppositeCheckbox.checked) {
            oppositeCheckbox.checked = false;
            console.log(`🔄 Rimosso ${playerId} da ${oppositeType} (mutua esclusione)`);
        }
    },

    savePlayer(playerId) {
        const name = document.getElementById('player-name').value.trim();
        const phone = document.getElementById('player-phone').value.trim();
        const level = document.getElementById('player-level').value;
        const playsSingles = document.getElementById('plays-singles').checked;
        const playsDoubles = document.getElementById('plays-doubles').checked;
        const matchesPerWeek = parseInt(document.getElementById('matches-per-week').value) || 2;
        const availability = this.tempAvailability;

        const preferredPlayers = Array.from(document.querySelectorAll('input[name="preferred"]:checked')).map(el => el.value);
        const avoidPlayers = Array.from(document.querySelectorAll('input[name="avoid"]:checked')).map(el => el.value);

        // Debug: mostra cosa è stato letto
        console.log('🔍 [DEBUG] preferredPlayers checkboxes found:', document.querySelectorAll('input[name="preferred"]:checked').length);
        console.log('🔍 [DEBUG] avoidPlayers checkboxes found:', document.querySelectorAll('input[name="avoid"]:checked').length);
        console.log('🔍 [DEBUG] preferredPlayers values:', preferredPlayers);
        console.log('🔍 [DEBUG] avoidPlayers values:', avoidPlayers);

        if (!name) {
            alert('Inserisci il nome del giocatore');
            return;
        }

        const isMember = document.getElementById('is-member').checked;

        if (playerId) {
            console.log('📝 [SAVE] Updating existing player:', playerId);
            Players.update(playerId, { name, phone, level, playsSingles, playsDoubles, matchesPerWeek, availability, preferredPlayers, avoidPlayers, isMember });
        } else {
            console.log('📝 [SAVE] Creating new player');
            // Pass all data in one call to ensure single Firebase sync
            Players.add({ name, phone, level, playsSingles, playsDoubles, matchesPerWeek, availability, preferredPlayers, avoidPlayers, isMember });
        }

        // Rimosso explicit save che causava race condition

        this.closeModal();
        Players.renderTable();
        this.updateDashboard();
    },

    showRelationsModal(playerId) {
        try {
            const player = Players.getById(playerId);
            if (!player) {
                console.error('ShowRelationsModal: Player not found for ID', playerId);
                return;
            }

            // Defensive check for Players.getAll()
            const allPlayersRaw = Players.getAll();
            if (!Array.isArray(allPlayersRaw)) {
                console.error('ShowRelationsModal: Players.getAll() returned non-array', allPlayersRaw);
                alert('Errore interno: impossibile recuperare la lista giocatori.');
                return;
            }

            const allPlayers = allPlayersRaw.filter(p => p.id !== playerId).sort((a, b) => {
                const nameA = a.name || '';
                const nameB = b.name || '';
                return nameA.localeCompare(nameB);
            });

            const renderList = (type, title, colorClass) => {
                const listIds = type === 'preferred'
                    ? (player.preferredPlayers || [])
                    : (player.avoidPlayers || []);

                // Filter players that are in the list
                const relevantPlayers = allPlayers.filter(p => listIds.includes(p.id));

                let listHtml = '';
                if (relevantPlayers.length === 0) {
                    listHtml = '<div style="color: #888; padding: 10px; font-style: italic;">Nessun giocatore</div>';
                } else {
                    listHtml = relevantPlayers.map(p => `
                    <div class="relation-item" style="padding: 10px; border-bottom: 1px solid rgba(255,255,255,0.1);">
                        <span style="color: #eee;">${(p.name || 'Senza nome')}</span>
                    </div>
                `).join('');
                }

                return `
                <div class="relation-column" style="flex:1; min-width:300px; background:rgba(0,0,0,0.2); padding:15px; border-radius:12px; border:1px solid rgba(255,255,255,0.05); height:100%; display:flex; flex-direction:column;">
                    <h4 style="color:${colorClass}; margin-bottom:15px; font-size:1.1rem; border-bottom:1px solid ${colorClass}40; padding-bottom:10px;">
                        ${title}
                    </h4>
                    <div style="flex:1; overflow-y:auto; padding-right:5px; max-height:400px;">${listHtml}</div>
                </div>
            `;
            };

            const modalBody = `
            <div style="display:flex; flex-wrap:wrap; gap:20px; align-items:stretch; max-height:70vh; overflow-y:auto;">
                ${renderList('preferred', '💚 Preferiti (Vuole giocare)', '#22c55e')}
                ${renderList('avoid', '🚫 Veti (Non vuole giocare)', '#ef4444')}
            </div>
            <p style="font-size:0.85rem; color:#a0aec0; margin-top:15px; text-align:center; font-style:italic;">
                Modalità sola lettura. Per modificare queste liste, usa la funzione "Modifica" sul giocatore.
            </p>
        `;

            this.openModal(`Relazioni: ${player.name}`, modalBody);
        } catch (error) {
            console.error('Error in showRelationsModal:', error);
            alert('Si è verificato un errore durante l\'apertura delle relazioni. Dettaglio: ' + error.message);
        }
    },

    handlePlayerAction(e) {
        const row = e.target.closest('tr');
        if (!row) return;
        const playerId = row.dataset.id;
        const player = Players.getById(playerId);

        // Handle button clicks inside the row
        const target = e.target.closest('button');
        if (!target) return;

        if (target.classList.contains('send-wa')) {
            const message = `Ciao ${player.name}! 🎾 Sei disponibile per giocare questa settimana? Rispondi SÌ o NO.`;
            this.openWhatsApp(player.phone, message);
        } else if (target.classList.contains('edit-player')) {
            this.showPlayerModal(playerId);
        } else if (target.classList.contains('delete-player')) {
            if (confirm('Eliminare questo giocatore?')) {
                Players.delete(playerId);
                Players.renderTable();
                this.updateDashboard();
            }
        } else if (target.classList.contains('view-relations')) {
            this.showRelationsModal(playerId);
        }
    },

    showCourtModal(courtId = null) {
        const court = courtId ? Courts.getById(courtId) : null;
        const title = court ? 'Modifica Campo' : 'Nuovo Campo';

        const body = `
            <form id="court-form">
                <div class="form-group">
                    <label>Nome Campo</label>
                    <input type="text" id="court-name" required value="${court?.name || ''}">
                </div>
                <div class="form-group">
                    <label>Stagione</label>
                    <select id="court-type" required>
                        <option value="winter" ${court?.type === 'winter' ? 'selected' : ''}>Viserba</option>
                        <option value="summer" ${court?.type === 'summer' ? 'selected' : ''}>Rivabella</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Superficie</label>
                    <select id="court-surface" required>
                        <option value="terra-rossa" ${court?.surface === 'terra-rossa' ? 'selected' : ''}>Terra Rossa</option>
                        <option value="cemento" ${court?.surface === 'cemento' ? 'selected' : ''}>Cemento</option>
                        <option value="sintetico" ${court?.surface === 'sintetico' ? 'selected' : ''}>Sintetico</option>
                        <option value="erba" ${court?.surface === 'erba' ? 'selected' : ''}>Erba</option>
                    </select>
                </div>
                <div class="form-group">
                    <label class="checkbox-label">
                        <input type="checkbox" id="court-winter-cover" ${court?.winterCover ? 'checked' : ''}>
                        ❄️ Coperto in inverno
                    </label>
                </div>
            </form>
        `;

        const footer = `
            <button class="btn btn-secondary" onclick="App.closeModal()">Annulla</button>
            <button class="btn btn-primary" onclick="App.saveCourt('${courtId || ''}')">Salva</button>
        `;

        this.showModal(title, body, footer);
    },

    saveCourt(courtId) {
        const name = document.getElementById('court-name').value.trim();
        const type = document.getElementById('court-type').value;
        const surface = document.getElementById('court-surface').value;
        const winterCover = document.getElementById('court-winter-cover').checked;

        if (!name) {
            alert('Inserisci il nome del campo');
            return;
        }

        if (courtId) {
            Courts.update(courtId, { name, type, surface, winterCover });
        } else {
            Courts.add({ name, type, surface, winterCover });
        }

        this.closeModal();
        Courts.renderGrid(this.currentSeason);
        this.updateDashboard();
    },

    handleCourtAction(e) {
        const card = e.target.closest('.court-card');
        if (!card) return;
        const courtId = card.dataset.id;

        if (e.target.classList.contains('edit-court')) {
            this.showCourtModal(courtId);
        } else if (e.target.classList.contains('delete-court')) {
            if (confirm('Eliminare questo campo?')) {
                Courts.delete(courtId);
                Courts.renderGrid(this.currentSeason);
                this.updateDashboard();
            }
        }
    },

    showReservationsModal(courtId) {
        const court = Courts.getById(courtId);
        if (!court) return;

        const reservations = court.reservations || [];
        const days = [
            { key: 'lunedi', label: 'Lunedì' }, { key: 'martedi', label: 'Martedì' },
            { key: 'mercoledi', label: 'Mercoledì' }, { key: 'giovedi', label: 'Giovedì' },
            { key: 'venerdi', label: 'Venerdì' }, { key: 'sabato', label: 'Sabato' },
            { key: 'domenica', label: 'Domenica' }
        ];

        const hoursOptions = Array.from({ length: 15 }, (_, i) => i + 8)
            .map(h => `<option value="${String(h).padStart(2, '0')}">${String(h).padStart(2, '0')}</option>`)
            .join('');

        const body = `
            <div class="reservations-manager">
                <p style="margin-bottom: 15px; font-size: 0.9rem; opacity: 0.8;">
                    Inserisci le ore in cui il campo è occupato da **abbonati fisici, lezioni o manutenzione**. 
                    L'algoritmo userà solo le ore rimanenti.
                </p>
                
                <div style="background: var(--bg-card-hover); padding: 12px; border-radius: var(--radius-md); margin-bottom: 20px;">
                    <div class="form-row" style="margin-bottom: 10px;">
                        <div class="form-group">
                            <label>Giorno</label>
                            <select id="res-day" class="filter-select">
                                ${days.map(d => `<option value="${d.key}">${d.label}</option>`).join('')}
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Dalle</label>
                            <div style="display: flex; gap: 4px; align-items: center;">
                                <select id="res-from-h" class="filter-select">${hoursOptions}</select>
                                <select id="res-from-m" class="filter-select"><option>00</option><option>30</option></select>
                            </div>
                        </div>
                        <div class="form-group">
                            <label>Alle</label>
                            <div style="display: flex; gap: 4px; align-items: center;">
                                <select id="res-to-h" class="filter-select">${hoursOptions}</select>
                                <select id="res-to-m" class="filter-select"><option>00</option><option>30</option></select>
                            </div>
                        </div>
                    </div>
                    <button class="btn btn-primary btn-sm" style="width: 100%;" onclick="App.confirmAddCourtReservation('${courtId}')">
                        + Aggiungi Blocco Orario
                    </button>
                </div>

                <div class="reservations-list">
                    <h4>Ore Occupate (Fisse)</h4>
                    ${reservations.length === 0 ? '<p class="empty-state">Nessun blocco orario configurato</p>' : `
                        <div class="table-responsive">
                            <table class="data-table" style="font-size: 0.85rem;">
                                <thead>
                                    <tr><th>Giorno</th><th>Orario</th><th>Azione</th></tr>
                                </thead>
                                <tbody>
                                    ${reservations.sort((a, b) => a.day.localeCompare(b.day)).map((r, idx) => `
                                        <tr>
                                            <td>${days.find(d => d.key === r.day)?.label}</td>
                                            <td>${r.from} - ${r.to}</td>
                                            <td>
                                                <button class="btn btn-sm btn-danger" onclick="App.removeCourtReservation('${courtId}', ${idx})">🗑️</button>
                                            </td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    `}
                </div>
            </div>
        `;

        this.showModal(`Gestione Ore - ${court.name}`, body, '<button class="btn btn-secondary" onclick="App.closeModal()">Esci</button>');
    },

    confirmAddCourtReservation(courtId) {
        const day = document.getElementById('res-day').value;
        const from = `${document.getElementById('res-from-h').value}:${document.getElementById('res-from-m').value}`;
        const to = `${document.getElementById('res-to-h').value}:${document.getElementById('res-to-m').value}`;

        if (from >= to) {
            alert('L\'orario di fine deve essere successivo a quello di inizio');
            return;
        }

        if (Courts.addReservation(courtId, { day, from, to })) {
            this.showReservationsModal(courtId);
            Courts.renderGrid(this.currentSeason);
        }
    },

    removeCourtReservation(courtId, index) {
        if (confirm('Rimuovere questo blocco orario?')) {
            if (Courts.removeReservation(courtId, index)) {
                this.showReservationsModal(courtId);
                Courts.renderGrid(this.currentSeason);
            }
        }
    },

    handleHistoryAction(e) {
        const row = e.target.closest('tr');
        if (!row) return;
        const matchId = row.dataset.id;

        if (e.target.classList.contains('edit-match')) {
            this.showMatchResultModal(matchId);
        } else if (e.target.classList.contains('delete-match')) {
            if (confirm('Eliminare questa partita dallo storico?')) {
                History.delete(matchId);
                if (this.currentTab === 'history') {
                    History.renderTable();
                } else if (this.currentTab === 'planning') {
                    this.renderPlanning();
                }
                this.updateDashboard();
            }
        }
    },

    showMatchResultModal(matchId) {
        const match = History.getAll().find(m => m.id === matchId);
        if (!match) return;

        const body = `
            <form id="result-form">
                <div class="form-group">
                    <label>Risultato</label>
                    <input type="text" id="match-result" placeholder="es. 6-4 6-3" value="${match.result || ''}">
                </div>
                <div class="form-group">
                    <label>Feedback (1-5 stelle)</label>
                    <div class="feedback-stars" id="feedback-input">
                        ${[1, 2, 3, 4, 5].map(n => `
                            <span class="star ${n <= (match.feedback || 0) ? 'filled' : 'empty'}" data-value="${n}">
                                ${n <= (match.feedback || 0) ? '⭐' : '☆'}
                            </span>
                        `).join('')}
                    </div>
                    <input type="hidden" id="match-feedback" value="${match.feedback || 0}">
                </div>
            </form>
        `;

        const footer = `
            <button class="btn btn-secondary" onclick="App.closeModal()">Annulla</button>
            <button class="btn btn-primary" onclick="App.saveMatchResult('${matchId}')">Salva</button>
        `;

        this.showModal('Aggiorna Partita', body, footer);

        // Bind star clicks
        document.querySelectorAll('#feedback-input .star').forEach(star => {
            star.addEventListener('click', () => {
                const value = parseInt(star.dataset.value);
                document.getElementById('match-feedback').value = value;
                document.querySelectorAll('#feedback-input .star').forEach((s, i) => {
                    s.className = `star ${i < value ? 'filled' : 'empty'}`;
                    s.textContent = i < value ? '⭐' : '☆';
                });
            });
        });
    },

    saveMatchResult(matchId) {
        const result = document.getElementById('match-result').value;
        const feedback = parseInt(document.getElementById('match-feedback').value);

        History.update(matchId, { result, feedback });
        this.closeModal();
        History.renderTable();
    },

    // ============ RECURRING PLANNING ============
    recurringTemplate: {}, // Temporary storage for recurring activities

    renderRecurringPlanning() {
        const container = document.getElementById('recurring-flex-container');
        console.log('[RECURRING] Container found:', !!container);
        if (!container) return;

        const courts = Courts.getAvailable(this.currentSeason);
        console.log('[RECURRING] Courts available:', courts?.length, 'Season:', this.currentSeason);

        if (!courts || courts.length === 0) {
            container.innerHTML = '<p style="padding: 20px; text-align: center; color: #666;">Nessun campo disponibile per questa stagione. Vai alla sezione Campi per aggiungerne.</p>';
            return;
        }

        const defaultTimes = ['08.30', '09.30', '10.30', '11.30', '12.30', '13.30', '14.30', '15.30', '16.30', '17.30', '18.30', '19.30', '20.30', '21.30', '22.30'];

        // Load custom recurring times per court
        const recurringTimeTemplates = Storage.load('recurring_time_templates', {});

        // Build horizontal table: courts as rows, each with its own time headers (same as planning)
        let tableHtml = `
            <table class="planning-horizontal-table">
                <tbody>
        `;

        courts.forEach(court => {
            const times = recurringTimeTemplates[court.id] || [...defaultTimes];

            // Riga orari editabili per questo campo
            tableHtml += `
                <tr class="court-time-row">
                    <td class="court-name-cell" style="font-size:0.6rem; background:#d0d0d0;">⏰ Orari</td>
                    ${times.map((time, index) => `
                        <td class="time-edit-cell" style="padding:0;">
                            <input type="text" 
                                   class="time-input" 
                                   value="${time}" 
                                   data-court="${court.id}" 
                                   data-index="${index}"
                                   style="width:100%; border:none; text-align:center; font-size:0.6rem; padding:2px; background:transparent;"
                                   onchange="App.handleRecurringTimeChange(event)"
                                   onclick="this.select()">
                        </td>
                    `).join('')}
                </tr>
            `;

            // Riga attività
            tableHtml += `<tr><td class="court-name-cell">${court.name}</td>`;

            times.forEach((time, index) => {
                const standardizedTime = time.replace('.', ':');
                const key = `${court.id}_${standardizedTime}`;
                const activity = this.recurringTemplate ? this.recurringTemplate[key] : null;

                let statusClass = activity ? `activity-${activity.type}` : 'activity-free';
                let label = activity ? activity.label : '';
                let playersHtml = '';

                // Show players if present
                if (activity?.players && activity.players.some(p => p && p.trim())) {
                    const filledPlayers = activity.players.filter(p => p && p.trim());
                    if (filledPlayers.length === 1) {
                        playersHtml = `<span class="cell-label">${filledPlayers[0]}</span>`;
                    } else if (filledPlayers.length === 2) {
                        playersHtml = `
                            <div class="cell-players-vertical">
                                <span class="cell-player-single">${filledPlayers[0]}</span>
                                <span class="cell-player-single">${filledPlayers[1]}</span>
                            </div>`;
                    } else {
                        playersHtml = `
                            <div class="cell-players-grid">
                                <span class="cell-player">${activity.players[0] || ''}</span>
                                <span class="cell-player">${activity.players[1] || ''}</span>
                                <span class="cell-player">${activity.players[2] || ''}</span>
                                <span class="cell-player">${activity.players[3] || ''}</span>
                            </div>`;
                    }
                } else if (label) {
                    playersHtml = `<span class="cell-label">${label}</span>`;
                }

                tableHtml += `
                    <td class="planning-cell">
                        <div class="planning-activity-cell recurring-cell ${statusClass}" 
                             data-court="${court.id}" data-time="${standardizedTime}" data-index="${index}">
                            ${playersHtml}
                        </div>
                    </td>
                `;
            });

            tableHtml += `</tr>`;
        });

        tableHtml += `</tbody></table>`;
        container.innerHTML = tableHtml;

        // Bind click events
        container.querySelectorAll('.recurring-cell').forEach(cell => {
            cell.addEventListener('click', (e) => this.handleRecurringCellClick(e));
        });

        // Set default dates
        const startInput = document.getElementById('recurring-start-date');
        const endInput = document.getElementById('recurring-end-date');
        if (startInput && !startInput.value) {
            const today = new Date();
            startInput.value = today.toISOString().split('T')[0];
        }
        if (endInput && !endInput.value) {
            const threeMonths = new Date();
            threeMonths.setMonth(threeMonths.getMonth() + 3);
            endInput.value = threeMonths.toISOString().split('T')[0];
        }

        // Also render mobile version
        this.populateRecurringMobileCourtSelector();
        this.renderRecurringMobilePlanning();
    },

    // Populate the mobile court selector for recurring planning
    populateRecurringMobileCourtSelector() {
        try {
            const select = document.getElementById('recurring-mobile-court-select');
            if (!select) return;

            const courts = Courts.getAvailable(this.currentSeason) || [];
            if (courts.length === 0) {
                select.innerHTML = '<option value="">Nessun campo</option>';
                return;
            }

            const currentValue = select.value;
            select.innerHTML = '';
            courts.forEach((court, index) => {
                const option = document.createElement('option');
                option.value = court.id;
                option.textContent = court.name;
                if (court.id === currentValue || (index === 0 && !currentValue)) {
                    option.selected = true;
                }
                select.appendChild(option);
            });
        } catch (e) {
            console.error('[RECURRING MOBILE] Error in populateRecurringMobileCourtSelector:', e);
        }
    },

    // Render mobile vertical table for recurring planning
    renderRecurringMobilePlanning() {
        try {
            const mobileTable = document.getElementById('recurring-mobile-planning-table');
            const select = document.getElementById('recurring-mobile-court-select');
            if (!mobileTable || !select) return;

            const courts = Courts.getAvailable(this.currentSeason) || [];
            const selectedCourtId = select.value;
            const court = courts.find(c => c.id === selectedCourtId) || courts[0];

            if (!court) {
                mobileTable.innerHTML = '<tbody><tr><td colspan="2" style="padding:20px;text-align:center;">Nessun campo disponibile.</td></tr></tbody>';
                return;
            }

            const defaultTimes = ['08.30', '09.30', '10.30', '11.30', '12.30', '13.30', '14.30', '15.30', '16.30', '17.30', '18.30', '19.30', '20.30', '21.30', '22.30'];
            const recurringTimeTemplates = Storage.load('recurring_time_templates', {});
            const times = recurringTimeTemplates[court.id] || defaultTimes;

            let tableHtml = '<colgroup><col style="width:75px"><col style="width:auto"></colgroup>';
            tableHtml += '<tbody>';
            tableHtml += '<tr><th colspan="2" style="background:#2d8a4e;color:#fff;font-size:1.1rem;padding:12px;">' + court.name + '</th></tr>';

            for (let t = 0; t < times.length; t++) {
                const time = times[t];
                const standardizedTime = time.replace('.', ':');
                const key = `${court.id}_${standardizedTime}`;
                const activity = this.recurringTemplate ? this.recurringTemplate[key] : null;

                let cellClass = activity ? `activity-${activity.type}` : 'activity-free';
                let cellContent = '-';

                if (activity) {
                    if (activity.players && activity.players.some(p => p && p.trim())) {
                        cellContent = activity.players.filter(p => p && p.trim()).join('<br>');
                    } else if (activity.label) {
                        cellContent = activity.label;
                    }
                }

                tableHtml += '<tr>';
                tableHtml += '<td class="time-column recurring-mobile-time-editable" data-court="' + court.id + '" data-index="' + t + '">' + time + '</td>';
                tableHtml += '<td class="activity-cell recurring-cell ' + cellClass + '" data-court="' + court.id + '" data-time="' + standardizedTime + '" data-index="' + t + '">' + cellContent + '</td>';
                tableHtml += '</tr>';
            }

            tableHtml += '</tbody>';
            mobileTable.innerHTML = tableHtml;

            // Bind click events for mobile recurring cells
            mobileTable.querySelectorAll('.recurring-cell').forEach(cell => {
                cell.addEventListener('click', (e) => this.handleRecurringCellClick(e));
            });

            // Bind click events for mobile recurring time cells (edit time on tap)
            mobileTable.querySelectorAll('.recurring-mobile-time-editable').forEach(cell => {
                cell.addEventListener('click', (e) => this.showRecurringMobileTimeEditModal(e));
            });
        } catch (e) {
            console.error('[RECURRING MOBILE] Error in renderRecurringMobilePlanning:', e);
        }
    },

    // Handle time change for recurring planning (PC)
    handleRecurringTimeChange(e) {
        // Block editing if not admin
        if (!window.isAdmin) {
            alert('⚠️ Modalità sola lettura. Accedi come admin per modificare.');
            this.renderRecurringPlanning(); // Restore original value
            return;
        }

        const courtId = e.target.dataset.court;
        const index = parseInt(e.target.dataset.index);
        const newTime = e.target.value;

        const recurringTimeTemplates = Storage.load('recurring_time_templates', {});
        if (!recurringTimeTemplates[courtId]) {
            // Initial default if not exists
            recurringTimeTemplates[courtId] = ['08.30', '09.30', '10.30', '11.30', '12.30', '13.30', '14.30', '15.30', '16.30', '17.30', '18.30', '19.30', '20.30', '21.30', '22.30'];
        }

        recurringTimeTemplates[courtId][index] = newTime;
        Storage.save('recurring_time_templates', recurringTimeTemplates);
        this.renderRecurringPlanning();
    },

    // Modal semplificato per modificare l'orario di una cella da mobile (Ricorrente)
    showRecurringMobileTimeEditModal(e) {
        // Block editing if not admin
        if (!window.isAdmin) {
            alert('⚠️ Modalità sola lettura. Accedi come admin per modificare.');
            return;
        }

        const cell = e.target.closest('.recurring-mobile-time-editable');
        if (!cell) return;

        const courtId = cell.dataset.court;
        const index = parseInt(cell.dataset.index);
        const currentTime = cell.textContent.trim();

        // Parse current time
        const timeParts = currentTime.replace('.', ':').split(':');
        const currentHour = timeParts[0] || '08';
        const currentMin = timeParts[1] || '00';

        const court = Courts.getById(courtId);
        const courtName = court?.name || 'Campo';

        const title = `✏️ Modifica Orario Ricorrente - ${courtName}`;

        const body = `
            <div style="text-align: center; padding: 10px 0;">
                <p style="color: #a0aec0; margin-bottom: 20px;">Orario attuale: <strong style="color: #2d8a4e;">${currentTime}</strong></p>
                <div style="display: flex; justify-content: center; align-items: center; gap: 10px;">
                    <select id="recurring-mobile-time-hour" class="filter-select" style="padding: 12px 20px; font-size: 1.2rem; min-width: 80px;">
                        ${Array.from({ length: 16 }, (_, i) => i + 8)
                .map(h => `<option value="${String(h).padStart(2, '0')}" ${String(h).padStart(2, '0') === currentHour ? 'selected' : ''}>${String(h).padStart(2, '0')}</option>`)
                .join('')}
                    </select>
                    <span style="font-size: 1.5rem; font-weight: bold;">:</span>
                    <select id="recurring-mobile-time-min" class="filter-select" style="padding: 12px 20px; font-size: 1.2rem; min-width: 80px;">
                        ${Array.from({ length: 60 }, (_, i) => i)
                .map(m => `<option value="${String(m).padStart(2, '0')}" ${String(m).padStart(2, '0') === currentMin ? 'selected' : ''}>${String(m).padStart(2, '0')}</option>`)
                .join('')}
                    </select>
                </div>
            </div>
        `;

        const footer = `
            <div style="display: flex; justify-content: center; gap: 15px;">
                <button class="btn btn-secondary" onclick="App.closeModal()">Annulla</button>
                <button class="btn btn-primary" onclick="App.confirmRecurringMobileTimeEdit('${courtId}', ${index})">✓ Salva</button>
            </div>
        `;

        this.showModal(title, body, footer);
    },

    // Conferma modifica orario da mobile (Ricorrente)
    confirmRecurringMobileTimeEdit(courtId, index) {
        const hourEl = document.getElementById('recurring-mobile-time-hour');
        const minEl = document.getElementById('recurring-mobile-time-min');

        if (!hourEl || !minEl) {
            console.error('[RECURRING MOBILE TIME] Elements not found');
            return;
        }

        const newTime = `${hourEl.value}.${minEl.value}`;

        const recurringTimeTemplates = Storage.load('recurring_time_templates', {});
        if (!recurringTimeTemplates[courtId]) {
            recurringTimeTemplates[courtId] = ['08.30', '09.30', '10.30', '11.30', '12.30', '13.30', '14.30', '15.30', '16.30', '17.30', '18.30', '19.30', '20.30', '21.30', '22.30'];
        }

        recurringTimeTemplates[courtId][index] = newTime;
        Storage.save('recurring_time_templates', recurringTimeTemplates);

        this.closeModal();
        this.renderRecurringPlanning();
    },

    handleRecurringCellClick(e) {
        // Block editing if not admin
        if (!window.isAdmin) {
            alert('⚠️ Modalità sola lettura. Accedi come admin per modificare.');
            return;
        }

        const cell = e.target.closest('.recurring-cell');
        if (!cell) return;

        const courtId = cell.dataset.court;
        const time = cell.dataset.time;
        const court = Courts.getById(courtId);

        this.showRecurringSlotModal(courtId, time, court.name);
    },

    showRecurringSlotModal(courtId, time, courtName) {
        const allPlayers = Players.getAll() || [];
        const court = Courts.getById(courtId);
        const key = `${courtId}_${time}`;
        const existing = this.recurringTemplate[key];

        // Calculate end time
        const [h, m] = time.split(':').map(Number);
        const defaultEndTime = `${String(h + 1).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
        const endTime = existing?.to || defaultEndTime;

        const activityTypes = [
            { id: 'scuola', label: 'Scuola' },
            { id: 'torneo', label: 'Torneo' },
            { id: 'ago', label: 'AGO' },
            { id: 'promo', label: 'PROMO' },
            { id: 'manutenzione', label: 'Manutenzione' }
        ];

        const title = existing ? `Gestione Attività Ricorrente - ${courtName}` : `Nuova Attività Ricorrente - ${courtName} (${time} - ${endTime})`;

        const body = `
            <div class="modal-three-columns">
                <!-- Row for Activity/Player selection with radio buttons -->
                <div class="selection-row" id="recurring-selection-row">
                    <div class="selection-option">
                        <input type="radio" id="recurring-mode-activity" name="recurring-selection-mode" value="activity" checked onchange="App.toggleRecurringSelectionMode('activity')">
                        <label for="recurring-mode-activity">Attività</label>
                        <select id="recurring-activity-type-select" class="form-control" onchange="
                            var type = this.value;
                            document.getElementById('recurring-selected-type').value = type;
                            if(type !== 'match') {
                                document.getElementById('recurring-slot-player-1').value = this.options[this.selectedIndex].text;
                                document.getElementById('recurring-slot-player-2').value = '';
                                document.getElementById('recurring-slot-player-3').value = '';
                                document.getElementById('recurring-slot-player-4').value = '';
                            }
                        ">
                            <option value="match" ${existing?.type === 'match' || !existing?.type ? 'selected' : ''}>Match</option>
                            ${activityTypes.map(type => `
                                <option value="${type.id}" ${existing?.type === type.id ? 'selected' : ''}>${type.label}</option>
                            `).join('')}
                        </select>
                    </div>
                    <div class="selection-option">
                        <input type="radio" id="recurring-mode-player" name="recurring-selection-mode" value="player" onchange="App.toggleRecurringSelectionMode('player')">
                        <label for="recurring-mode-player">Giocatore</label>
                        <select id="recurring-player-select" class="form-control" disabled onchange="
                            if(this.value) {
                                App.insertRecurringPlayerInSlot(this.value);
                                this.value = '';
                            }
                        ">
                            <option value="">-- Scegli --</option>
                            ${allPlayers.map(p => `
                                <option value="${p.name}">${p.name} (${p.level || 'N/A'})</option>
                            `).join('')}
                        </select>
                    </div>
                
                <!-- Colonna centrale: Nominativi + Orario -->
                <div class="center-column">
                    <div class="form-group">
                        <label>Nominativi</label>
                        <div class="players-grid-input">
                            <input type="text" id="recurring-slot-player-1" class="player-input" placeholder="Giocatore 1" 
                                   value="${existing?.players?.[0] || ''}" onfocus="App.setActiveRecurringPlayerInput(1)">
                            <input type="text" id="recurring-slot-player-2" class="player-input" placeholder="Giocatore 2"
                                   value="${existing?.players?.[1] || ''}" onfocus="App.setActiveRecurringPlayerInput(2)">
                            <input type="text" id="recurring-slot-player-3" class="player-input" placeholder="Giocatore 3"
                                   value="${existing?.players?.[2] || ''}" onfocus="App.setActiveRecurringPlayerInput(3)">
                            <input type="text" id="recurring-slot-player-4" class="player-input" placeholder="Giocatore 4"
                                   value="${existing?.players?.[3] || ''}" onfocus="App.setActiveRecurringPlayerInput(4)">
                        </div>
                        <input type="hidden" id="recurring-slot-label" value="${existing?.label || ''}">
                    </div>
                    
                    <div class="time-selection" style="margin-top: 10px;">
                        <div class="form-row">
                            <div class="form-group">
                                <label>Orario Inizio</label>
                                <div style="display: flex; gap: 5px; align-items: center;">
                                    <select id="recurring-slot-start-hour" class="filter-select">
                                        ${Array.from({ length: 16 }, (_, i) => i + 8)
                .map(h => `<option value="${String(h).padStart(2, '0')}" ${String(h).padStart(2, '0') === time.split(':')[0] ? 'selected' : ''}>${String(h).padStart(2, '0')}</option>`)
                .join('')}
                                    </select>
                                    <span>:</span>
                                    <select id="recurring-slot-start-min" class="filter-select">
                                        <option value="00" ${time.split(':')[1] === '00' ? 'selected' : ''}>00</option>
                                        <option value="30" ${time.split(':')[1] === '30' ? 'selected' : ''}>30</option>
                                    </select>
                                </div>
                            </div>
                            <div class="form-group">
                                <label>Orario Fine</label>
                                <div style="display: flex; gap: 5px; align-items: center;">
                                    <select id="recurring-slot-end-hour" class="filter-select">
                                        ${Array.from({ length: 16 }, (_, i) => i + 8)
                .map(h => `<option value="${String(h).padStart(2, '0')}" ${String(h).padStart(2, '0') === endTime.split(':')[0] ? 'selected' : ''}>${String(h).padStart(2, '0')}</option>`)
                .join('')}
                                    </select>
                                    <span>:</span>
                                    <select id="recurring-slot-end-min" class="filter-select">
                                        <option value="00" ${endTime.split(':')[1] === '00' ? 'selected' : ''}>00</option>
                                        <option value="30" ${endTime.split(':')[1] === '30' ? 'selected' : ''}>30</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <input type="hidden" id="recurring-selected-type" value="${existing?.type || 'match'}">
                    <input type="hidden" id="recurring-court-id" value="${courtId}">
                    <input type="hidden" id="recurring-original-time" value="${time}">
                </div>
            </div>
        `;

        const footer = `
            <div class="modal-footer-buttons">
                <div class="footer-left-buttons">
                    ${existing ? `<button class="btn btn-danger btn-sm" onclick="App.deleteRecurringSlot('${courtId}', '${time}')">🗑️ Elimina</button>` : ''}
                </div>
                <div class="footer-right-buttons">
                    <button class="btn btn-secondary" onclick="App.closeModal()">Annulla</button>
                    <button class="btn btn-primary" onclick="App.confirmRecurringSlot()">
                        ${existing ? '💾 Salva' : '✓ Conferma'}
                    </button>
                </div>
            </div>
        `;

        this.showModal(title, body, footer);
        this.activeRecurringPlayerSlot = 1;
    },

    // Toggle selection mode for recurring modal
    toggleRecurringSelectionMode(mode) {
        const activitySelect = document.getElementById('recurring-activity-type-select');
        const playerSelect = document.getElementById('recurring-player-select');

        if (mode === 'activity') {
            activitySelect.disabled = false;
            playerSelect.disabled = true;
        } else {
            activitySelect.disabled = true;
            playerSelect.disabled = false;
        }
    },

    activeRecurringPlayerSlot: 1,

    setActiveRecurringPlayerInput(slotNum) {
        this.activeRecurringPlayerSlot = slotNum;
        document.querySelectorAll('#recurring-slot-player-1, #recurring-slot-player-2, #recurring-slot-player-3, #recurring-slot-player-4').forEach((input, index) => {
            input.classList.toggle('active-slot', index + 1 === slotNum);
        });
    },

    insertRecurringPlayerInSlot(playerName) {
        const input = document.getElementById(`recurring-slot-player-${this.activeRecurringPlayerSlot}`);
        if (input) {
            input.value = playerName;
            if (this.activeRecurringPlayerSlot < 4) {
                this.setActiveRecurringPlayerInput(this.activeRecurringPlayerSlot + 1);
            }
        }
    },

    confirmRecurringSlot() {
        const courtId = document.getElementById('recurring-court-id').value;
        const originalTime = document.getElementById('recurring-original-time').value;
        const type = document.getElementById('recurring-selected-type').value;
        const label = document.getElementById('recurring-slot-label').value.trim();

        const startHour = document.getElementById('recurring-slot-start-hour').value;
        const startMin = document.getElementById('recurring-slot-start-min').value;
        const endHour = document.getElementById('recurring-slot-end-hour').value;
        const endMin = document.getElementById('recurring-slot-end-min').value;

        const fromTime = `${startHour}:${startMin}`;
        const toTime = `${endHour}:${endMin}`;

        // Collect players
        const players = [];
        for (let i = 1; i <= 4; i++) {
            const input = document.getElementById(`recurring-slot-player-${i}`);
            if (input && input.value.trim()) {
                players.push(input.value.trim());
            }
        }

        if (players.length === 0 && !type) {
            alert('Inserisci almeno un giocatore o seleziona un tipo attività.');
            return;
        }

        // Clear old entries in the time range
        Object.keys(this.recurringTemplate).forEach(key => {
            if (key.startsWith(courtId + '_')) {
                const keyTime = key.split('_')[1];
                if (keyTime >= fromTime && keyTime < toTime) {
                    delete this.recurringTemplate[key];
                }
            }
        });

        // Create entries for each 1-hour slot in the range
        const startTimeMinutes = parseInt(startHour) * 60 + parseInt(startMin);
        const endTimeMinutes = parseInt(endHour) * 60 + parseInt(endMin);

        for (let t = startTimeMinutes; t < endTimeMinutes; t += 60) {
            const slotHour = Math.floor(t / 60);
            const slotMin = t % 60;
            const nextHour = Math.floor((t + 60) / 60);
            const nextMin = (t + 60) % 60;

            const slotFrom = `${String(slotHour).padStart(2, '0')}:${String(slotMin).padStart(2, '0')}`;
            const slotTo = `${String(nextHour).padStart(2, '0')}:${String(nextMin).padStart(2, '0')}`;

            const key = `${courtId}_${slotFrom}`;
            const displayLabel = players.length > 0 ? players.join(' / ') : (type ? this.recurringActivityTypes.find(a => a.id === type)?.label || type : '');
            this.recurringTemplate[key] = {
                type: type || 'match',
                label: displayLabel,
                players,
                from: slotFrom,
                to: slotTo
            };
        }

        this.closeModal();
        this.renderRecurringPlanning();
    },

    // Activity types for recurring (needed in confirmRecurringSlot)
    recurringActivityTypes: [
        { id: 'scuola', label: 'Scuola' },
        { id: 'torneo', label: 'Torneo' },
        { id: 'ago', label: 'AGO' },
        { id: 'promo', label: 'PROMO' },
        { id: 'manutenzione', label: 'Manutenzione' }
    ],

    deleteRecurringSlot(courtId, time) {
        const key = `${courtId}_${time}`;
        delete this.recurringTemplate[key];
        this.closeModal();
        this.renderRecurringPlanning();
    },

    generateRecurringReservations() {
        const dayOfWeek = parseInt(document.getElementById('recurring-day').value);
        const startDate = document.getElementById('recurring-start-date').value;
        const endDate = document.getElementById('recurring-end-date').value;

        if (!startDate || !endDate) {
            alert('Seleziona data inizio e data fine.');
            return;
        }

        if (Object.keys(this.recurringTemplate).length === 0) {
            alert('Imposta almeno un\'attività cliccando sulle celle.');
            return;
        }

        const start = new Date(startDate);
        const end = new Date(endDate);

        if (start >= end) {
            alert('La data fine deve essere successiva alla data inizio.');
            return;
        }

        // Find all dates matching the day of week
        const dates = [];
        let current = new Date(start);

        // Move to first matching day
        while (current.getDay() !== dayOfWeek && current <= end) {
            current.setDate(current.getDate() + 1);
        }

        // Collect all matching dates
        while (current <= end) {
            dates.push(new Date(current));
            current.setDate(current.getDate() + 7);
        }

        if (dates.length === 0) {
            alert('Nessuna data trovata nel range selezionato.');
            return;
        }

        const dayNames = ['domenica', 'lunedi', 'martedi', 'mercoledi', 'giovedi', 'venerdi', 'sabato'];
        const dayName = dayNames[dayOfWeek];

        // Group template by court
        const courtActivities = {};
        Object.keys(this.recurringTemplate).forEach(key => {
            const [courtId, time] = key.split('_');
            if (!courtActivities[courtId]) courtActivities[courtId] = [];
            courtActivities[courtId].push({ time, ...this.recurringTemplate[key] });
        });

        let totalCreated = 0;

        // Generate reservations for each date
        dates.forEach(date => {
            const dateStr = date.toISOString().split('T')[0];

            Object.keys(courtActivities).forEach(courtId => {
                const court = Courts.getById(courtId);
                if (!court) return;

                court.reservations = court.reservations || [];

                courtActivities[courtId].forEach(activity => {
                    // Use the saved to time from the activity, or calculate if not present
                    const endTime = activity.to || (() => {
                        const [h, m] = activity.time.split(':').map(Number);
                        return `${String(h + 1).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
                    })();

                    // Check if already exists for this specific date and time
                    const exists = court.reservations.some(r =>
                        r.date === dateStr && r.from === activity.time
                    );

                    if (!exists) {
                        court.reservations.push({
                            day: dayName,
                            date: dateStr,  // Save with specific date!
                            from: activity.time,
                            to: endTime,
                            type: activity.type,
                            label: activity.label,
                            players: activity.players || [],
                            price: ''
                        });
                        totalCreated++;
                    }
                });

                Courts.update(courtId, court);
            });
        });

        alert(`✅ Generate ${totalCreated} prenotazioni per ${dates.length} ${dayName}!`);

        // Clear template
        this.recurringTemplate = {};
        this.renderRecurringPlanning();
    },

    // Mobile times editing modal
    showMobileTimesModal() {
        const select = document.getElementById('admin-mobile-court-select');
        if (!select || !select.value) {
            alert('Seleziona prima un campo');
            return;
        }
        const courtId = select.value;
        const courts = Courts.getAvailable(this.currentSeason);
        const court = courts.find(c => c.id === courtId);
        if (!court) return;

        const dateStr = this.currentPlanningDate.toISOString().split('T')[0];
        const planningTemplates = Storage.load('planning_templates', {}) || {};
        const dayTemplate = planningTemplates[dateStr] || {};
        const defaultTimes = ['08.30', '09.30', '10.30', '11.30', '12.30', '13.30', '14.30', '15.30', '16.30', '17.30', '18.30', '19.30', '20.30', '21.30', '22.30'];
        const times = dayTemplate[courtId] || [...defaultTimes];

        let timesHtml = '<div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; max-height: 60vh; overflow-y: auto;">';
        times.forEach((time, index) => {
            timesHtml += `
                <input type="text" 
                       class="mobile-time-input" 
                       value="${time}" 
                       data-index="${index}"
                       style="padding: 10px; text-align: center; border: 1px solid var(--border); border-radius: 6px; background: var(--bg-card); color: #fff; font-size: 1rem;"
                       onclick="this.select()">
            `;
        });
        timesHtml += '</div>';
        timesHtml += `
            <div style="margin-top: 15px; display: flex; gap: 10px;">
                <button class="btn btn-outline" onclick="App.addMobileTimeSlot('${courtId}')" style="flex: 1;">+ Aggiungi</button>
                <button class="btn btn-outline" onclick="App.removeMobileTimeSlot('${courtId}')" style="flex: 1;">- Rimuovi ultimo</button>
            </div>
        `;

        const footer = `
            <button class="btn btn-secondary" onclick="App.closeModal()">Annulla</button>
            <button class="btn btn-primary" onclick="App.saveMobileTimes('${courtId}')">Salva Orari</button>
        `;

        this.showModal(`⏰ Orari ${court.name}`, timesHtml, footer);
    },

    // Save mobile times
    saveMobileTimes(courtId) {
        const inputs = document.querySelectorAll('.mobile-time-input');
        const newTimes = [];
        inputs.forEach(input => {
            if (input.value.trim()) {
                newTimes.push(input.value.trim());
            }
        });

        if (newTimes.length === 0) {
            alert('Devi inserire almeno un orario');
            return;
        }

        const dateStr = this.currentPlanningDate.toISOString().split('T')[0];
        const planningTemplates = Storage.load('planning_templates', {}) || {};
        if (!planningTemplates[dateStr]) planningTemplates[dateStr] = {};
        planningTemplates[dateStr][courtId] = newTimes;
        Storage.save('planning_templates', planningTemplates);

        this.closeModal();
        this.renderPlanning();
        this.renderMobilePlanning();
    },

    // Add time slot in mobile modal
    addMobileTimeSlot(courtId) {
        const container = document.querySelector('.modal-body > div');
        if (!container) return;
        const inputs = container.querySelectorAll('.mobile-time-input');
        const lastTime = inputs[inputs.length - 1]?.value || '22.30';

        // Try to add +1 hour
        const [hours, mins] = lastTime.split('.');
        let newHour = parseInt(hours) + 1;
        if (newHour > 23) newHour = 23;
        const newTime = String(newHour).padStart(2, '0') + '.' + (mins || '30');

        const newInput = document.createElement('input');
        newInput.type = 'text';
        newInput.className = 'mobile-time-input';
        newInput.value = newTime;
        newInput.dataset.index = inputs.length;
        newInput.style = 'padding: 10px; text-align: center; border: 1px solid var(--border); border-radius: 6px; background: var(--bg-card); color: #fff; font-size: 1rem;';
        newInput.onclick = function () { this.select(); };
        container.appendChild(newInput);
    },

    // Remove last time slot in mobile modal
    removeMobileTimeSlot(courtId) {
        const inputs = document.querySelectorAll('.mobile-time-input');
        if (inputs.length > 1) {
            inputs[inputs.length - 1].remove();
        }
    },

    // Generic Modal Opener
    openModal(title, bodyCallbackOrHtml) {
        // Remove existing modal if any
        const existing = document.getElementById('generic-modal-overlay');
        if (existing) existing.remove();

        const bodyContent = typeof bodyCallbackOrHtml === 'function' ? bodyCallbackOrHtml() : bodyCallbackOrHtml;

        const modalHtml = `
            <div id="generic-modal-overlay" class="modal-overlay active" style="z-index: 2000;">
                <div class="modal">
                    <div class="modal-header">
                        <h3>${title}</h3>
                        <button class="modal-close" onclick="document.getElementById('generic-modal-overlay').remove()">×</button>
                    </div>
                    <div class="modal-body">${bodyContent}</div>
                    <div class="modal-footer">
                        <button class="btn btn-secondary" onclick="document.getElementById('generic-modal-overlay').remove()">Chiudi</button>
                    </div>
                </div>
            </div>
        `;

        // Create a temporary container to turn string into DOM
        const div = document.createElement('div');
        div.innerHTML = modalHtml.trim();
        document.body.appendChild(div.firstChild);
    },

    // Date navigation for header buttons
    changeDay(delta) {
        this.currentPlanningDate.setDate(this.currentPlanningDate.getDate() + delta);
        this.renderPlanning();
        this.renderMobilePlanning();
    },

    // Print daily planning
    printDailyPlanning() {
        // Show format selection modal
        const body = `
            <div style="text-align: center; padding: 20px;">
                <p style="margin-bottom: 20px; color: var(--text-secondary);">Seleziona il formato di stampa:</p>
                <div style="display: flex; justify-content: center; gap: 20px;">
                    <button class="btn btn-primary" onclick="App.executePrint('A4')" style="padding: 15px 30px; font-size: 1.1rem;">
                        📄 A4
                    </button>
                    <button class="btn btn-primary" onclick="App.executePrint('A3')" style="padding: 15px 30px; font-size: 1.1rem;">
                        📄 A3
                    </button>
                </div>
            </div>
        `;
        this.showModal('🖨️ Stampa Planning Giornaliero', body, '');
    },

    executePrint(format) {
        this.closeModal();

        const dateStr = this.currentPlanningDate.toISOString().split('T')[0];
        const dayNames = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'];
        const dayName = dayNames[this.currentPlanningDate.getDay()].toUpperCase();
        const formattedDate = this.currentPlanningDate.toLocaleDateString('it-IT');

        const courts = Courts.getAvailable(this.currentSeason);
        const planningTemplates = Storage.load('planning_templates', {});
        const defaultTimes = ['08.30', '09.30', '10.30', '11.30', '12.30', '13.30', '14.30', '15.30', '16.30', '17.30', '18.30', '19.30', '20.30', '21.30', '22.30'];

        // Activity colors mapping
        const activityColors = {
            'ago': '#f97316',
            'scuola': '#f97316',
            'promo': '#22c55e',
            'torneo': '#3b82f6',
            'manutenzione': '#6b7280',
            'match': '#ffffff',
            'players': '#ffffff',
            'nasty': '#22c55e'
        };

        // Build courts HTML
        let courtsHtml = '';
        let courtTotals = [];

        courts.forEach((court, courtIndex) => {
            const dayTemplate = planningTemplates[dateStr] || {};
            const times = dayTemplate[court.id] || [...defaultTimes];
            const reservations = court.reservations || [];
            let courtTotal = 0;

            let rowsHtml = '';
            times.forEach((time, index) => {
                const standardizedTime = time.replace('.', ':');
                const nextTime = times[index + 1] || Matching.addTime(standardizedTime, 60);
                const standardizedNextTime = nextTime.replace('.', ':');

                // Find reservation for this slot
                let res = reservations.find(r => {
                    return r.date === dateStr && (standardizedTime < r.to && standardizedNextTime > r.from);
                });
                if (!res) {
                    res = reservations.find(r => {
                        const dayNameIt = Matching.getDayNameFromDate(dateStr);
                        return !r.date && r.day === dayNameIt && (standardizedTime < r.to && standardizedNextTime > r.from);
                    });
                }

                let cellContent = '';
                let cellStyle = 'background: #fff;';
                let quotaCol = '';
                let paidCol = '';

                if (res?.players && res.players.some(p => p && p.trim())) {
                    const filledPlayers = res.players.filter(p => p && p.trim());
                    const activityLabels = ['match', 'scuola', 'ago', 'promo', 'torneo', 'manutenzione', 'nasty'];
                    const firstPlayerLower = (res.players[0] || '').toLowerCase();
                    const isActivity = activityLabels.includes(firstPlayerLower);

                    if (isActivity) {
                        const color = activityColors[firstPlayerLower] || '#f97316';
                        cellStyle = `background: ${color}; color: ${color === '#ffffff' ? '#000' : '#fff'};`;
                        cellContent = res.players[0].toUpperCase();
                    } else {
                        // Build players content based on count
                        if (filledPlayers.length === 2) {
                            // 2 players: stack vertically
                            cellContent = filledPlayers.join('<br>');
                        } else if (filledPlayers.length > 2) {
                            // 3-4 players: 2x2 grid layout
                            cellContent = `<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1px; font-size: 0.85em;">
                                <span>${filledPlayers[0] || ''}</span>
                                <span>${filledPlayers[1] || ''}</span>
                                <span>${filledPlayers[2] || ''}</span>
                                <span>${filledPlayers[3] || ''}</span>
                            </div>`;
                        } else {
                            // 1 player
                            cellContent = filledPlayers[0] || '';
                        }

                        // Build quota column - one value per player, stacked vertically (skip 0 values)
                        const quotaVals = filledPlayers.map((playerName, i) => {
                            const originalIdx = res.players.indexOf(playerName);
                            const quota = res.payments?.[originalIdx] || 0;
                            return quota === 0 ? '' : quota;
                        });

                        // Build paid column - one value per player, stacked vertically (skip 0 values)
                        const paidVals = filledPlayers.map((playerName, i) => {
                            const originalIdx = res.players.indexOf(playerName);
                            const paid = res.paid?.[originalIdx] || 0;
                            courtTotal += paid;
                            return paid === 0 ? '' : paid;
                        });

                        if (filledPlayers.length <= 2) {
                            // Stack vertically for 1-2 players
                            quotaCol = quotaVals.join('<br>');
                            paidCol = paidVals.join('<br>');
                        } else {
                            // 2x2 grid for 3-4 players
                            quotaCol = `<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1px; font-size: 0.85em;">
                                <span>${quotaVals[0] || ''}</span>
                                <span>${quotaVals[1] || ''}</span>
                                <span>${quotaVals[2] || ''}</span>
                                <span>${quotaVals[3] || ''}</span>
                            </div>`;
                            paidCol = `<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1px; font-size: 0.85em;">
                                <span>${paidVals[0] || ''}</span>
                                <span>${paidVals[1] || ''}</span>
                                <span>${paidVals[2] || ''}</span>
                                <span>${paidVals[3] || ''}</span>
                            </div>`;
                        }
                    }
                } else if (res) {
                    const color = activityColors[res.type] || '#f97316';
                    cellStyle = `background: ${color}; color: #fff;`;
                    cellContent = res.label || res.type?.toUpperCase() || 'Prenotato';
                }

                rowsHtml += `
                    <tr style="height: ${format === 'A3' ? '28px' : '22px'};">
                        <td style="border: 1px solid #000; padding: 2px 4px; text-align: center; font-weight: bold; vertical-align: middle; -webkit-print-color-adjust: exact; print-color-adjust: exact;">${time}</td>
                        <td style="border: 1px solid #000; padding: 2px 4px; ${cellStyle} text-align: left; vertical-align: middle; line-height: 1.1; -webkit-print-color-adjust: exact; print-color-adjust: exact;">${cellContent}</td>
                        <td style="border: 1px solid #000; padding: 2px 4px; text-align: center; vertical-align: middle; line-height: 1.1; -webkit-print-color-adjust: exact; print-color-adjust: exact;">${quotaCol}</td>
                        <td style="border: 1px solid #000; padding: 2px 4px; text-align: center; vertical-align: middle; line-height: 1.1; -webkit-print-color-adjust: exact; print-color-adjust: exact;">${paidCol}</td>
                    </tr>
                `;
            });

            courtTotals.push({ name: court.name, total: courtTotal });

            courtsHtml += `
                <div style="flex: 1; min-width: 180px;">
                    <table style="border-collapse: collapse; width: 100%; font-size: ${format === 'A3' ? '9px' : '7px'};">
                        <thead>
                            <tr style="height: ${format === 'A3' ? '24px' : '20px'};">
                                <th style="border: 1px solid #000; padding: 2px; background: #ddd; width: 40px; -webkit-print-color-adjust: exact; print-color-adjust: exact;">Ora</th>
                                <th style="border: 1px solid #000; padding: 2px; background: #ddd; -webkit-print-color-adjust: exact; print-color-adjust: exact;">${court.name}</th>
                                <th style="border: 1px solid #000; padding: 2px; background: #ddd; width: 35px; -webkit-print-color-adjust: exact; print-color-adjust: exact;">Q</th>
                                <th style="border: 1px solid #000; padding: 2px; background: #ddd; width: 35px; -webkit-print-color-adjust: exact; print-color-adjust: exact;">P</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rowsHtml}
                        </tbody>
                        <tfoot>
                            <tr>
                                <td colspan="4" style="border: 1px solid #000; padding: 4px; font-size: 0.85em; -webkit-print-color-adjust: exact; print-color-adjust: exact;">incasso all'uscita ${court.name.toLowerCase()}</td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            `;
        });

        // Calculate grand total
        const grandTotal = courtTotals.reduce((sum, ct) => sum + ct.total, 0);

        // Build the complete print HTML
        const printHtml = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <title>Planning ${dayName} ${formattedDate}</title>
                <style>
                    @page {
                        size: ${format} landscape;
                        margin: 10mm;
                    }
                    body {
                        font-family: Arial, sans-serif;
                        margin: 0;
                        padding: 10px;
                        -webkit-print-color-adjust: exact;
                        print-color-adjust: exact;
                    }
                    td, th {
                        -webkit-print-color-adjust: exact;
                        print-color-adjust: exact;
                    }
                    .header {
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        margin-bottom: 10px;
                        border-bottom: 2px solid #000;
                        padding-bottom: 10px;
                    }
                    .header h1 {
                        margin: 0;
                        font-size: ${format === 'A3' ? '28px' : '22px'};
                    }
                    .header .date {
                        font-size: ${format === 'A3' ? '24px' : '18px'};
                        font-weight: bold;
                    }
                    .legend {
                        font-size: 0.8em;
                        margin-bottom: 10px;
                        color: #666;
                    }
                    .courts-container {
                        display: flex;
                        gap: 10px;
                        flex-wrap: nowrap;
                    }
                    .footer-section {
                        margin-top: 15px;
                        border-top: 1px solid #000;
                        padding-top: 10px;
                        display: grid;
                        grid-template-columns: 1fr 1fr;
                        gap: 10px;
                        font-size: ${format === 'A3' ? '11px' : '9px'};
                    }
                    .footer-section div {
                        border: 1px solid #000;
                        padding: 8px;
                    }
                    .total-row {
                        margin-top: 10px;
                        text-align: right;
                        font-size: ${format === 'A3' ? '14px' : '12px'};
                        font-weight: bold;
                    }
                    .total-highlight {
                        background: yellow;
                        padding: 5px 15px;
                        display: inline-block;
                        -webkit-print-color-adjust: exact;
                        print-color-adjust: exact;
                    }
                </style>
            </head>
            <body>
                <div class="header">
                    <h1>${dayName}</h1>
                    <div class="date">${formattedDate}</div>
                </div>
                
                <div class="legend">
                    <strong>PROMO</strong> (evidenziare la cella orario in giallo) | 
                    <strong>GESTORE INCASSARE</strong> (evidenziare il prezzo da incassare)
                </div>
                
                <div class="courts-container">
                    ${courtsHtml}
                </div>
                
                <div class="footer-section">
                    <div>
                        <strong>SOSPESI MAESTRI</strong><br><br>
                    </div>
                    <div>
                        <strong>SPESE DETRATTE INCASSI</strong><br><br>
                    </div>
                </div>
                
                <div class="footer-section" style="grid-template-columns: 1fr;">
                    <div>
                        <strong>INCASSI PALLINE</strong>
                    </div>
                </div>
                
                <div class="total-row">
                    TOTALE GIORNATA INCASSATO: <span class="total-highlight">${grandTotal > 0 ? grandTotal + '€' : ''}</span>
                </div>
            </body>
            </html>
        `;

        // Open print window
        const printWindow = window.open('', '_blank');
        printWindow.document.write(printHtml);
        printWindow.document.close();

        // Wait for content to load then print
        printWindow.onload = function () {
            printWindow.print();
        };
    },

    // ========================================
    // PayPal Configuration Functions
    // ========================================

    // Load PayPal configuration into UI
    loadPayPalConfig() {
        const config = Storage.load('paypal_config', {
            clientId: 'sb',
            productionMode: false
        });

        const clientIdInput = document.getElementById('paypal-client-id');
        const productionCheckbox = document.getElementById('paypal-production-mode');
        const statusBadge = document.getElementById('paypal-status-badge');
        const warningEl = document.getElementById('paypal-production-warning');

        if (clientIdInput) clientIdInput.value = config.clientId || 'sb';
        if (productionCheckbox) productionCheckbox.checked = config.productionMode || false;

        // Update status badge
        if (statusBadge) {
            if (config.productionMode) {
                statusBadge.textContent = 'Produzione';
                statusBadge.style.background = '#22c55e';
            } else {
                statusBadge.textContent = 'Sandbox';
                statusBadge.style.background = '#f59e0b';
            }
        }

        // Show/hide warning
        if (warningEl) {
            warningEl.style.display = config.productionMode ? 'block' : 'none';
        }
    },

    // Save PayPal configuration
    savePayPalConfig() {
        const clientId = document.getElementById('paypal-client-id')?.value?.trim() || 'sb';
        const productionMode = document.getElementById('paypal-production-mode')?.checked || false;

        const config = {
            clientId: clientId,
            productionMode: productionMode,
            lastUpdated: new Date().toISOString()
        };

        Storage.save('paypal_config', config);

        // Update UI
        this.loadPayPalConfig();

        // Reload PayPal SDK with new configuration
        this.reloadPayPalSDK(clientId);

        alert(`✅ Configurazione PayPal salvata!\n\nClient ID: ${clientId === 'sb' ? 'Sandbox (Demo)' : clientId.substring(0, 20) + '...'}\nModalità: ${productionMode ? '🔴 Produzione' : '🟡 Sandbox'}`);
    },

    // Toggle production mode UI
    togglePayPalMode() {
        const productionMode = document.getElementById('paypal-production-mode')?.checked || false;
        const statusBadge = document.getElementById('paypal-status-badge');
        const warningEl = document.getElementById('paypal-production-warning');

        if (statusBadge) {
            if (productionMode) {
                statusBadge.textContent = 'Produzione';
                statusBadge.style.background = '#22c55e';
            } else {
                statusBadge.textContent = 'Sandbox';
                statusBadge.style.background = '#f59e0b';
            }
        }

        if (warningEl) {
            warningEl.style.display = productionMode ? 'block' : 'none';
        }
    },

    // Test PayPal connection
    testPayPalConnection() {
        const clientId = document.getElementById('paypal-client-id')?.value?.trim() || 'sb';

        if (typeof paypal === 'undefined') {
            alert('❌ PayPal SDK non caricato.\n\nAssicurati che la connessione internet sia attiva e ricarica la pagina.');
            return;
        }

        // Create a test container
        let testContainer = document.getElementById('paypal-test-container');
        if (!testContainer) {
            testContainer = document.createElement('div');
            testContainer.id = 'paypal-test-container';
            testContainer.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:#1e1e2e;padding:30px;border-radius:12px;z-index:10000;box-shadow:0 10px 40px rgba(0,0,0,0.5);min-width:350px;';
            testContainer.innerHTML = `
                <h3 style="color:#fff;margin-bottom:15px;">🧪 Test Pagamento PayPal</h3>
                <p style="color:#9ca3af;margin-bottom:15px;font-size:0.9rem;">Questo è un pagamento di test di €0.01</p>
                <div id="paypal-test-buttons" style="min-height:150px;"></div>
                <button onclick="document.getElementById('paypal-test-container').remove()" 
                        style="margin-top:15px;width:100%;padding:10px;background:#ef4444;color:white;border:none;border-radius:6px;cursor:pointer;">
                    ✕ Chiudi
                </button>
            `;
            document.body.appendChild(testContainer);
        }

        // Render test PayPal buttons
        try {
            paypal.Buttons({
                style: {
                    layout: 'vertical',
                    color: 'gold',
                    shape: 'rect',
                    label: 'paypal'
                },
                createOrder: (data, actions) => {
                    return actions.order.create({
                        purchase_units: [{
                            description: 'Test Connessione PayPal - Tennis Manager',
                            amount: {
                                currency_code: 'EUR',
                                value: '0.01'
                            }
                        }]
                    });
                },
                onApprove: (data, actions) => {
                    return actions.order.capture().then((orderData) => {
                        alert('✅ Test completato con successo!\n\nPayPal è configurato correttamente.\nID Transazione: ' + orderData.id);
                        document.getElementById('paypal-test-container')?.remove();
                    });
                },
                onError: (err) => {
                    console.error('PayPal test error:', err);
                    alert('❌ Errore nella configurazione PayPal.\n\nVerifica il Client ID e riprova.');
                },
                onCancel: () => {
                    console.log('PayPal test cancelled');
                }
            }).render('#paypal-test-buttons');
        } catch (e) {
            console.error('Error rendering PayPal test buttons:', e);
            alert('❌ Errore nel caricamento dei pulsanti PayPal.\n\nErrore: ' + e.message);
            testContainer.remove();
        }
    },

    // Reload PayPal SDK with new client ID
    reloadPayPalSDK(clientId) {
        // Remove existing PayPal script
        const existingScript = document.querySelector('script[src*="paypal.com/sdk"]');
        if (existingScript) {
            existingScript.remove();
        }

        // Clear PayPal namespace
        if (typeof paypal !== 'undefined') {
            delete window.paypal;
        }

        // Load new script with updated client ID
        const script = document.createElement('script');
        script.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}&currency=EUR&intent=capture`;
        script.setAttribute('data-sdk-integration-source', 'button-factory');
        script.onload = () => {
            console.log('✅ PayPal SDK ricaricato con Client ID:', clientId === 'sb' ? 'Sandbox' : clientId.substring(0, 15) + '...');
        };
        script.onerror = () => {
            console.error('❌ Errore nel caricamento PayPal SDK');
            alert('❌ Errore nel caricamento del PayPal SDK.\nVerifica il Client ID e la connessione internet.');
        };
        document.head.appendChild(script);
    }
};

// Initialize app with Firebase support
document.addEventListener('DOMContentLoaded', async () => {
    // Update Firebase status indicator
    const updateFirebaseStatus = () => {
        const iconEl = document.getElementById('firebase-status-icon');
        const textEl = document.getElementById('firebase-status-text');
        const statusEl = document.getElementById('firebase-status');
        const migrateBtn = document.getElementById('migrate-firebase-btn');

        if (!iconEl || !textEl || !statusEl) return;

        if (Storage.isFirebaseConnected()) {
            iconEl.textContent = '✅';
            textEl.textContent = 'Firebase connesso - Dati sincronizzati in tempo reale';
            statusEl.style.background = 'rgba(34, 197, 94, 0.2)';
            statusEl.style.border = '1px solid #22c55e';
            if (migrateBtn) migrateBtn.style.display = 'inline-block';
        } else {
            iconEl.textContent = '⚠️';
            textEl.textContent = 'Firebase non configurato - I dati sono salvati solo localmente';
            statusEl.style.background = 'rgba(234, 179, 8, 0.2)';
            statusEl.style.border = '1px solid #eab308';
            if (migrateBtn) migrateBtn.style.display = 'inline-block';
        }
    };

    // Initialize storage defaults (async now)
    await Storage.initializeDefaults();

    // Migrate player levels if needed
    await migratePlayerLevels();

    // Subscribe to real-time updates if Firebase is connected
    if (Storage.isFirebaseConnected()) {
        Storage.subscribe(Storage.KEYS.PLAYERS, () => {
            if (App.currentTab === 'players') Players.renderTable();
            if (App.currentTab === 'dashboard') App.updateDashboard();
        });
        Storage.subscribe(Storage.KEYS.COURTS, () => {
            if (App.currentTab === 'courts') Courts.renderGrid(App.currentSeason);
            if (App.currentTab === 'planning') App.renderPlanning();
            if (App.currentTab === 'recurring') App.renderRecurringPlanning();
        });
        Storage.subscribe(Storage.KEYS.SCHEDULED, () => {
            if (App.currentTab === 'planning') App.renderPlanning();
            if (App.currentTab === 'dashboard') App.updateDashboard();
        });
        Storage.subscribe(Storage.KEYS.SETTINGS, () => {
            App.loadSettings();
        });
    }

    // Initialize app
    App.init();

    // Update Firebase status after a short delay to ensure config is loaded
    setTimeout(updateFirebaseStatus, 500);
});
