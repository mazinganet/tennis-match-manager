/**
 * History Module - Storico partite
 */
const History = {
    getAll() {
        return Storage.load(Storage.KEYS.MATCHES, []);
    },

    add(matchData) {
        const matches = this.getAll();
        const newMatch = {
            id: Storage.generateId(),
            date: matchData.date,
            time: matchData.time,
            court: matchData.court,
            type: matchData.type,
            players: matchData.players,
            result: matchData.result || '',
            feedback: matchData.feedback || 0,
            createdAt: new Date().toISOString()
        };
        matches.unshift(newMatch);
        Storage.save(Storage.KEYS.MATCHES, matches);

        // Aggiorna compatibilità in base al feedback
        if (matchData.feedback) {
            this.updateCompatibilityFromFeedback(matchData.players, matchData.feedback);
        }

        return newMatch;
    },

    update(id, data) {
        const matches = this.getAll();
        const index = matches.findIndex(m => m.id === id);
        if (index !== -1) {
            matches[index] = { ...matches[index], ...data };
            Storage.save(Storage.KEYS.MATCHES, matches);

            if (data.feedback) {
                this.updateCompatibilityFromFeedback(matches[index].players, data.feedback);
            }
            return matches[index];
        }
        return null;
    },

    delete(id) {
        const matches = this.getAll().filter(m => m.id !== id);
        Storage.save(Storage.KEYS.MATCHES, matches);
    },

    updateCompatibilityFromFeedback(playerIds, feedback) {
        // Feedback 1-5, converti in delta (-10 a +10)
        const delta = (feedback - 3) * 5;

        for (let i = 0; i < playerIds.length; i++) {
            for (let j = i + 1; j < playerIds.length; j++) {
                const current = Players.getCompatibility(playerIds[i], playerIds[j]);
                const newScore = Math.max(0, Math.min(100, current + delta));
                Players.setCompatibility(playerIds[i], playerIds[j], newScore);
            }
        }
    },

    filter(options = {}) {
        let matches = this.getAll();

        if (options.from) {
            matches = matches.filter(m => m.date >= options.from);
        }
        if (options.to) {
            matches = matches.filter(m => m.date <= options.to);
        }
        if (options.type) {
            matches = matches.filter(m => m.type === options.type);
        }

        return matches;
    },

    getStats() {
        const matches = this.getAll();
        return {
            total: matches.length,
            singles: matches.filter(m => m.type === 'singles').length,
            doubles: matches.filter(m => m.type === 'doubles').length,
            thisMonth: matches.filter(m => {
                const matchDate = new Date(m.date);
                const now = new Date();
                return matchDate.getMonth() === now.getMonth() &&
                    matchDate.getFullYear() === now.getFullYear();
            }).length
        };
    },

    renderTable(filters = {}) {
        const tbody = document.getElementById('history-tbody');
        const matches = this.filter(filters);

        if (matches.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="empty-state">Nessuna partita registrata</td></tr>';
            return;
        }

        tbody.innerHTML = matches.map(m => {
            const playerNames = m.players.map(id => {
                const p = Players.getById(id);
                return p ? p.name : 'Sconosciuto';
            });
            const court = Courts.getById(m.court);

            return `
                <tr data-id="${m.id}">
                    <td>${m.date}</td>
                    <td>${m.time}</td>
                    <td>${court?.name || '-'}</td>
                    <td>${m.type === 'singles' ? 'Singolo' : 'Doppio'}</td>
                    <td>${playerNames.join(', ')}</td>
                    <td>${m.result || '-'}</td>
                    <td>${this.renderStars(m.feedback)}</td>
                    <td>
                        <button class="btn-icon edit-match" title="Modifica">✏️</button>
                        <button class="btn-icon delete-match" title="Elimina">🗑️</button>
                    </td>
                </tr>
            `;
        }).join('');
    },

    renderStars(rating) {
        if (!rating) return '-';
        return '⭐'.repeat(rating) + '☆'.repeat(5 - rating);
    }
};
