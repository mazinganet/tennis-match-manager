
const Availability = {
    DAYS: ['lunedi', 'martedi', 'mercoledi', 'giovedi', 'venerdi', 'sabato', 'domenica'],

    timeToMin(t) {
        if (!t) return 0;
        const [h, m] = t.replace('.', ':').split(':').map(Number);
        return (h * 60) + (m || 0);
    },

    isAvailable(player, date, time) {
        const availability = player.availability || {};
        const rec = availability.recurring || [];
        const ext = availability.extra || [];
        if (rec.length === 0 && ext.length === 0) return true;
        const targetMin = this.timeToMin(time);
        const todayExtras = ext.filter(e => e.date === date);
        if (todayExtras.length > 0) {
            const ok = todayExtras.some(e => {
                const s = this.timeToMin(e.from);
                const n = this.timeToMin(e.to);
                return targetMin >= s && targetMin < n;
            });
            if (ok) return true;
        }
        const dateParts = date.split('-');
        const d = new Date(parseInt(dateParts[0]), parseInt(dateParts[1]) - 1, parseInt(dateParts[2]));
        const dayIdx = d.getDay();
        const dayName = this.DAYS[dayIdx === 0 ? 6 : dayIdx - 1];
        const todayRecs = rec.filter(r => r.day === dayName);
        if (todayRecs.length > 0) {
            const ok = todayRecs.some(r => {
                const s = this.timeToMin(r.from);
                const n = this.timeToMin(r.to);
                return targetMin >= s && targetMin < n;
            });
            if (ok) return true;
        }
        return false;
    }
};

const mockPlayers = [
    { name: 'Senza Orari', availability: { recurring: [], extra: [] } },
    { name: 'Lunedì 10-12', availability: { recurring: [{ day: 'lunedi', from: '10.00', to: '12.00' }], extra: [] } }
];

const date = '2025-12-21'; // 2025-12-21 is Sunday (domenica)
const time = '10:00';

console.log('Testing Sunday 10:00:');
mockPlayers.forEach(p => {
    console.log(`${p.name}: ${Availability.isAvailable(p, date, time)}`);
});

const dateMon = '2025-12-22'; // 2025-12-22 is Monday (lunedi)
console.log('\nTesting Monday 10:00:');
mockPlayers.forEach(p => {
    console.log(`${p.name}: ${Availability.isAvailable(p, dateMon, time)}`);
});
