/**
 * Matching Module - Algoritmo accoppiamenti
 */
const Matching = {
    generateMatches(date, matchType = 'singles', playerMatchCounts = null, timeSlots = ['08:00', '09:30', '11:00', '15:00', '16:30', '18:00', '19:30', '21:00']) {
        const settings = Storage.load(Storage.KEYS.SETTINGS, {});
        const season = settings.season || 'winter';
        const minCompatibility = settings.minCompatibility || 30;

        const courts = Courts.getAvailable(season);
        const proposals = [];
        const dayName = this.getDayNameFromDate(date);

        timeSlots.forEach(time => {
            const endTime = this.addTime(time, 90);

            // Trova campi effettivamente liberi per questo slot
            const freeCourts = courts.filter(c => Courts.isFree(c.id, dayName, time, endTime));

            if (freeCourts.length === 0) return;

            // Filtra giocatori disponibili per questo slot
            let availablePlayers = Availability.getAvailablePlayers(date, time, matchType);

            // Filtra ulteriormente per frequenza settimanale se richiesto
            if (playerMatchCounts) {
                availablePlayers = availablePlayers.filter(p => {
                    const count = playerMatchCounts[p.id] || 0;
                    return count < (p.matchesPerWeek || 2);
                });
            }

            if (availablePlayers.length < (matchType === 'singles' ? 2 : 4)) return;

            if (matchType === 'singles') {
                const pairs = this.generateSinglesPairs(availablePlayers, minCompatibility);
                pairs.forEach((pair, i) => {
                    if (freeCourts[i]) {
                        proposals.push({
                            id: Storage.generateId(),
                            date, time,
                            type: 'singles',
                            court: freeCourts[i].id,
                            players: pair.players,
                            score: pair.score,
                            confirmed: false
                        });

                        if (playerMatchCounts) {
                            pair.players.forEach(pId => {
                                playerMatchCounts[pId] = (playerMatchCounts[pId] || 0) + 1;
                            });
                        }
                    }
                });
            } else {
                const teams = this.generateDoublesTeams(availablePlayers, minCompatibility);
                teams.forEach((team, i) => {
                    if (freeCourts[i]) {
                        proposals.push({
                            id: Storage.generateId(),
                            date, time,
                            type: 'doubles',
                            court: freeCourts[i].id,
                            players: team.players,
                            score: team.score,
                            confirmed: false
                        });

                        if (playerMatchCounts) {
                            team.players.forEach(pId => {
                                playerMatchCounts[pId] = (playerMatchCounts[pId] || 0) + 1;
                            });
                        }
                    }
                });
            }
        });

        return proposals;
    },

    generateWeeklyMatches(startDate, matchType = 'singles') {
        const allProposals = [];
        const start = new Date(startDate);
        const playerMatchCounts = {}; // Tracciamento settimanale

        // Genera per i prossimi 7 giorni
        for (let i = 0; i < 7; i++) {
            const current = new Date(start);
            current.setDate(start.getDate() + i);
            const dateString = current.toISOString().split('T')[0];

            const dayProposals = this.generateMatches(dateString, matchType, playerMatchCounts);
            allProposals.push(...dayProposals);
        }

        return allProposals;
    },

    generateSinglesPairs(players, minCompatibility) {
        const pairs = [];
        const used = new Set();

        // Ordina per miglior compatibilità
        const allPairs = [];
        for (let i = 0; i < players.length; i++) {
            for (let j = i + 1; j < players.length; j++) {
                const p1 = players[i], p2 = players[j];
                if (!Players.areLevelsCompatible(p1, p2)) continue;

                const compat = Players.getCompatibility(p1.id, p2.id);
                if (compat < minCompatibility) continue;

                allPairs.push({
                    players: [p1.id, p2.id],
                    score: compat
                });
            }
        }

        allPairs.sort((a, b) => b.score - a.score);

        for (const pair of allPairs) {
            if (!used.has(pair.players[0]) && !used.has(pair.players[1])) {
                pairs.push(pair);
                used.add(pair.players[0]);
                used.add(pair.players[1]);
            }
        }

        return pairs;
    },

    generateDoublesTeams(players, minCompatibility) {
        const teams = [];
        if (players.length < 4) return teams;

        const used = new Set();
        const shuffled = [...players].sort(() => Math.random() - 0.5);

        while (shuffled.length >= 4) {
            const team1 = [shuffled.pop(), shuffled.pop()];
            const team2 = [shuffled.pop(), shuffled.pop()];

            const allPlayers = [...team1, ...team2];
            let totalScore = 0;
            let valid = true;

            for (let i = 0; i < allPlayers.length && valid; i++) {
                for (let j = i + 1; j < allPlayers.length && valid; j++) {
                    const compat = Players.getCompatibility(allPlayers[i].id, allPlayers[j].id);
                    if (compat < minCompatibility) valid = false;
                    totalScore += compat;
                }
            }

            if (valid) {
                teams.push({
                    players: allPlayers.map(p => p.id),
                    score: Math.round(totalScore / 6)
                });
            }
        }

        return teams;
    },

    confirmMatches(proposals) {
        const scheduled = Storage.load(Storage.KEYS.SCHEDULED, []);
        proposals.forEach(p => {
            p.confirmed = true;
            scheduled.push(p);
        });
        Storage.save(Storage.KEYS.SCHEDULED, scheduled);
    },

    getScheduled() {
        return Storage.load(Storage.KEYS.SCHEDULED, []);
    },

    renderProposals(proposals) {
        const container = document.getElementById('matches-list');

        if (!proposals || proposals.length === 0) {
            container.innerHTML = '<p class="empty-state">Nessun accoppiamento trovato</p>';
            return;
        }

        // Raggruppa per data
        const grouped = proposals.reduce((acc, match) => {
            if (!acc[match.date]) acc[match.date] = [];
            acc[match.date].push(match);
            return acc;
        }, {});

        container.innerHTML = Object.keys(grouped).sort().map(date => {
            const dateMatches = grouped[date];
            const dateObj = new Date(date);
            const formattedDate = dateObj.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });

            return `
                <div class="matches-date-group">
                    <h4 class="date-header">📅 ${formattedDate}</h4>
                    ${dateMatches.map(m => {
                const playerNames = m.players.map(id => {
                    const p = Players.getById(id);
                    return p ? p.name : 'Sconosciuto';
                });
                const court = Courts.getById(m.court);
                const scoreClass = m.score >= 70 ? 'high' : m.score >= 50 ? 'medium' : 'low';

                if (m.type === 'singles') {
                    return `
                                <div class="match-item" data-id="${m.id}">
                                    <div>
                                        <div class="match-players">
                                            <span>${playerNames[0]}</span>
                                            <span class="vs-badge">VS</span>
                                            <span>${playerNames[1]}</span>
                                        </div>
                                        <small>${m.time} - ${court?.name || 'Campo TBD'}</small>
                                    </div>
                                    <div class="match-actions" style="display: flex; align-items: center; gap: 8px;">
                                        <div class="compatibility-score ${scoreClass}">
                                            ❤️ ${m.score}%
                                        </div>
                                        <button class="btn-icon send-match-wa" title="Invia Convocazione WhatsApp">💬</button>
                                    </div>
                                </div>
                            `;
                } else {
                    return `
                                <div class="match-item" data-id="${m.id}">
                                    <div>
                                        <div class="match-players">
                                            <span>${playerNames[0]} & ${playerNames[1]}</span>
                                            <span class="vs-badge">VS</span>
                                            <span>${playerNames[2]} & ${playerNames[3]}</span>
                                        </div>
                                        <small>${m.time} - ${court?.name || 'Campo TBD'}</small>
                                    </div>
                                    <div class="match-actions" style="display: flex; align-items: center; gap: 8px;">
                                        <div class="compatibility-score ${scoreClass}">
                                            ❤️ ${m.score}%
                                        </div>
                                        <button class="btn-icon send-match-wa" title="Invia Convocazione WhatsApp">💬</button>
                                    </div>
                                </div>
                            `;
                }
            }).join('')}
                </div>
            `;
        }).join('');
    },

    getDayNameFromDate(dateString) {
        const date = new Date(dateString);
        const days = ['domenica', 'lunedi', 'martedi', 'mercoledi', 'giovedi', 'venerdi', 'sabato'];
        return days[date.getDay()];
    },

    addTime(time, minutes) {
        let [h, m] = time.split(':').map(Number);
        m += minutes;
        h += Math.floor(m / 60);
        m = m % 60;
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }
};
