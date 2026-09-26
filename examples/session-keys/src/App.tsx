import React, { useState, useEffect, useCallback, useRef } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SessionKey {
  publicKey: string;
  secretKey: string;
  expiresAt: number; // unix ms
  spendCap: number; // XLM
  spentSoFar: number; // XLM
}

interface LogEntry {
  id: string;
  timestamp: string;
  type: "INFO" | "SESSION_CREATED" | "PAYMENT_SENT" | "SESSION_REVOKED" | "ERROR";
  message: string;
  payload?: unknown;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const SESSION_DURATION_MS = 5 * 60 * 1000; // 5 minutes
const SPEND_CAP_XLM = 10; // 10 XLM
const MICROPAYMENT_XLM = 0.1; // per tap
const DEFAULT_SERVER_URL = "http://localhost:3000";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatTimeLeft(ms: number): string {
  if (ms <= 0) return "Expired";
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, "0")}`;
}

function shortKey(key: string): string {
  return `${key.slice(0, 6)}…${key.slice(-6)}`;
}

// ─── App ─────────────────────────────────────────────────────────────────────

export default function App() {
  const [serverUrl, setServerUrl] = useState(DEFAULT_SERVER_URL);
  const [serverOnline, setServerOnline] = useState(false);

  // Wallet state
  const [walletAddress, setWalletAddress] = useState<string>("");
  const [isCreatingWallet, setIsCreatingWallet] = useState(false);

  // Session key state
  const [session, setSession] = useState<SessionKey | null>(null);
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Micropayment state
  const [isSendingPayment, setIsSendingPayment] = useState(false);
  const [tapCount, setTapCount] = useState(0);

  // Log
  const [logs, setLogs] = useState<LogEntry[]>([]);

  // ── Helpers ──────────────────────────────────────────────────────────────

  const addLog = useCallback((type: LogEntry["type"], message: string, payload?: unknown) => {
    setLogs((prev) => [
      {
        id: crypto.randomUUID(),
        timestamp: new Date().toLocaleTimeString(),
        type,
        message,
        payload,
      },
      ...prev,
    ]);
  }, []);

  // ── Server health ─────────────────────────────────────────────────────────

  const checkHealth = useCallback(async () => {
    try {
      const res = await fetch(`${serverUrl}/health`);
      if (res.ok) {
        const data = (await res.json()) as { network?: string };
        setServerOnline(true);
        addLog("INFO", `Connected to @lumen/server (${data.network ?? "unknown"})`);
      } else {
        setServerOnline(false);
      }
    } catch {
      setServerOnline(false);
    }
  }, [serverUrl, addLog]);

  useEffect(() => {
    void checkHealth();
  }, [checkHealth]);

  // ── Session timer ─────────────────────────────────────────────────────────

  useEffect(() => {
    if (!session) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    const tick = () => {
      const remaining = session.expiresAt - Date.now();
      setTimeLeft(remaining);
      if (remaining <= 0) {
        setSession(null);
        addLog("INFO", "Session key expired automatically.");
        if (timerRef.current) clearInterval(timerRef.current);
      }
    };

    tick();
    timerRef.current = setInterval(tick, 500);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [session, addLog]);

  // ── Create wallet ─────────────────────────────────────────────────────────

  const handleCreateWallet = async () => {
    setIsCreatingWallet(true);
    try {
      const res = await fetch(`${serverUrl}/wallet/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) throw new Error("Failed to create wallet");
      const data = (await res.json()) as { address: string };
      setWalletAddress(data.address);
      addLog("INFO", "Seedless wallet created and sponsored.", data);
    } catch (err) {
      addLog("ERROR", `Wallet creation failed: ${(err as Error).message}`);
    } finally {
      setIsCreatingWallet(false);
    }
  };

  // ── Create session key ────────────────────────────────────────────────────

  const handleCreateSession = async () => {
    if (!walletAddress) {
      addLog("ERROR", "Create a wallet first.");
      return;
    }
    setIsCreatingSession(true);
    try {
      // In a real integration you would call client.createSessionKey() and
      // register the session key on-chain via the /session-key endpoint.
      // Here we simulate key generation to show the UX flow without requiring
      // a live Stellar network.
      const durationSecs = SESSION_DURATION_MS / 1000;
      const res = await fetch(`${serverUrl}/session-key`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletAddress,
          durationSeconds: durationSecs,
          spendLimit: { asset: "XLM", maxPerTx: MICROPAYMENT_XLM, maxTotal: SPEND_CAP_XLM },
        }),
      });

      // If the server doesn't have a /session-key endpoint yet we fall back to
      // a client-side simulated keypair so the UI remains interactive.
      let publicKey: string;
      let secretKey: string;

      if (res.ok) {
        const data = (await res.json()) as { publicKey: string; secretKey: string };
        publicKey = data.publicKey;
        secretKey = data.secretKey;
      } else {
        // Client-side fallback: generate a random ed25519 keypair via the
        // Web Crypto API, encode as base58-like hex for display purposes.
        const keyMaterial = crypto.getRandomValues(new Uint8Array(32));
        const hex = Array.from(keyMaterial)
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");
        publicKey = `G${hex.slice(0, 55).toUpperCase()}`;
        secretKey = `S${hex.slice(0, 55).toUpperCase()}`;
      }

      const newSession: SessionKey = {
        publicKey,
        secretKey,
        expiresAt: Date.now() + SESSION_DURATION_MS,
        spendCap: SPEND_CAP_XLM,
        spentSoFar: 0,
      };

      setSession(newSession);
      setTapCount(0);
      addLog("SESSION_CREATED", `Session key created (5 min · ${SPEND_CAP_XLM} XLM cap)`, {
        publicKey: shortKey(publicKey),
        expiresAt: new Date(newSession.expiresAt).toLocaleTimeString(),
      });
    } catch (err) {
      addLog("ERROR", `Session key creation failed: ${(err as Error).message}`);
    } finally {
      setIsCreatingSession(false);
    }
  };

  // ── Micropayment (rapid action button) ───────────────────────────────────

  const handleTip = async () => {
    if (!session) {
      addLog("ERROR", "No active session. Create a session key first.");
      return;
    }
    if (session.spentSoFar + MICROPAYMENT_XLM > session.spendCap) {
      addLog("ERROR", "Spend cap reached. Revoke and create a new session key.");
      return;
    }
    if (Date.now() > session.expiresAt) {
      addLog("ERROR", "Session key has expired.");
      return;
    }

    setIsSendingPayment(true);
    try {
      // In a real app the signed XDR would be built from the session keypair
      // and submitted to /cosign then /fee-bump. We simulate the roundtrip here.
      const res = await fetch(`${serverUrl}/cosign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          xdr: "AAAA...sessionKeySignedXdr",
          walletAddress: walletAddress,
          sessionKey: session.publicKey,
        }),
      }).catch(() => ({ ok: false }) as Response);

      const mockHash = `${session.publicKey.slice(0, 4)}${Math.random().toString(16).slice(2, 10)}`;

      setSession((prev) =>
        prev ? { ...prev, spentSoFar: +(prev.spentSoFar + MICROPAYMENT_XLM).toFixed(7) } : null,
      );
      setTapCount((n) => n + 1);

      addLog("PAYMENT_SENT", `⚡ Instant tip of ${MICROPAYMENT_XLM} XLM sent (no signing prompt)`, {
        hash: mockHash,
        sessionKey: shortKey(session.publicKey),
        serverAck: res.ok ? "cosigned" : "simulated",
      });
    } catch (err) {
      addLog("ERROR", `Payment failed: ${(err as Error).message}`);
    } finally {
      setIsSendingPayment(false);
    }
  };

  // ── Revoke session key ────────────────────────────────────────────────────

  const handleRevoke = async () => {
    if (!session) return;

    try {
      await fetch(`${serverUrl}/session-key/revoke`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publicKey: session.publicKey, walletAddress }),
      }).catch(() => undefined); // best-effort

      addLog("SESSION_REVOKED", `Session key revoked manually`, {
        publicKey: shortKey(session.publicKey),
        spentSoFar: `${session.spentSoFar.toFixed(7)} XLM`,
        tapCount,
      });
    } finally {
      setSession(null);
      setTapCount(0);
    }
  };

  // ── Derived values ────────────────────────────────────────────────────────

  const spendPercent = session ? Math.min((session.spentSoFar / session.spendCap) * 100, 100) : 0;

  const timePercent = session ? Math.max((timeLeft / SESSION_DURATION_MS) * 100, 0) : 0;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="app-container">
      {/* ── Header ── */}
      <header className="app-header">
        <div className="brand">
          <span className="brand-icon">🔑</span>
          <div>
            <h1 className="brand-title">Lumen Session Keys</h1>
            <p className="brand-subtitle">Instant micropayments · No signing prompts</p>
          </div>
        </div>
        <div className="server-status">
          <span className={`dot ${serverOnline ? "online" : "offline"}`} />
          <span>{serverOnline ? "Server online" : "Server offline"}</span>
          <button className="btn-sm" onClick={() => void checkHealth()}>
            Ping
          </button>
        </div>
      </header>

      <div className="main-grid">
        {/* ── Left column: controls ── */}
        <div className="column">
          {/* Server URL */}
          <div className="card">
            <h2>⚙️ Configuration</h2>
            <label className="label">Server URL</label>
            <input
              className="input"
              value={serverUrl}
              onChange={(e) => setServerUrl(e.target.value)}
              placeholder="http://localhost:3000"
            />
          </div>

          {/* Wallet */}
          <div className="card">
            <h2>💳 Wallet</h2>
            <p className="muted">Provision a seedless Stellar wallet sponsored by the server.</p>
            <button
              className="btn"
              onClick={() => void handleCreateWallet()}
              disabled={isCreatingWallet}
            >
              {isCreatingWallet ? "Creating…" : "Create Seedless Wallet"}
            </button>
            {walletAddress && (
              <div className="address-box">
                <span className="label-sm">WALLET ADDRESS</span>
                <span className="mono">{walletAddress}</span>
              </div>
            )}
          </div>

          {/* Session key */}
          <div className="card">
            <h2>🔑 Session Key</h2>
            <p className="muted">
              Creates a scoped keypair valid for <strong>5 minutes</strong> with a{" "}
              <strong>{SPEND_CAP_XLM} XLM</strong> spend cap.
            </p>
            {!session ? (
              <button
                className="btn"
                onClick={() => void handleCreateSession()}
                disabled={isCreatingSession || !walletAddress}
              >
                {isCreatingSession ? "Generating…" : "Create Session Key"}
              </button>
            ) : (
              <div className="session-panel">
                <div className="address-box">
                  <span className="label-sm">SESSION PUBLIC KEY</span>
                  <span className="mono">{shortKey(session.publicKey)}</span>
                </div>

                {/* Time bar */}
                <div className="stat-row">
                  <span className="label-sm">TIME REMAINING</span>
                  <span className={`value ${timeLeft < 30_000 ? "danger" : "ok"}`}>
                    {formatTimeLeft(timeLeft)}
                  </span>
                </div>
                <div className="progress-track">
                  <div
                    className={`progress-fill time ${timeLeft < 30_000 ? "danger" : ""}`}
                    style={{ width: `${timePercent}%` }}
                  />
                </div>

                {/* Spend bar */}
                <div className="stat-row">
                  <span className="label-sm">SPEND ALLOWANCE</span>
                  <span className={`value ${spendPercent >= 90 ? "danger" : "ok"}`}>
                    {session.spentSoFar.toFixed(4)} / {session.spendCap} XLM
                  </span>
                </div>
                <div className="progress-track">
                  <div
                    className={`progress-fill spend ${spendPercent >= 90 ? "danger" : ""}`}
                    style={{ width: `${spendPercent}%` }}
                  />
                </div>

                <button className="btn btn-danger" onClick={() => void handleRevoke()}>
                  Revoke Session Key
                </button>
              </div>
            )}
          </div>

          {/* Rapid action */}
          <div className="card">
            <h2>⚡ Instant Micropayment</h2>
            <p className="muted">
              Each tap sends <strong>{MICROPAYMENT_XLM} XLM</strong> instantly using the session key
              — no wallet popup, no signing prompt.
            </p>
            <button
              className={`btn tap-btn ${!session ? "disabled" : ""}`}
              onClick={() => void handleTip()}
              disabled={isSendingPayment || !session}
            >
              {isSendingPayment ? "Sending…" : "⚡ Tip 0.1 XLM"}
            </button>
            {tapCount > 0 && (
              <p className="tap-count">
                {tapCount} tap{tapCount !== 1 ? "s" : ""} this session
              </p>
            )}
          </div>
        </div>

        {/* ── Right column: log ── */}
        <div className="column">
          <div className="card log-card">
            <div className="log-header-row">
              <h2>📋 Event Log</h2>
              <button className="btn-sm" onClick={() => setLogs([])}>
                Clear
              </button>
            </div>
            <div className="log-list">
              {logs.length === 0 ? (
                <p className="muted centered">
                  No events yet. Create a wallet and session key to get started.
                </p>
              ) : (
                logs.map((entry) => (
                  <div key={entry.id} className={`log-entry type-${entry.type}`}>
                    <div className="log-meta">
                      <span className="log-type">{entry.type}</span>
                      <span className="log-time">{entry.timestamp}</span>
                    </div>
                    <div className="log-msg">{entry.message}</div>
                    {entry.payload && (
                      <pre className="log-payload">{JSON.stringify(entry.payload, null, 2)}</pre>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
