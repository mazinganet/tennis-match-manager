/**
 * Seed Players - Script per importare la lista iniziale di giocatori
 */
(function () {
    const SEED_KEY = 'tennis_seed_players_v1';

    if (localStorage.getItem(SEED_KEY)) {
        console.log('Seed giocatori già applicato.');
        return;
    }

    const playersToSeed = [
        "Brunelli Alberto", "Barbieri Jessica", "Belli Alice", "Benedettini Manuela",
        "Berardi Fabrizio", "Bracciale David", "Cantelli Ruggero", "Capicchioni A",
        "Garavini Marco", "Gasponi Nadia", "Lazzarini Aldo", "Mazzeo Andrea",
        "Monticelli Ivano", "Razzani Erika", "Renzi Roberto", "Rinaldi Roberto",
        "Rossi Maurizio", "Russo Mario", "Sacchini Roberto", "Soriano Bernadette",
        "Spada Francesco", "Stefanelli Francesca", "Storoni Marco", "Tognacci Max",
        "Urbinati Fabiano", "Venditti Adolfo", "Zamagni Marco", "Zamponi Luigi"
    ];

    console.log('Inizio seeding giocatori...');

    // Aspetta che i moduli siano caricati
    window.addEventListener('load', () => {
        if (typeof Players === 'undefined' || typeof Storage === 'undefined') {
            console.error('Moduli non pronti per il seeding');
            return;
        }

        const existingPlayers = Players.getAll();
        let addedCount = 0;

        playersToSeed.forEach(name => {
            // Verifica duplicati per nome
            if (!existingPlayers.some(p => p.name.toLowerCase() === name.toLowerCase())) {
                Players.add({
                    name: name,
                    phone: '',
                    level: 'intermedio',
                    playsSingles: true,
                    playsDoubles: true
                });
                addedCount++;
            }
        });

        localStorage.setItem(SEED_KEY, 'true');
        console.log(`Seeding completato: aggiunti ${addedCount} nuovi giocatori.`);

        // Forza refresh se siamo nella tab giocatori
        if (typeof App !== 'undefined') {
            Players.renderTable();
            App.updateDashboard();
        }
    });
})();
