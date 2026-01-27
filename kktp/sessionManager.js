import { KKTPProtocol } from "./protocol/kktpProtocol.js";
import { KKTPStateMachine } from "./protocol/stateMachine.js";
import {
  canonicalize,
  prepareForSigning,
  strictParseJson,
} from "./protocol/integrity/canonical.js";
import { hexToString } from "../wrapper/utilities/utilities.js";
import { SessionPersistence } from "./sessionPersistence.js";
import {
  buildAnchorPayload,
  getExpectedEndMs,
  parseKKTPPayload,
  validateAnchorOrThrow,
  extractResumeState,
  applyResumeState,
  zeroOutSessionKey,
} from "./smHelpers.js";

export class SessionManager {
  constructor(portal) {
    this.portal = portal;

    const sm = new KKTPStateMachine(portal, true, 0);
    this.kktpProtocol = new KKTPProtocol(sm);

    this._kktpSessions = new Map();
    this._kktpPendingDiscoveries = new Map();
    this._kktpKeyIndex = 0;
    this._persistConfig = null;
    this._persistQueue = new Set();
    this._persistTimer = null;
    this._persistence = new SessionPersistence();
  }

  // --- KKTP Protocol Helpers ---

  async signAnchor(anchor) {
    if (!this.portal.identity.wallet?.walletInitialized) {
      throw new Error("KaspaPortal: Wallet must be initialized.");
    }
    const { sig } = await this.portal.generateIdentityKeys(0);
    return await this.kktpProtocol.signAnchor(anchor, sig.privateKey);
  }

  prepareForVerification(anchor) {
    return this.kktpProtocol.prepareForVerification(anchor);
  }

  canonicalize(obj) {
    return this.kktpProtocol.canonicalize(obj);
  }

  toPlainJson(value) {
    return this.kktpProtocol.toPlainJson(value);
  }

  strictParseJson(value) {
    return KKTPProtocol.strictParseJson(value);
  }

  configureResumePersistence({
    storageKeyPrefix = "kktp_resume_",
    encryptFn = null,
    throttleMs = 250,
    includeMessages = true,
  } = {}) {
    this._persistConfig = {
      storageKeyPrefix,
      encryptFn,
      throttleMs,
      includeMessages,
    };
    return this._persistConfig;
  }

  // --- Session Lifecycle ---

  async broadcastDiscovery(meta, options = {}) {
    const { amount = "1", toAddress } = options;

    const ctx = this._createKktpContext(true);
    const { discovery } = await ctx.protocol.createDiscoveryAnchor(meta);

    this._kktpPendingDiscoveries.set(discovery.sid, {
      ...ctx,
      discovery,
      createdAt: Date.now(),
    });

    const payload = buildAnchorPayload(discovery);
    const address = toAddress ?? (await this.portal.identity.address);

    await this.portal.send({
      toAddress: address,
      amount,
      payload,
    });

    return { discovery, payload };
  }

  async connectToPeer(discoveryAnchor, options = {}) {
    const { amount = "1", toAddress } = options;

    const ctx = this._createKktpContext(false);
    const { response } =
      await ctx.protocol.createResponseAnchor(discoveryAnchor);

    const mailboxId = ctx.protocol.sm.kktp.mailboxId;
    this._kktpSessions.set(mailboxId, {
      ...ctx,
      discovery: discoveryAnchor,
      response,
      messages: [],
      peerPubSig: discoveryAnchor.pub_sig,
      isInitiator: false,
      createdAt: Date.now(),
    });

    const payload = buildAnchorPayload(response);
    const address = toAddress ?? (await this.portal.identity.address);

    await this.portal.send({
      toAddress: address,
      amount,
      payload,
    });

    return { response, mailboxId, payload };
  }

  async sendMessage(mailboxId, plaintext, options = {}) {
    const { amount = "1", toAddress } = options;

    const session = this._kktpSessions.get(mailboxId);
    if (!session) {
      throw new Error(
        `KaspaPortal: No KKTP session for mailboxId ${mailboxId}`,
      );
    }

    const canonicalMessage = session.protocol.createMessageAnchor(plaintext);
    const payload = `KKTP:${mailboxId}:${canonicalMessage}`;
    const address = toAddress ?? (await this.portal.identity.address);

    await this.portal.send({
      toAddress: address,
      amount,
      payload,
    });

    session.messages = session.messages || [];
    session.messages.push({
      id: crypto.randomUUID(),
      direction: session.sm.isInitiator ? "AtoB" : "BtoA",
      plaintext,
      timestamp: Date.now(),
      status: "pending",
      isOutbound: true,
    });

    this._schedulePersist(mailboxId);

    return { payload };
  }

  async processIncomingPayload(rawPayload) {
    const parsed = parseKKTPPayload(rawPayload);
    if (!parsed) return null;

    if (parsed.type === "anchor") {
      return await this._handleIncomingAnchor(parsed.anchor);
    }

    if (parsed.type === "message") {
      return this._handleIncomingMessage(parsed.mailboxId, parsed.message);
    }

    return null;
  }

  async restoreSessions(snapshot, { skipExpired = true } = {}) {
    if (!snapshot || !Array.isArray(snapshot.sessions)) return;

    for (const s of snapshot.sessions) {
      if (!s || !s.discovery) continue;

      const expectedEndMs = getExpectedEndMs(s.discovery, s.createdAt);
      if (skipExpired && expectedEndMs && Date.now() > expectedEndMs) continue;

      const ctx = this._createKktpContext(!!s.isInitiator, s.keyIndex);

      if (s.isInitiator) {
        this._kktpPendingDiscoveries.set(s.discovery.sid, {
          ...ctx,
          discovery: s.discovery,
          createdAt: s.createdAt || Date.now(),
        });

        if (s.response) {
          try {
            await ctx.protocol.processIncoming(s.response);
          } catch {
            this._kktpPendingDiscoveries.delete(s.discovery.sid);
            continue;
          }

          const mailboxId = ctx.sm?.kktp?.mailboxId || s.mailboxId;
          this._kktpSessions.set(mailboxId, {
            ...ctx,
            discovery: s.discovery,
            response: s.response,
            messages: s.messages || [],
            peerPubSig: s.peerPubSig || s.response?.pub_sig_resp || null,
            isInitiator: true,
            createdAt: s.createdAt || Date.now(),
          });

          this._kktpPendingDiscoveries.delete(s.discovery.sid);
        }
      } else {
        try {
          await ctx.protocol.processIncoming(s.discovery);
          if (s.response) {
            await ctx.protocol.processIncoming(s.response);
          }
        } catch {
          continue;
        }

        const mailboxId = s.mailboxId || ctx.sm?.kktp?.mailboxId;
        this._kktpSessions.set(mailboxId, {
          ...ctx,
          discovery: s.discovery,
          response: s.response || null,
          messages: s.messages || [],
          peerPubSig: s.peerPubSig || s.discovery?.pub_sig || null,
          isInitiator: false,
          createdAt: s.createdAt || Date.now(),
        });
      }
    }
  }

  closeSession(mailboxId) {
    const session = this._kktpSessions.get(mailboxId);
    if (!session) return false;
    void this._removeResumeState(session);
    session.sm.terminate();
    this._kktpSessions.delete(mailboxId);
    return true;
  }

  getSessions() {
    return Array.from(this._kktpSessions.entries()).map(
      ([mailboxId, session]) => ({
        mailboxId,
        ...session,
      }),
    );
  }

  exportSessions({ includeMessages = true } = {}) {
    const sessions = [];
    for (const [mailboxId, s] of this._kktpSessions.entries()) {
      sessions.push({
        mailboxId,
        keyIndex: s.keyIndex,
        isInitiator: !!s.isInitiator,
        createdAt: s.createdAt || Date.now(),
        discovery: s.discovery || null,
        response: s.response || null,
        peerPubSig: s.peerPubSig || null,
        messages: includeMessages ? s.messages || [] : [],
      });
    }
    return {
      version: 1,
      savedAt: Date.now(),
      sessions,
    };
  }

  pruneExpiredSessions(nowMs = Date.now()) {
    for (const [mailboxId, s] of this._kktpSessions.entries()) {
      const expectedEndMs = getExpectedEndMs(s.discovery, s.createdAt);
      if (expectedEndMs && nowMs > expectedEndMs) {
        void this._removeResumeState(s);
        this._kktpSessions.delete(mailboxId);
      }
    }
  }

  isSessionExpired(mailboxId, nowMs = Date.now()) {
    const s = this._kktpSessions.get(mailboxId);
    if (!s) return true;
    const expectedEndMs = getExpectedEndMs(s.discovery, s.createdAt);
    if (!expectedEndMs) return false;
    return nowMs > expectedEndMs;
  }

  // --- Sovereign Resume ---

  async resumeSession({
    sid,
    startHash,
    maxSeconds = 30,
    logFn,
    decryptFn,
    encryptFn,
    storageKeyPrefix = "kktp_resume_",
    meta = {},
  } = {}) {
    logFn = typeof logFn === "function" ? logFn : () => {};

    const record = sid
      ? await this._persistence.getResumeRecord(storageKeyPrefix, sid)
      : await this._persistence.findLatestResumeRecord(storageKeyPrefix);

    if (!record?.data) return { status: "no_resume_blob" };

    const raw = record.data;

    let resumeData;
    try {
      if (decryptFn) {
        const decrypted = await decryptFn(raw);
        resumeData = strictParseJson(decrypted) || decrypted;
      } else {
        resumeData = strictParseJson(raw);
      }
    } catch (err) {
      throw new Error(`resumeSession: decrypt failed: ${err.message}`);
    }

    if (!resumeData?.mailbox_id || !resumeData?.K_session) {
      throw new Error("resumeSession: invalid resume blob");
    }

    const oldMailboxId = resumeData.mailbox_id;
    const oldSid = resumeData.sid || sid || resumeData.discovery?.sid || "";
    const scanStartHash =
      startHash ||
      resumeData.startHash ||
      resumeData.last_block_hash ||
      resumeData.discovery_block_hash;

    if (!scanStartHash) {
      throw new Error("resumeSession: startHash is required");
    }

    const oldCtx = this._createKktpContext(
      resumeData.isInitiator ?? true,
      resumeData.keyIndex ?? null,
    );
    applyResumeState(oldCtx, resumeData);

    this._kktpSessions.set(oldMailboxId, {
      ...oldCtx,
      discovery: resumeData.discovery || null,
      response: resumeData.response || null,
      messages: resumeData.messages || [],
      peerPubSig: resumeData.remote_pub_sig || null,
      isInitiator: !!resumeData.isInitiator,
      createdAt: resumeData.createdAt || Date.now(),
    });

    let peerHandover = null;
    await this.portal.syncFrom(scanStartHash, logFn, {
      maxSeconds,
      prefixes: [`KKTP:${oldMailboxId}:`],
      onTransactionMatch: [
        ({ tx }) => {
          const payloadHex = tx?.payload || "";
          if (!payloadHex) return false;

          let rawPayload = "";
          try {
            rawPayload = hexToString(payloadHex);
          } catch {
            return false;
          }

          const parsed = parseKKTPPayload(rawPayload);
          if (parsed?.type !== "message") return false;

          const event = this._handleIncomingMessage(
            parsed.mailboxId,
            parsed.message,
          );
          const messages = event?.messages || [];
          for (const msg of messages) {
            const obj = JSON.parse(msg);
            if (obj?.intent === "handover" && obj?.new_anchor) {
              peerHandover = obj;
              return true;
            }
          }
          return false;
        },
      ],
    });

    if (peerHandover?.new_anchor) {
      const { mailboxId } = await this.connectToPeer(peerHandover.new_anchor);
      return {
        status: "pivoted",
        mailboxId,
        newSid: peerHandover.new_sid || peerHandover.new_anchor?.sid,
      };
    }

    const newCtx = this._createKktpContext(true);
    const { discovery } = await newCtx.protocol.createDiscoveryAnchor(meta);

    this._kktpPendingDiscoveries.set(discovery.sid, {
      ...newCtx,
      discovery,
      createdAt: Date.now(),
    });

    let responseAnchor = null;
    await this.portal.syncFrom(scanStartHash, logFn, {
      maxSeconds,
      prefixes: ["KKTP:ANCHOR:"],
      onTransactionMatch: [
        ({ tx }) => {
          const payloadHex = tx?.payload || "";
          if (!payloadHex) return false;

          let rawPayload = "";
          try {
            rawPayload = hexToString(payloadHex);
          } catch {
            return false;
          }

          const parsed = parseKKTPPayload(rawPayload);
          if (
            parsed?.type === "anchor" &&
            parsed.anchor.type === "response" &&
            parsed.anchor.sid === discovery.sid
          ) {
            responseAnchor = parsed.anchor;
            return true;
          }
          return false;
        },
      ],
    });

    if (!responseAnchor) {
      await this.sendMessage(
        oldMailboxId,
        JSON.stringify({
          intent: "handover",
          new_sid: discovery.sid,
          new_anchor: discovery,
        }),
      );

      return {
        status: "handover_pending",
        newSid: discovery.sid,
      };
    }

    await this._handleIncomingAnchor(responseAnchor);
    const found = this._findSessionByDiscoverySid(discovery.sid);
    if (!found) {
      return { status: "handover_failed", reason: "session_not_established" };
    }

    const newMailboxId = found.mailboxId;
    let lockAchieved = false;

    await this.portal.syncFrom(scanStartHash, logFn, {
      maxSeconds,
      prefixes: [`KKTP:${newMailboxId}:`],
      onTransactionMatch: [
        ({ tx }) => {
          const payloadHex = tx?.payload || "";
          if (!payloadHex) return false;

          let rawPayload = "";
          try {
            rawPayload = hexToString(payloadHex);
          } catch {
            return false;
          }

          const parsed = parseKKTPPayload(rawPayload);
          if (parsed?.type !== "message") return false;

          const event = this._handleIncomingMessage(
            parsed.mailboxId,
            parsed.message,
          );
          if (event?.messages?.length > 0) {
            lockAchieved = true;
            return true;
          }
          return false;
        },
      ],
    });

    if (!lockAchieved) {
      return {
        status: "handover_no_lock",
        newMailboxId,
        newSid: discovery.sid,
      };
    }

    const oldSession = this._kktpSessions.get(oldMailboxId);
    if (oldSession) zeroOutSessionKey(oldSession);
    this._kktpSessions.delete(oldMailboxId);

    if (encryptFn) {
      const newState = extractResumeState(this._kktpSessions.get(newMailboxId));
      const encrypted = await encryptFn(
        JSON.stringify({
          savedAt: Date.now(),
          ...newState,
          sid: discovery.sid,
        }),
      );

      await this._persistence.putResumeRecord({
        sid: discovery.sid,
        prefix: storageKeyPrefix,
        savedAt: Date.now(),
        data: encrypted,
      });

      if (oldSid) {
        await this._persistence.deleteResumeRecord(oldSid);
      }
    }

    return {
      status: "handover_complete",
      newMailboxId,
      newSid: discovery.sid,
    };
  }

  // --- Internal helpers ---

  _createKktpContext(isInitiator, keyIndex = null) {
    const idx =
      Number.isInteger(keyIndex) && keyIndex >= 0
        ? keyIndex
        : this._kktpKeyIndex++;
    if (idx >= this._kktpKeyIndex) this._kktpKeyIndex = idx + 1;
    const sm = new KKTPStateMachine(this.portal, isInitiator, idx);
    const protocol = new KKTPProtocol(sm);
    return { sm, protocol, keyIndex: idx };
  }

  async _verifyAnchorSignature(anchor) {
    const isResponse = anchor.type === "response";
    const sigField = isResponse ? "sig_resp" : "sig";
    const pubKeyField = isResponse ? "pub_sig_resp" : "pub_sig";

    const signature = anchor[sigField];
    const pubKey = anchor[pubKeyField];

    if (!signature || !pubKey) return false;

    const body = canonicalize(
      prepareForSigning(anchor, {
        omitKeys: [sigField],
        excludeMeta: anchor.type === "discovery",
      }),
    );

    return await this.portal.crypto.verifyMessage(pubKey, body, signature);
  }

  async _handleIncomingAnchor(anchor) {
    validateAnchorOrThrow(anchor);

    const isValidSig = await this._verifyAnchorSignature(anchor);
    if (!isValidSig) {
      throw new Error("Invalid anchor signature");
    }

    if (anchor.type === "discovery") {
      return { type: "discovery", anchor };
    }

    if (anchor.type === "response") {
      const pending = this._kktpPendingDiscoveries.get(anchor.sid);
      if (pending && anchor.initiator_pub_sig === pending.discovery.pub_sig) {
        await pending.protocol.processIncoming(anchor);

        const mailboxId = pending.sm.kktp.mailboxId;
        this._kktpSessions.set(mailboxId, {
          ...pending,
          response: anchor,
          messages: [],
          peerPubSig: anchor.pub_sig_resp,
          isInitiator: true,
          createdAt: Date.now(),
        });

        this._schedulePersist(mailboxId);

        this._kktpPendingDiscoveries.delete(anchor.sid);
        return { type: "session_established", mailboxId, response: anchor };
      }

      return { type: "response", anchor };
    }

    if (anchor.type === "session_end") {
      const sessionEntry = Array.from(this._kktpSessions.entries()).find(
        ([, s]) => s?.discovery?.sid === anchor.sid,
      );
      if (sessionEntry) {
        const [mailboxId, session] = sessionEntry;
        await this._removeResumeState(session);
        session.sm.terminate();
        this._kktpSessions.delete(mailboxId);
        return { type: "session_end", mailboxId, reason: anchor.reason };
      }
      return { type: "session_end", mailboxId: null, reason: anchor.reason };
    }

    return null;
  }

  _handleIncomingMessage(mailboxId, msgObject) {
    const session = this._kktpSessions.get(mailboxId);
    if (!session) {
      return { type: "message_ignored", mailboxId };
    }

    const plaintexts = session.sm.receiveMessage(msgObject);
    if (plaintexts && plaintexts.length > 0) {
      session.messages = session.messages || [];
      for (const plaintext of plaintexts) {
        session.messages.push({
          id: crypto.randomUUID(),
          direction: msgObject.direction,
          plaintext,
          timestamp: Date.now(),
          status: "confirmed",
          isOutbound: false,
        });
      }

      this._schedulePersist(mailboxId);
    }

    return { type: "messages", mailboxId, messages: plaintexts || [] };
  }

  _findSessionByDiscoverySid(sid) {
    for (const [mailboxId, session] of this._kktpSessions.entries()) {
      if (session?.discovery?.sid === sid) return { mailboxId, session };
    }
    return null;
  }

  _schedulePersist(mailboxId, { force = false } = {}) {
    if (!this._persistConfig || !mailboxId) return;

    this._persistQueue.add(mailboxId);

    if (force) {
      this._flushPersistQueue().catch(() => {});
      return;
    }

    if (this._persistTimer) return;
    const delay = Number(this._persistConfig.throttleMs) || 0;
    this._persistTimer = setTimeout(() => {
      this._flushPersistQueue().catch(() => {});
    }, delay);
  }

  async _flushPersistQueue() {
    if (!this._persistConfig) return;
    if (this._persistTimer) {
      clearTimeout(this._persistTimer);
      this._persistTimer = null;
    }

    const mailboxIds = Array.from(this._persistQueue);
    this._persistQueue.clear();

    for (const mailboxId of mailboxIds) {
      await this._persistSessionState(mailboxId);
    }
  }

  async _persistSessionState(mailboxId) {
    if (!this._persistConfig) return;
    if (typeof indexedDB === "undefined") return;

    const session = this._kktpSessions.get(mailboxId);
    if (!session) return;

    const { storageKeyPrefix, encryptFn, includeMessages } =
      this._persistConfig;

    const resumeState = this._extractResumeState(session);
    if (!includeMessages) {
      resumeState.messages = [];
    }

    const sid =
      session?.discovery?.sid ||
      session?.response?.sid ||
      resumeState?.discovery?.sid ||
      null;
    if (!sid) return;

    const savedAt = Date.now();
    const payload = {
      savedAt,
      sid,
      ...resumeState,
    };

    let raw = JSON.stringify(payload);
    if (encryptFn) {
      raw = await encryptFn(raw);
    }

    await this._persistence.putResumeRecord({
      sid,
      prefix: storageKeyPrefix,
      savedAt,
      data: raw,
    });
  }

  async _removeResumeState(session) {
    if (!this._persistConfig || !session) return;
    if (typeof indexedDB === "undefined") return;

    const sid =
      session?.discovery?.sid ||
      session?.response?.sid ||
      session?.discovery?.sid ||
      null;
    if (!sid) return;

    await this._persistence.deleteResumeRecord(sid);
  }
}
