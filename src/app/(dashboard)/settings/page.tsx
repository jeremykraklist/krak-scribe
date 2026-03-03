"use client";

import { useState, useEffect, useCallback } from "react";
import { authFetch, logout } from "@/lib/auth-client";
import LoadingSpinner from "@/components/loading-spinner";

interface UserInfo {
  id: string;
  email: string;
  name: string | null;
  createdAt: string;
}

interface Template {
  id: string;
  name: string;
  isDefault: boolean;
}

interface PlaudSyncStatus {
  connected: boolean;
  plaudEmail: string | null;
  plaudNickname: string | null;
  lastSyncAt: string | null;
  lastSyncFileCount: number;
  lastSyncError: string | null;
  syncStatus: string;
  tokenExpired: boolean;
}

interface SyncResult {
  success: boolean;
  filesFound: number;
  filesDownloaded: number;
  filesSkipped: number;
  errors: string[];
}

export default function SettingsPage() {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [stats, setStats] = useState({ transcripts: 0, templates: 0 });
  const [loading, setLoading] = useState(true);
  const [defaultTemplateId, setDefaultTemplateId] = useState<string>("");

  // Plaud sync state
  const [plaudStatus, setPlaudStatus] = useState<PlaudSyncStatus | null>(null);
  const [plaudToken, setPlaudToken] = useState("");
  const [plaudConnecting, setPlaudConnecting] = useState(false);
  const [plaudSyncing, setPlaudSyncing] = useState(false);
  const [plaudMessage, setPlaudMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [showTokenInput, setShowTokenInput] = useState(false);

  const fetchPlaudStatus = useCallback(async () => {
    try {
      const res = await authFetch("/api/sync/plaud");
      if (res.ok) {
        const data = await res.json();
        setPlaudStatus(data);
      }
    } catch (err) {
      console.error("Plaud status fetch error:", err);
    }
  }, []);

  useEffect(() => {
    async function fetchData() {
      try {
        const [userRes, templatesRes] = await Promise.all([
          authFetch("/api/user"),
          authFetch("/api/templates"),
        ]);

        if (userRes.ok) {
          const data = await userRes.json();
          setUser(data.user);
          setStats(data.stats);
        }

        if (templatesRes.ok) {
          const data = await templatesRes.json();
          setTemplates(data.templates || []);
          const defaultT = data.templates?.find(
            (t: Template) => t.isDefault
          );
          if (defaultT) setDefaultTemplateId(defaultT.id);
        }
      } catch (err) {
        console.error("Settings fetch error:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
    fetchPlaudStatus();
  }, [fetchPlaudStatus]);

  const handleSetDefault = async (templateId: string) => {
    if (!templateId) return;
    const res = await authFetch(`/api/templates/${templateId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isDefault: true }),
    });
    if (res.ok) {
      setDefaultTemplateId(templateId);
    }
  };

  const handlePlaudConnect = async () => {
    if (!plaudToken.trim()) return;
    setPlaudConnecting(true);
    setPlaudMessage(null);

    try {
      const res = await authFetch("/api/sync/plaud", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "connect", token: plaudToken.trim() }),
      });
      const data = await res.json();

      if (res.ok && data.success) {
        setPlaudMessage({
          type: "success",
          text: `Connected as ${data.email || data.nickname || "Plaud user"}`,
        });
        setPlaudToken("");
        setShowTokenInput(false);
        await fetchPlaudStatus();
      } else {
        setPlaudMessage({
          type: "error",
          text: data.error || "Failed to connect",
        });
      }
    } catch {
      setPlaudMessage({ type: "error", text: "Connection failed" });
    } finally {
      setPlaudConnecting(false);
    }
  };

  const handlePlaudDisconnect = async () => {
    try {
      const res = await authFetch("/api/sync/plaud", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "disconnect" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPlaudMessage({ type: "error", text: data.error || "Failed to disconnect" });
        return;
      }
      setPlaudMessage({ type: "success", text: "Disconnected from Plaud" });
      await fetchPlaudStatus();
    } catch {
      setPlaudMessage({ type: "error", text: "Failed to disconnect" });
    }
  };

  const handlePlaudSync = async () => {
    setPlaudSyncing(true);
    setPlaudMessage(null);

    try {
      const res = await authFetch("/api/sync/plaud", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "sync" }),
      });
      const raw = await res.json();
      if (!res.ok) {
        setPlaudMessage({ type: "error", text: raw.error || "Sync failed" });
        return;
      }
      const data: SyncResult = raw;

      if (data.success) {
        const parts = [];
        if (data.filesDownloaded > 0)
          parts.push(`${data.filesDownloaded} new recording${data.filesDownloaded !== 1 ? "s" : ""} synced`);
        if (data.filesSkipped > 0)
          parts.push(`${data.filesSkipped} already synced`);
        if (data.filesFound === 0) parts.push("No recordings found");
        if (data.errors.length > 0)
          parts.push(`${data.errors.length} error${data.errors.length !== 1 ? "s" : ""}`);

        setPlaudMessage({
          type: data.errors.length > 0 ? "error" : "success",
          text: parts.join(" · "),
        });
      } else {
        setPlaudMessage({
          type: "error",
          text: data.errors?.[0] || "Sync failed",
        });
      }

      await fetchPlaudStatus();
    } catch {
      setPlaudMessage({ type: "error", text: "Sync request failed" });
    } finally {
      setPlaudSyncing(false);
    }
  };

  if (loading) return <LoadingSpinner text="Loading settings..." />;

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted text-sm mt-1">
          Manage your account and preferences
        </p>
      </div>

      {/* Account Info */}
      <div className="bg-surface border border-border rounded-xl p-6 space-y-4">
        <h2 className="font-semibold">Account</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-muted text-xs uppercase tracking-wider">
              Email
            </label>
            <p className="text-sm mt-1">{user?.email}</p>
          </div>
          <div>
            <label className="text-muted text-xs uppercase tracking-wider">
              Name
            </label>
            <p className="text-sm mt-1">{user?.name || "Not set"}</p>
          </div>
          <div>
            <label className="text-muted text-xs uppercase tracking-wider">
              Member Since
            </label>
            <p className="text-sm mt-1">
              {user?.createdAt
                ? new Date(user.createdAt).toLocaleDateString("en-US", {
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                  })
                : "—"}
            </p>
          </div>
          <div>
            <label className="text-muted text-xs uppercase tracking-wider">
              User ID
            </label>
            <p className="text-sm mt-1 font-mono text-muted truncate">
              {user?.id}
            </p>
          </div>
        </div>
      </div>

      {/* Usage Stats */}
      <div className="bg-surface border border-border rounded-xl p-6 space-y-4">
        <h2 className="font-semibold">Usage</h2>
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-background border border-border rounded-lg p-4 text-center">
            <p className="text-3xl font-bold">{stats.transcripts}</p>
            <p className="text-muted text-sm mt-1">Transcripts</p>
          </div>
          <div className="bg-background border border-border rounded-lg p-4 text-center">
            <p className="text-3xl font-bold">{stats.templates}</p>
            <p className="text-muted text-sm mt-1">Templates</p>
          </div>
        </div>
      </div>

      {/* Plaud Cloud Sync */}
      <div className="bg-surface border border-border rounded-xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold">Plaud Cloud Sync</h2>
            <p className="text-muted text-sm mt-1">
              Automatically pull recordings from your Plaud device
            </p>
          </div>
          {plaudStatus?.connected && (
            <span className="px-2 py-1 bg-green-500/10 text-green-400 text-xs rounded-full border border-green-500/20">
              Connected
            </span>
          )}
          {plaudStatus?.tokenExpired && (
            <span className="px-2 py-1 bg-yellow-500/10 text-yellow-400 text-xs rounded-full border border-yellow-500/20">
              Token Expired
            </span>
          )}
        </div>

        {plaudStatus?.connected ? (
          <div className="space-y-4">
            {/* Connected account info */}
            <div className="bg-background border border-border rounded-lg p-4 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">
                    {plaudStatus.plaudNickname || plaudStatus.plaudEmail || "Plaud Account"}
                  </p>
                  {plaudStatus.plaudEmail && (
                    <p className="text-muted text-xs">{plaudStatus.plaudEmail}</p>
                  )}
                </div>
                <button
                  onClick={handlePlaudDisconnect}
                  className="text-xs text-red-400 hover:text-red-300 transition-colors"
                >
                  Disconnect
                </button>
              </div>

              {plaudStatus.lastSyncAt && (
                <div className="text-xs text-muted pt-2 border-t border-border">
                  Last sync:{" "}
                  {new Date(plaudStatus.lastSyncAt).toLocaleString("en-US", {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                  {plaudStatus.lastSyncFileCount > 0 && (
                    <span>
                      {" "}
                      · {plaudStatus.lastSyncFileCount} file
                      {plaudStatus.lastSyncFileCount !== 1 ? "s" : ""}
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Sync button */}
            <button
              onClick={handlePlaudSync}
              disabled={plaudSyncing}
              className="w-full px-4 py-2.5 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {plaudSyncing ? (
                <>
                  <svg
                    className="animate-spin h-4 w-4"
                    viewBox="0 0 24 24"
                    fill="none"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                  Syncing…
                </>
              ) : (
                <>
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 2v6h-6M3 12a9 9 0 0115.36-6.36L21 8M3 22v-6h6M21 12a9 9 0 01-15.36 6.36L3 16" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Sync Now
                </>
              )}
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Instructions */}
            <div className="bg-background border border-border rounded-lg p-4 space-y-3">
              <p className="text-sm font-medium">How to connect:</p>
              <ol className="text-xs text-muted space-y-2 list-decimal list-inside">
                <li>
                  Open{" "}
                  <a
                    href="https://web.plaud.ai"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent hover:underline"
                  >
                    web.plaud.ai
                  </a>{" "}
                  and log in
                </li>
                <li>Open browser DevTools (F12) → Console tab</li>
                <li>
                  Paste this and press Enter:{" "}
                  <code className="bg-surface px-1.5 py-0.5 rounded text-foreground font-mono">
                    copy(localStorage.getItem(&apos;tokenstr&apos;))
                  </code>
                </li>
                <li>Paste the copied token below</li>
              </ol>
            </div>

            {showTokenInput ? (
              <div className="space-y-3">
                <input
                  type="password"
                  value={plaudToken}
                  onChange={(e) => setPlaudToken(e.target.value)}
                  placeholder="Bearer eyJ..."
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground text-sm font-mono focus:outline-none focus:border-accent transition-colors"
                />
                <div className="flex gap-2">
                  <button
                    onClick={handlePlaudConnect}
                    disabled={plaudConnecting || !plaudToken.trim()}
                    className="flex-1 px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {plaudConnecting ? "Verifying…" : "Connect"}
                  </button>
                  <button
                    onClick={() => {
                      setShowTokenInput(false);
                      setPlaudToken("");
                      setPlaudMessage(null);
                    }}
                    className="px-4 py-2 bg-surface border border-border text-foreground rounded-lg text-sm hover:bg-background transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowTokenInput(true)}
                className="w-full px-4 py-2.5 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent/90 transition-colors"
              >
                Connect Plaud Account
              </button>
            )}
          </div>
        )}

        {/* Status messages */}
        {plaudMessage && (
          <div
            className={`text-xs px-3 py-2 rounded-lg ${
              plaudMessage.type === "success"
                ? "bg-green-500/10 text-green-400 border border-green-500/20"
                : "bg-red-500/10 text-red-400 border border-red-500/20"
            }`}
          >
            {plaudMessage.text}
          </div>
        )}

        {plaudStatus?.lastSyncError && !plaudMessage && (
          <div className="text-xs px-3 py-2 rounded-lg bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">
            Last sync issue: {plaudStatus.lastSyncError}
          </div>
        )}
      </div>

      {/* Default Template */}
      <div className="bg-surface border border-border rounded-xl p-6 space-y-4">
        <h2 className="font-semibold">Default Template</h2>
        <p className="text-muted text-sm">
          Choose the default AI template applied to new transcripts.
        </p>
        <select
          value={defaultTemplateId}
          onChange={(e) => handleSetDefault(e.target.value)}
          className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground focus:outline-none focus:border-accent transition-colors text-sm"
        >
          <option value="">None</option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>

      {/* API Configuration */}
      <div className="bg-surface border border-border rounded-xl p-6 space-y-4">
        <h2 className="font-semibold">API Configuration</h2>
        <div className="space-y-3">
          <div className="flex items-center justify-between bg-background border border-border rounded-lg p-3">
            <div>
              <p className="text-sm font-medium">Transcription Engine</p>
              <p className="text-muted text-xs">
                Local whisper.cpp + OpenRouter AI processing
              </p>
            </div>
            <span className="px-2 py-1 bg-green-500/10 text-green-400 text-xs rounded-full border border-green-500/20">
              Configured
            </span>
          </div>
          <p className="text-muted text-xs">
            API keys are configured server-side via environment variables.
            Contact your administrator to update them.
          </p>
        </div>
      </div>

      {/* Danger Zone */}
      <div className="bg-surface border border-red-500/20 rounded-xl p-6 space-y-4">
        <h2 className="font-semibold text-red-400">Danger Zone</h2>
        <button
          onClick={logout}
          className="px-4 py-2 bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg text-sm font-medium hover:bg-red-500/20 transition-colors"
        >
          Sign Out
        </button>
      </div>
    </div>
  );
}
