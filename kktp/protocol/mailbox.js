// kktp-core/mailbox.js

export class Mailbox {
  constructor(portal, stateMachine, mailboxId) {
    this.portal = portal;
    this.stateMachine = stateMachine; // Bind the State Machine directly
    this.mailboxId = mailboxId;
    this.prefix = `KKTP:${mailboxId}:`;
    this.onMessageCallback = null;
    this._setupListener();
  }

  _setupListener() {
    this.portal.scanner.addPrefix(this.prefix);
    this.portal.onNewTransactionMatch((match) => {
      this._handleIncomingMatch(match);
    });
  }

  async _handleIncomingMatch(match) {
    try {
      const jsonStr = match.decodedPayload.substring(this.prefix.length);
      const msg = JSON.parse(jsonStr);

      // DELEGATE EVERYTHING:
      // Validation, Decryption, Reordering, and Buffer Limits
      // are all handled by the State Machine in one place.
      const readyMessages = this.stateMachine.receiveMessage(msg);

      // If the State Machine says these are contiguous and verified, fire the callback
      if (readyMessages.length > 0 && this.onMessageCallback) {
        readyMessages.forEach(plaintext => this.onMessageCallback(plaintext));
      }
    } catch (e) {
      // Log failure but don't crash the scanner.
      // If it's an integrity violation, stateMachine will move to FAULTED.
      console.warn("KKTP Transport Error:", e.message);
    }
  }

  onMessage(cb) {
    this.onMessageCallback = cb;
  }
}
