/**
 * Courts Module - Gestione campi
 */
const Courts = {
    getAll() {
        const courts = Storage.load(Storage.KEYS.COURTS, []);
        return Array.isArray(courts) ? courts : [];
    },

    getById(id) {
        return this.getAll().find(c => c.id === id);
    },

    getBySeason(season) {
        const all = this.getAll();
        if (!all || !Array.isArray(all)) return [];
        return all.filter(c => c && c.type === season);
    },

    getAvailable(season) {
        return this.getBySeason(season).filter(c => c.available);
    },

    add(courtData) {
        const courts = this.getAll();
        const newCourt = {
            id: Storage.generateId(),
            name: courtData.name,
            type: courtData.type || 'winter',
            surface: courtData.surface || 'terra-rossa',
            winterCover: courtData.winterCover || false,
            available: true,
            reservations: []
        };
        courts.push(newCourt);
        Storage.save(Storage.KEYS.COURTS, courts);
        return newCourt;
    },

    update(id, data) {
        const courts = this.getAll();
        const index = courts.findIndex(c => c.id === id);
        if (index !== -1) {
            courts[index] = { ...courts[index], ...data };
            Storage.save(Storage.KEYS.COURTS, courts);
            return courts[index];
        }
        return null;
    },

    delete(id) {
        const courts = this.getAll().filter(c => c.id !== id);
        Storage.save(Storage.KEYS.COURTS, courts);
    },

    toggleAvailability(id) {
        const court = this.getById(id);
        if (court) {
            this.update(id, { available: !court.available });
        }
    },

    isFree(courtId, day, from, to, date = null) {
        const court = this.getById(courtId);
        if (!court || !court.available) return false;

        // Se non ci sono prenotazioni fisse, il campo è potenzialmente libero
        if (!court.reservations) return true;

        // Verifica sovrapposizioni con prenotazioni fisse
        return !court.reservations.some(res => {
            // Check by date if available, otherwise by day name
            const dateMatch = date && res.date ? res.date === date : res.day === day;
            if (!dateMatch) return false;
            // Sovrapposizione oraria: (StartA < EndB) AND (EndA > StartB)
            return (from < res.to && to > res.from);
        });
    },

    addReservation(courtId, reservation) {
        const court = this.getById(courtId);
        if (court) {
            const reservations = court.reservations || [];
            reservations.push(reservation);
            this.update(courtId, { reservations });
            return true;
        }
        return false;
    },

    removeReservation(courtId, index) {
        const court = this.getById(courtId);
        if (court && court.reservations) {
            const reservations = [...court.reservations];
            reservations.splice(index, 1);
            this.update(courtId, { reservations });
            return true;
        }
        return false;
    },

    renderGrid(season) {
        const container = document.getElementById('courts-grid');
        const courts = this.getBySeason(season);

        if (courts.length === 0) {
            container.innerHTML = '<p class="empty-state">Nessun campo configurato per questa stagione</p>';
            return;
        }

        container.innerHTML = courts.map(c => {
            const winterCoverBadge = c.winterCover
                ? '<div style="margin-top: 8px; color: #60a5fa; font-weight: 500;">❄️ Coperto in inverno</div>'
                : '<div style="margin-top: 8px; color: #f87171; font-weight: 500;">☀️ Non coperto</div>';
            return `
                <div class="court-card ${c.type}" data-id="${c.id}">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                        <h4>🏟️ ${c.name}</h4>
                    </div>
                    <div class="court-info">
                        <span>Superficie: <strong>${this.formatSurface(c.surface)}</strong></span>
                        ${winterCoverBadge}
                    </div>
                    <div style="margin-top: 12px; display: flex; gap: 8px;">
                        <button class="btn btn-sm btn-secondary edit-court">✏️ Modifica</button>
                        <button class="btn btn-sm btn-danger delete-court">🗑️ Elimina</button>
                    </div>
                </div>
            `;
        }).join('');
    },

    formatSurface(surface) {
        const surfaces = {
            'terra-rossa': 'Terra Rossa',
            'cemento': 'Cemento',
            'sintetico': 'Sintetico',
            'erba': 'Erba'
        };
        return surfaces[surface] || surface;
    }
};
