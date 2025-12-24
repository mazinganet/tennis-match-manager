/**
 * Firebase Configuration - Tennis Match Manager
 * 
 * ISTRUZIONI PER CONFIGURARE FIREBASE:
 * 
 * 1. Vai su https://console.firebase.google.com
 * 2. Clicca "Aggiungi progetto" e chiamalo "tennis-match-manager"
 * 3. Disabilita Google Analytics (non serve)
 * 4. Una volta creato, vai su "Realtime Database" nel menu laterale
 * 5. Clicca "Crea database" e scegli la regione più vicina (es. europe-west1)
 * 6. Scegli "Avvia in modalità test" (le regole si sistemeranno dopo)
 * 7. Vai su Impostazioni (icona ingranaggio) > Impostazioni progetto
 * 8. Scorri fino a "Le tue app" e clicca l'icona Web (</>)
 * 9. Registra l'app con un nome (es. "tennis-manager-web")
 * 10. Copia i valori firebaseConfig qui sotto
 */

const firebaseConfig = {
    apiKey: "AIzaSyA9TI0w5rMvl0YNcDBaKAtNgxMpFEZL0lk",
    authDomain: "prenota-5062d.firebaseapp.com",
    databaseURL: "https://prenota-5062d-default-rtdb.firebaseio.com",
    projectId: "prenota-5062d",
    storageBucket: "prenota-5062d.firebasestorage.app",
    messagingSenderId: "1042421630778",
    appId: "1:1042421630778:web:ede08e4c3e33d95d103203"
};

// Inizializza Firebase
let database = null;
let firebaseReady = false;

function initFirebase() {
    try {
        // Verifica che l'SDK Firebase sia caricato
        if (typeof firebase === 'undefined') {
            console.error("❌ Firebase SDK non caricato! Verifica la connessione internet.");
            return false;
        }

        if (firebaseConfig.apiKey === "YOUR_API_KEY") {
            console.warn("⚠️ Firebase non configurato! Usando localStorage come fallback.");
            return false;
        }

        // Evita doppia inizializzazione
        if (firebase.apps && firebase.apps.length > 0) {
            console.log("ℹ️ Firebase già inizializzato");
            database = firebase.database();
            firebaseReady = true;
            return true;
        }

        firebase.initializeApp(firebaseConfig);
        database = firebase.database();
        firebaseReady = true;
        console.log("✅ Firebase inizializzato correttamente!");
        console.log("   Database URL:", firebaseConfig.databaseURL);
        return true;
    } catch (error) {
        console.error("❌ Errore inizializzazione Firebase:", error);
        console.error("   Dettagli:", error.message);
        return false;
    }
}

// Inizializza subito
initFirebase();
