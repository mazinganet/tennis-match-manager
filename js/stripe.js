/**
 * Stripe Payments Module
 * Handles Stripe payment integration for Tennis Match Manager
 */
const StripePayments = {
    stripe: null,
    elements: null,
    cardElement: null,

    /**
     * Initialize Stripe with publishable key
     * @param {string} publishableKey - Stripe publishable key (pk_test_... or pk_live_...)
     */
    init(publishableKey) {
        if (!publishableKey) {
            console.warn('[STRIPE] No publishable key provided');
            return false;
        }

        if (typeof Stripe === 'undefined') {
            console.error('[STRIPE] Stripe.js not loaded');
            return false;
        }

        try {
            this.stripe = Stripe(publishableKey);
            console.log('[STRIPE] Initialized successfully');
            return true;
        } catch (error) {
            console.error('[STRIPE] Initialization error:', error);
            return false;
        }
    },

    /**
     * Get current Stripe configuration
     * @returns {object|null} Stripe configuration object
     */
    getConfig() {
        return Storage.load('stripe_config', null);
    },

    /**
     * Save Stripe configuration
     * @param {object} config - Configuration object
     */
    saveConfig(config) {
        Storage.save('stripe_config', config);
        console.log('[STRIPE] Configuration saved:', config);
    },

    /**
     * Check if Stripe is configured
     * @returns {boolean}
     */
    isConfigured() {
        const config = this.getConfig();
        return !!(config && (config.publishableKey || config.paymentLink));
    },

    /**
     * Open Stripe Checkout or Payment Link
     * For client-side only integration, we'll use Payment Links or redirect
     * @param {number} amount - Amount in EUR
     * @param {string} description - Payment description
     * @param {function} onSuccess - Callback on successful payment
     */
    async openCheckout(amount, description, onSuccess) {
        const config = this.getConfig();

        if (!config) {
            console.error('[STRIPE] No configuration found');
            return { success: false, error: 'No configuration' };
        }

        // If Payment Link is configured, use it
        if (config.paymentLink) {
            // Build URL with parameters
            let url = config.paymentLink;

            // Some Payment Links support prefilled amounts via URL params
            // This depends on how the link was created in Stripe Dashboard
            console.log('[STRIPE] Opening Payment Link:', url);

            // Open in new tab
            const paymentWindow = window.open(url, '_blank', 'width=500,height=700');

            // Show confirmation dialog after opening
            setTimeout(() => {
                const confirmed = confirm(`💳 Pagamento Stripe di €${amount.toFixed(2)} aperto in una nuova finestra.\n\nHai completato il pagamento?`);
                if (confirmed && onSuccess) {
                    onSuccess({ type: 'payment_link', amount });
                }
            }, 2000);

            return { success: true, type: 'payment_link' };
        }

        // If publishable key is available, show embedded card form
        if (config.publishableKey) {
            return this.showCardModal(amount, description, onSuccess);
        }

        return { success: false, error: 'No valid configuration' };
    },

    /**
     * Show card input modal for direct payment
     * Note: This requires a backend to create PaymentIntents for real payments
     * For testing, we simulate the flow
     * @param {number} amount - Amount in EUR
     * @param {string} description - Payment description
     * @param {function} onSuccess - Callback on successful payment
     */
    showCardModal(amount, description, onSuccess) {
        const config = this.getConfig();

        if (!this.init(config.publishableKey)) {
            alert('❌ Errore: Stripe non inizializzato correttamente');
            return { success: false, error: 'Init failed' };
        }

        // Create modal HTML
        const modalHtml = `
            <div id="stripe-payment-modal" class="modal-overlay active" style="z-index: 10001;">
                <div class="modal" style="max-width: 450px;">
                    <div class="modal-header">
                        <h3>💳 Pagamento con Carta</h3>
                        <button class="modal-close" onclick="StripePayments.closeModal()">×</button>
                    </div>
                    <div class="modal-body" style="padding: 20px;">
                        <div style="margin-bottom: 20px; text-align: center;">
                            <div style="font-size: 2rem; font-weight: 700; color: #22c55e;">€${amount.toFixed(2)}</div>
                            <div style="color: var(--text-muted); font-size: 0.9rem;">${description}</div>
                        </div>
                        
                        <div style="margin-bottom: 20px;">
                            <label style="display: block; margin-bottom: 8px; color: var(--text-primary); font-weight: 500;">
                                Dati Carta
                            </label>
                            <div id="stripe-card-element" style="
                                padding: 12px;
                                border: 1px solid var(--border-color);
                                border-radius: 8px;
                                background: var(--bg-card);
                            "></div>
                            <div id="stripe-card-errors" style="color: #ef4444; font-size: 0.85rem; margin-top: 8px;"></div>
                        </div>
                        
                        <div style="background: rgba(96, 165, 250, 0.1); padding: 12px; border-radius: 8px; margin-bottom: 20px; border: 1px solid rgba(96, 165, 250, 0.3);">
                            <p style="color: var(--text-secondary); font-size: 0.85rem; margin: 0;">
                                🧪 <strong>Modalità Test</strong><br>
                                Usa la carta: <code style="background: rgba(0,0,0,0.3); padding: 2px 6px; border-radius: 4px;">4242 4242 4242 4242</code><br>
                                Data: qualsiasi futura | CVV: qualsiasi 3 cifre
                            </p>
                        </div>
                        
                        <div style="display: flex; gap: 10px;">
                            <button class="btn btn-secondary" onclick="StripePayments.closeModal()" style="flex: 1;">
                                Annulla
                            </button>
                            <button id="stripe-submit-btn" class="btn btn-success" onclick="StripePayments.submitPayment()" style="flex: 2; background: linear-gradient(135deg, #635bff, #a855f7);">
                                💳 Paga €${amount.toFixed(2)}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Add modal to page
        document.body.insertAdjacentHTML('beforeend', modalHtml);

        // Store amount and callback for later
        this.pendingAmount = amount;
        this.pendingDescription = description;
        this.pendingOnSuccess = onSuccess;

        // Create Stripe Elements
        this.elements = this.stripe.elements({
            locale: 'it'
        });

        // Card element styles
        const style = {
            base: {
                color: '#ffffff',
                fontFamily: 'Inter, -apple-system, sans-serif',
                fontSmoothing: 'antialiased',
                fontSize: '16px',
                '::placeholder': {
                    color: '#9ca3af'
                }
            },
            invalid: {
                color: '#ef4444',
                iconColor: '#ef4444'
            }
        };

        // Create and mount card element
        this.cardElement = this.elements.create('card', { style });
        this.cardElement.mount('#stripe-card-element');

        // Handle card errors
        this.cardElement.on('change', (event) => {
            const displayError = document.getElementById('stripe-card-errors');
            if (event.error) {
                displayError.textContent = event.error.message;
            } else {
                displayError.textContent = '';
            }
        });

        return { success: true, type: 'card_modal' };
    },

    /**
     * Submit payment from card modal
     * Note: For real payments, this would call your backend to create a PaymentIntent
     * For testing, we simulate success
     */
    async submitPayment() {
        const submitBtn = document.getElementById('stripe-submit-btn');
        const errorDiv = document.getElementById('stripe-card-errors');

        if (!this.cardElement) {
            errorDiv.textContent = 'Errore: Elemento carta non inizializzato';
            return;
        }

        // Disable button and show loading
        submitBtn.disabled = true;
        submitBtn.innerHTML = '⏳ Elaborazione...';

        try {
            // Create token from card (for testing)
            const { token, error } = await this.stripe.createToken(this.cardElement);

            if (error) {
                errorDiv.textContent = error.message;
                submitBtn.disabled = false;
                submitBtn.innerHTML = `💳 Paga €${this.pendingAmount.toFixed(2)}`;
                return;
            }

            console.log('[STRIPE] Token created:', token.id);

            // In production, you would send this token to your backend
            // For now, we simulate a successful payment

            // Simulate processing delay
            await new Promise(resolve => setTimeout(resolve, 1500));

            // Success!
            const result = {
                success: true,
                id: 'test_' + Date.now(),
                token: token.id,
                amount: this.pendingAmount,
                description: this.pendingDescription,
                timestamp: new Date().toISOString()
            };

            // Close modal
            this.closeModal();

            // Show success message
            alert(`✅ Pagamento di €${this.pendingAmount.toFixed(2)} completato!\n\nID Transazione: ${result.id}\n\n⚠️ Nota: Questa è una transazione di TEST. In produzione, il pagamento sarebbe elaborato realmente.`);

            // Call success callback
            if (this.pendingOnSuccess) {
                this.pendingOnSuccess(result);
            }

        } catch (err) {
            console.error('[STRIPE] Payment error:', err);
            errorDiv.textContent = 'Errore durante il pagamento. Riprova.';
            submitBtn.disabled = false;
            submitBtn.innerHTML = `💳 Paga €${this.pendingAmount.toFixed(2)}`;
        }
    },

    /**
     * Close payment modal
     */
    closeModal() {
        const modal = document.getElementById('stripe-payment-modal');
        if (modal) {
            modal.remove();
        }

        // Cleanup
        if (this.cardElement) {
            this.cardElement.destroy();
            this.cardElement = null;
        }
        this.elements = null;
        this.pendingAmount = null;
        this.pendingDescription = null;
        this.pendingOnSuccess = null;
    },

    /**
     * Test Stripe connection
     * @returns {Promise<boolean>}
     */
    async testConnection() {
        const config = this.getConfig();

        if (!config?.publishableKey) {
            return { success: false, error: 'No publishable key configured' };
        }

        if (!this.init(config.publishableKey)) {
            return { success: false, error: 'Failed to initialize Stripe' };
        }

        // Try to create elements (this validates the key)
        try {
            const testElements = this.stripe.elements();
            console.log('[STRIPE] Connection test successful');
            return { success: true };
        } catch (error) {
            console.error('[STRIPE] Connection test failed:', error);
            return { success: false, error: error.message };
        }
    }
};

// Make available globally
window.StripePayments = StripePayments;
