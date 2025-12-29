/**
 * Players Module - Gestione giocatori
 */
const Players = {
    getAll() {
        return Storage.load(Storage.KEYS.PLAYERS, []);
    },

    getById(id) {
        return this.getAll().find(p => p.id === id);
    },

    add(playerData) {
        const players = this.getAll();
        const newPlayer = {
            id: Storage.generateId(),
            name: playerData.name,
            phone: playerData.phone || '',
            level: playerData.level,
            playsSingles: playerData.playsSingles !== false,
            playsDoubles: playerData.playsDoubles !== false,
            matchesPerWeek: playerData.matchesPerWeek || 2,
            availability: playerData.availability || { recurring: [], extra: [] },
            compatibility: {},
            preferredPlayers: playerData.preferredPlayers || [],
            avoidPlayers: playerData.avoidPlayers || [],
            isMember: playerData.isMember || false,
            createdAt: new Date().toISOString()
        };
        players.push(newPlayer);
        Storage.save(Storage.KEYS.PLAYERS, players);
        return newPlayer;
    },

    update(id, data) {
        const players = this.getAll();
        const index = players.findIndex(p => p.id === id);
        if (index !== -1) {
            players[index] = { ...players[index], ...data };
            Storage.save(Storage.KEYS.PLAYERS, players);
            return players[index];
        }
        return null;
    },

    delete(id) {
        const players = this.getAll().filter(p => p.id !== id);
        Storage.save(Storage.KEYS.PLAYERS, players);
        // Rimuovi riferimenti di compatibilità
        players.forEach(p => {
            if (p.compatibility && p.compatibility[id]) {
                delete p.compatibility[id];
            }
        });
        Storage.save(Storage.KEYS.PLAYERS, players);
    },

    updateLevel(id, newLevel) {
        this.update(id, { level: newLevel });
        this.renderTable(); // Refresh per aggiornare i colori
    },

    setCompatibility(player1Id, player2Id, score) {
        const players = this.getAll();
        const p1 = players.find(p => p.id === player1Id);
        const p2 = players.find(p => p.id === player2Id);
        if (p1 && p2) {
            if (!p1.compatibility) p1.compatibility = {};
            if (!p2.compatibility) p2.compatibility = {};
            p1.compatibility[player2Id] = score;
            p2.compatibility[player1Id] = score;
            Storage.save(Storage.KEYS.PLAYERS, players);
        }
    },

    getCompatibility(player1Id, player2Id) {
        const p1 = this.getById(player1Id);
        const p2 = this.getById(player2Id);

        if (!p1 || !p2) return 50;

        // Veto (Non vuole giocare con)
        if ((p1.avoidPlayers && p1.avoidPlayers.includes(player2Id)) ||
            (p2.avoidPlayers && p2.avoidPlayers.includes(player1Id))) {
            return 0;
        }

        // Preferenze (Vuole giocare con)
        if (p1.preferredPlayers && p1.preferredPlayers.includes(player2Id) &&
            p2.preferredPlayers && p2.preferredPlayers.includes(player1Id)) {
            return 100;
        }

        if ((p1.preferredPlayers && p1.preferredPlayers.includes(player2Id)) ||
            (p2.preferredPlayers && p2.preferredPlayers.includes(player1Id))) {
            return 80;
        }

        // Fallback su punteggio numerico (storico feedback)
        if (p1.compatibility && p1.compatibility[player2Id] !== undefined) {
            return p1.compatibility[player2Id];
        }

        return 50; // Default neutro
    },

    getLevelValue(level) {
        const levels = { 'principiante': 1, 'medio': 2, 'intermedio': 2, 'avanzato': 3, 'agonista': 4 };
        return levels[level] || 2;
    },

    areLevelsCompatible(player1, player2) {
        const settings = Storage.load(Storage.KEYS.SETTINGS, {});
        const maxDiff = settings.maxLevelDifference || 1;
        const diff = Math.abs(this.getLevelValue(player1.level) - this.getLevelValue(player2.level));
        return diff <= maxDiff;
    },

    search(query, levelFilter = '') {
        let players = this.getAll();
        if (query) {
            const q = query.toLowerCase();
            players = players.filter(p => p.name.toLowerCase().includes(q));
        }
        if (levelFilter) {
            players = players.filter(p => p.level === levelFilter);
        }
        return players;
    },

    renderTable(players) {
        const tbody = document.getElementById('players-tbody');
        const allPlayers = players || this.getAll();

        if (allPlayers.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="empty-state">Nessun giocatore trovato</td></tr>';
            return;
        }

        // Create options for player dropdowns (for preferences/vetos)
        const createPlayerOptions = (currentPlayerId, selectedIds = []) => {
            return this.getAll() // Always use full list for options
                .filter(p => p.id !== currentPlayerId)
                .map(p => {
                    const isSelected = selectedIds.includes(p.id);
                    return `<option value="${p.id}" ${isSelected ? 'selected' : ''}>${p.name}</option>`;
                })
                .join('');
        };

        // Format availability for display
        const formatTimePrefs = (player) => {
            const av = player.availability;
            if (!av || !av.recurring || av.recurring.length === 0) {
                return '<span class="text-muted">-</span>';
            }
            const prefs = av.recurring.map(r => {
                const dayShort = r.day.substring(0, 3);
                return `${dayShort} ${r.from}-${r.to}`;
            });
            // Show first 2 and "..." if more
            if (prefs.length > 2) {
                return `<span class="time-prefs-compact">${prefs.slice(0, 2).join('<br>')}<br>+${prefs.length - 2}</span>`;
            }
            return `<span class="time-prefs-compact">${prefs.join('<br>')}</span>`;
        };

        // Get names for preferred/avoid players
        const getPlayerNames = (ids) => {
            if (!ids || ids.length === 0) return '-';
            return ids.map(id => {
                const p = this.getById(id);
                return p ? p.name.split(' ')[0] : '?';
            }).join(', ');
        };

        tbody.innerHTML = allPlayers.map(p => {
            const preferredNames = getPlayerNames(p.preferredPlayers);
            const avoidNames = getPlayerNames(p.avoidPlayers);

            return `
            <tr data-id="${p.id}">
                <td><strong>${p.name}</strong></td>
                <td class="phone-cell">${p.phone || '-'}</td>
                <td>
                    <select class="level-select level-${p.level || ''}" onchange="Players.updateLevel('${p.id}', this.value)">
                        <option value="principiante" ${p.level === 'principiante' ? 'selected' : ''}>Princ.</option>
                        <option value="intermedio" ${p.level === 'intermedio' ? 'selected' : ''}>Inter.</option>
                        <option value="avanzato" ${p.level === 'avanzato' ? 'selected' : ''}>Avanz.</option>
                        <option value="agonista" ${p.level === 'agonista' ? 'selected' : ''}>Agon.</option>
                    </select>
                </td>
                <td class="member-cell">${p.isMember ? '✅' : '❌'}</td>
                <td class="time-prefs-cell">${formatTimePrefs(p)}</td>
                <td style="text-align: center;">
                    <button class="btn-icon view-relations" title="Gestisci Preferenze e Veti">⚙️</button>
                    ${(p.preferredPlayers?.length > 0 || p.avoidPlayers?.length > 0) ? '<span style="font-size:0.7rem;">✓</span>' : ''}
                </td>
                <td class="admin-only-column">
                    <button class="btn-icon send-wa" title="Chiedi Disponibilità">💬</button>
                    <button class="btn-icon edit-player" title="Modifica">✏️</button>
                    <button class="btn-icon delete-player" title="Elimina">🗑️</button>
                </td>
            </tr>
        `}).join('');
    },

    // Update preferences or vetos from dropdown
    updatePreferences(playerId, type, selectEl) {
        const selectedIds = Array.from(selectEl.selectedOptions).map(opt => opt.value);
        const updateData = type === 'preferred'
            ? { preferredPlayers: selectedIds }
            : { avoidPlayers: selectedIds };
        this.update(playerId, updateData);
        // Don't re-render immediately to avoid losing focus
    },

    setRelation(playerId, targetId, type, isActive) {
        const player = this.getById(playerId);
        if (!player) return;

        // Initialize arrays if missing
        if (!player.preferredPlayers) player.preferredPlayers = [];
        if (!player.avoidPlayers) player.avoidPlayers = [];

        // Remove from both first to ensure no duplicates or conflicts
        player.preferredPlayers = player.preferredPlayers.filter(id => id !== targetId);
        player.avoidPlayers = player.avoidPlayers.filter(id => id !== targetId);

        if (isActive) {
            // Add to the specific type
            if (type === 'preferred') player.preferredPlayers.push(targetId);
            if (type === 'avoid') player.avoidPlayers.push(targetId);
        }

        this.update(playerId, {
            preferredPlayers: player.preferredPlayers,
            avoidPlayers: player.avoidPlayers
        });

        // Render table to show the checkmark if needed, but only if we are not in modal loop
        // this.renderTable(); 
    },

    formatAvailability(availability) {
        if (!availability || !availability.recurring || availability.recurring.length === 0) {
            return '<span class="text-muted">Non impostata</span>';
        }
        const days = availability.recurring.map(r => r.day.substring(0, 3)).join(', ');
        return days;
    }
};
