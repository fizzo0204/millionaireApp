/*
 * Id espliciti per ModalController.dismiss(): usati quando più modali possono
 * essere presentate una sopra l'altra (es. AuthService apre la link-reward-modal
 * o richiama Play Games mentre la anonymous-modal è ancora aperta sotto).
 * Senza un id, dismiss() chiude sempre la modale in cima allo stack Ionic,
 * non necessariamente quella giusta. Centralizzati qui (invece che nei
 * componenti stessi) per evitare import circolari con AuthService, che deve
 * poterli referenziare senza importare i componenti che li usano.
 */
export const ANONYMOUS_MODAL_ID = 'anonymous-modal';
export const LINK_REWARD_MODAL_ID = 'link-reward-modal';
