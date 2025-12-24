/**
 * Availability Module - Gestione disponibilità giocatori
 */
const Availability = {
    DAYS: ['lunedi', 'martedi', 'mercoledi', 'giovedi', 'venerdi', 'sabato', 'domenica'],

    DAYS_DISPLAY: {
        'lunedi': 'Lunedì', 'martedi': 'Martedì', 'mercoledi': 'Mercoledì',
        'giovedi': 'Giovedì', 'venerdi': 'Venerdì', 'sabato': 'Sabato', 'domenica': 'Domenica'
    },

    addRecurring(playerId, day, from, to) {
        const player = Players.getById(playerId);
        if (!player) return false;
        if (!player.availability) player.availability = { recurring: [], extra: [] };
        player.availability.recurring.push({ day, from, to });
        Players.update(playerId, { availability: player.availability });
        return true;
    },

    removeRecurring(playerId, index) {
        const player = Players.getById(playerId);
        if (!player || !player.availability) return false;
        player.availability.recurring.splice(index, 1);
        Players.update(playerId, { availability: player.availability });
        return true;
    },

    addExtra(playerId, date, from, to) {
        const player = Players.getById(playerId);
        if (!player) return false;
        if (!player.availability) player.availability = { recurring: [], extra: [] };
        player.availability.extra.push({ date, from, to });
        Players.update(playerId, { availability: player.availability });
        return true;
    },

    removeExtra(playerId, index) {
        const player = Players.getById(playerId);
        if (!player || !player.availability) return false;
        player.availability.extra.splice(index, 1);
        Players.update(playerId, { availability: player.availability });
        return true;
    },

    /**
     * Converte HH.mm o HH:mm in minuti totali (es: "08.30" -> 510)
     */
    timeToMin(t) {
        if (!t) return 0;
        const [h, m] = t.replace('.', ':').split(':').map(Number);
        return (h * 60) + (m || 0);
    },

    isAvailable(player, date, time) {
        if (!player) return false;

        const av = player.availability || {};
        const rec = Array.isArray(av.recurring) ? av.recurring : [];
        const ext = Array.isArray(av.extra) ? av.extra : [];

        // REGOLA 1: Se il socio non ha alcuna preferenza salvata (vuoto totale), è SEMPRE LIBERO.
        if (rec.length === 0 && ext.length === 0) return true;

        const targetMin = this.timeToMin(time);

        // REGOLA 2: Se ha degli "Extra" (date specifiche), controlliamo se oggi è una di quelle date.
        const todayExtras = ext.filter(e => e.date === date);
        if (todayExtras.length > 0) {
            // Se ha messo degli orari per OGGI, deve essere compreso in uno di essi.
            const ok = todayExtras.some(e => {
                const s = this.timeToMin(e.from);
                const n = this.timeToMin(e.to);
                return targetMin >= s && targetMin < n;
            });
            if (ok) return true;
            // Se ha extra oggi ma nessuno copre l'ora, lo nascondiamo (priorità su tutto)
            return false;
        }

        // REGOLA 3: Controlliamo i "Ricorrenti" (lunedi, martedi, ecc.)
        const dayName = Matching.getDayNameFromDate(date).toLowerCase();
        const todayRecs = rec.filter(r => r.day.toLowerCase().trim() === dayName);

        if (todayRecs.length > 0) {
            // Se ha specificato orari per questo giorno della settimana, deve esserci dentro.
            const ok = todayRecs.some(r => {
                const s = this.timeToMin(r.from);
                const n = this.timeToMin(r.to);
                return targetMin >= s && targetMin < n;
            });
            return ok;
        }

        // REGOLA 4: Se siamo qui, il socio NON ha alcuna restrizione impostata per OGGI 
        // (nè Extra per la data, nè Ricorrenti per questo giorno della settimana).
        // Quindi è LIBERO, anche se ha degli orari in altri giorni.
        return true;
    },

    getAvailablePlayers(date, time, matchType = 'singles') {
        const players = Players.getAll() || [];

        const filtered = players.filter(p => {
            const isTypeOk = matchType === 'singles' ? (p.playsSingles !== false) : (p.playsDoubles !== false);
            const isTimeOk = this.isAvailable(p, date, time);
            return isTypeOk && isTimeOk;
        });

        console.info(`[AVAIL] Slot ${date} ${time} -> ${filtered.length}/${players.length} soci idonei.`);
        return filtered;
    },

    isTimeInRange(time, from, to) {
        return time >= from && time <= to;
    },

    renderEditor(playerId) {
        const player = Players.getById(playerId);
        const availability = player?.availability || { recurring: [], extra: [] };

        return `
            <div class="availability-editor">
                <h4>Disponibilità Ricorrenti</h4>
                ${this.DAYS.map(day => `
                    <div class="availability-day">
                        <span class="day-name">${this.DAYS_DISPLAY[day]}</span>
                        <div class="time-slots" data-day="${day}">
                            ${(availability.recurring || [])
                .filter(r => r.day === day)
                .map((r, i) => `
                                    <div class="time-slot">
                                        ${r.from} - ${r.to}
                                        <button class="remove-slot" data-index="${i}">×</button>
                                    </div>
                                `).join('')}
                            <button class="add-slot-btn" data-day="${day}">+ Aggiungi</button>
                        </div>
                    </div>
                `).join('')}
                
                <h4 style="margin-top: 20px;">Disponibilità Extra</h4>
                <div id="extra-slots">
                    ${(availability.extra || []).map((e, i) => `
                        <div class="time-slot">
                            ${e.date}: ${e.from} - ${e.to}
                            <button class="remove-extra" data-index="${i}">×</button>
                        </div>
                    `).join('')}
                </div>
                <button class="btn btn-secondary btn-sm" id="add-extra-btn">+ Aggiungi Extra</button>
            </div>
        `;
    }
};
