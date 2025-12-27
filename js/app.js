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
        }
    },

    loadSettings() {
        const settings = Storage.load(Storage.KEYS.SETTINGS, {});
        this.currentSeason = settings.season || 'winter';
        document.getElementById('season-select').value = this.currentSeason;

        // Load court rates
        this.loadCourtRates();
    },

    loadCourtRates() {
        const rates = Storage.load(Storage.KEYS.COURT_RATES, {
            memberCovered: 5,
            nonMemberCovered: 8,
            memberUncovered: 3,
            nonMemberUncovered: 5
        });

        // Populate form if elements exist
        const mc = document.getElementById('rate-member-covered');
        const nmc = document.getElementById('rate-nonmember-covered');
        const mu = document.getElementById('rate-member-uncovered');
        const nmu = document.getElementById('rate-nonmember-uncovered');

        if (mc) mc.value = rates.memberCovered;
        if (nmc) nmc.value = rates.nonMemberCovered;
        if (mu) mu.value = rates.memberUncovered;
        if (nmu) nmu.value = rates.nonMemberUncovered;
    },

    saveCourtRates() {
        const rates = {
            memberCovered: parseFloat(document.getElementById('rate-member-covered').value) || 5,
            nonMemberCovered: parseFloat(document.getElementById('rate-nonmember-covered').value) || 8,
            memberUncovered: parseFloat(document.getElementById('rate-member-uncovered').value) || 3,
            nonMemberUncovered: parseFloat(document.getElementById('rate-nonmember-uncovered').value) || 5
        };

        Storage.save(Storage.KEYS.COURT_RATES, rates);
        alert('✅ Tariffe salvate!');
        console.log('💰 Tariffe salvate:', rates);
    },

    getPlayerRate(playerId, courtId) {
        const player = Players.getById(playerId);
        const court = Courts.getById(courtId);
        const rates = Storage.load(Storage.KEYS.COURT_RATES, {
            memberCovered: 5, nonMemberCovered: 8,
            memberUncovered: 3, nonMemberUncovered: 5
        });

        if (!player || !court) return 0;

        const isCovered = court.winterCover === true;
        const isMember = player.isMember === true;

        if (isCovered) {
            return isMember ? rates.memberCovered : rates.nonMemberCovered;
        } else {
            return isMember ? rates.memberUncovered : rates.nonMemberUncovered;
        }
    },

    bindEvents() {
        // Navigation
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.addEventListener('click', () => this.showTab(btn.dataset.tab));
        });

        // Season toggle
        document.getElementById('season-select').addEventListener('change', (e) => {
            this.currentSeason = e.target.value;
            const settings = Storage.load(Storage.KEYS.SETTINGS, {});
            settings.season = this.currentSeason;
            Storage.save(Storage.KEYS.SETTINGS, settings);
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

        document.getElementById('total-players').textContent = players.length;
        document.getElementById('total-courts').textContent = courts.length;
        document.getElementById('total-matches').textContent = stats.total || 0;
        document.getElementById('scheduled-matches').textContent = scheduled.length;

        // Sezione WhatsApp Import
        document.getElementById('whatsapp-importer').style.display = 'block';
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

                // Create popup
                const popup = document.createElement('div');
                popup.id = 'magnify-popup';
                popup.innerHTML = content;
                popup.style.cssText = `
                    position: fixed;
                    background: #1a1a2e;
                    color: #fff;
                    padding: 20px 25px;
                    border-radius: 12px;
                    font-size: 1.3rem;
                    font-weight: 500;
                    text-align: center;
                    z-index: 99999;
                    box-shadow: 0 10px 40px rgba(0,0,0,0.6);
                    border: 3px solid #2d8a4e;
                    min-width: 200px;
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
                                cellContent = res.players[0];
                            } else {
                                cellClass = 'activity-players';
                                cellContent = filledPlayers.join('<br>');
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
        // Support both desktop (.planning-activity-cell) and mobile (.activity-cell) clicks
        let cell = e.target.closest('.planning-activity-cell');
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
        const allPlayers = Players.getAll() || [];
        console.log(`[MODAL] Apertura. Giocatori presenti in archivio: ${allPlayers.length}`);

        // Get available players to determine who is unavailable
        const availablePlayers = Availability.getAvailablePlayers(dateStr, time, 'singles');
        const availableIds = new Set(availablePlayers.map(p => p.id));

        // Mark players with availability status
        const players = allPlayers.map(p => ({
            ...p,
            isAvailable: availableIds.has(p.id)
        }));

        console.log(`[MODAL] Giocatori disponibili: ${availablePlayers.length}, totali: ${allPlayers.length}`);
        const court = Courts.getById(courtId);
        const dayName = Matching.getDayNameFromDate(dateStr);

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
                                <option value="${p.name}" ${!p.isAvailable ? 'style="color:#999;"' : ''}>${p.name} (${p.level || 'N/A'})${!p.isAvailable ? ' ⚠️' : ''}</option>
                            `).join('')}
                        </select>
                    </div>
                
                <!-- Colonna centrale: Nominativi + Orario -->
                <div class="center-column">
                    <div class="form-group">
                        <label>Nominativi</label>
                        <div class="players-grid-input">
                            <input type="text" id="slot-player-1" class="player-input" placeholder="Giocatore 1" 
                                   value="${existingRes?.players?.[0] || ''}" onfocus="App.setActivePlayerInput(1)">
                            <input type="text" id="slot-player-2" class="player-input" placeholder="Giocatore 2"
                                   value="${existingRes?.players?.[1] || ''}" onfocus="App.setActivePlayerInput(2)">
                            <input type="text" id="slot-player-3" class="player-input" placeholder="Giocatore 3"
                                   value="${existingRes?.players?.[2] || ''}" onfocus="App.setActivePlayerInput(3)">
                            <input type="text" id="slot-player-4" class="player-input" placeholder="Giocatore 4"
                                   value="${existingRes?.players?.[3] || ''}" onfocus="App.setActivePlayerInput(4)">
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
                    </div>
                    
                    <div class="auto-match-section" style="margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.1);">
                        <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                            <label style="font-size: 0.75rem; margin: 0;">Tipo:</label>
                            <select id="match-type-auto" class="filter-select" style="font-size: 0.7rem; padding: 3px 6px;">
                                <option value="singles">Singolo (2)</option>
                                <option value="doubles">Doppio (4)</option>
                            </select>
                            <button class="btn btn-accent btn-sm" onclick="App.autoMatchPlayers('${dateStr}', '${time}')" style="font-size: 0.7rem; padding: 4px 8px;">
                                🔄 Auto Match
                            </button>
                        </div>
                    </div>
                </div>
            </div>
            <input type="hidden" id="selected-type" value="${existingRes?.type || 'match'}">
        `;

        const footer = `
            <div class="modal-footer-buttons">
                <div class="footer-left-buttons">
                    ${hasExisting ? `<button class="btn btn-danger btn-sm" onclick="App.deleteSlotFromModal('${courtId}', '${dayName}')">🗑️ Elimina Range</button>` : ''}
                    <button class="btn btn-warning btn-sm" onclick="App.deleteAllDayReservations('${courtId}', '${dayName}')">📅 Giornata</button>
                    <button class="btn btn-outline btn-sm" onclick="App.clearAllReservations()" style="border-color: #ef4444; color: #ef4444;">🧹 Pulisci Tutto</button>
                </div>
                <div class="footer-right-buttons">
                    <button class="btn btn-secondary" onclick="App.closeModal()">Annulla</button>
                    <button class="btn btn-primary" onclick="App.confirmPlanningSlot('${courtId}', '${dayName}', ${existingResIndex})">
                        ${hasExisting ? '💾 Salva' : '✓ Conferma'}
                    </button>
                </div>
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

        console.log('[CONFIRM] Starting confirmPlanningSlot', { courtId, day, existingIndex });
        console.log('[CONFIRM] Time range:', time, '-', endTime);
        console.log('[CONFIRM] Players:', playersArray);

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
            price: price
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
                    if (r.day === dayName && r.players) {
                        r.players.forEach(playerName => {
                            if (playerName) bookedPlayersToday.add(playerName.toLowerCase());
                        });
                    }
                });
            }
            // Check matches
            if (court.matches) {
                court.matches.forEach(m => {
                    if (m.day === dayName && m.players) {
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
                    if (r.day === dayName && r.players) {
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

        const tbody = document.getElementById('players-tbody');
        if (players.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="empty-state">Nessun giocatore trovato</td></tr>';
            return;
        }

        tbody.innerHTML = players.map(p => `
            <tr data-id="${p.id}">
                <td><strong>${p.name}</strong></td>
                <td>${p.phone || '-'}</td>
                <td><span class="level-badge ${p.level}">${p.level}</span></td>
                <td>
                    <button class="btn-icon send-wa" title="Chiedi Disponibilità">💬</button>
                    <button class="btn-icon edit-player" title="Modifica">✏️</button>
                    <button class="btn-icon delete-player" title="Elimina">🗑️</button>
                </td>
            </tr>
        `).join('');
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

    handlePlayerAction(e) {
        const row = e.target.closest('tr');
        if (!row) return;
        const playerId = row.dataset.id;
        const player = Players.getById(playerId);

        if (e.target.classList.contains('send-wa')) {
            const message = `Ciao ${player.name}! 🎾 Sei disponibile per giocare questa settimana? Rispondi SÌ o NO.`;
            this.openWhatsApp(player.phone, message);
        } else if (e.target.classList.contains('edit-player')) {
            this.showPlayerModal(playerId);
        } else if (e.target.classList.contains('delete-player')) {
            if (confirm('Eliminare questo giocatore?')) {
                Players.delete(playerId);
                Players.renderTable();
                this.updateDashboard();
            }
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

    // Date navigation for header buttons
    changeDay(delta) {
        this.currentPlanningDate.setDate(this.currentPlanningDate.getDate() + delta);
        this.renderPlanning();
        this.renderMobilePlanning();
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
