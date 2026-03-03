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
  plaudFileCount: number;
  syncedCount: number;
  lastSyncTime: string | null;
  syncInProgress: boolean;
  lastSyncResult: {
    synced: number;
    skipped: number;
    errors: string[];
    total: number;
  } | null;
  error?: string;
}

export default function SettingsPage() {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [stats, setStats] = useState({ transcripts: 0, templates: 0 });
  const [loading, setLoading] = useState(true);
  const [defaultTemplateId, setDefaultTemplateId] = useState<string>("");

  // Plaud sync state
  const [plaudStatus, setPlaudStatus] = useState<PlaudSyncStatus | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

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

        // Fetch Plaud status
        await fetchPlaudStatus();
      } catch (err) {
        console.error("Settings fetch error:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
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

  const handlePlaudSync = async () => {
    setSyncing(true);
    setSyncMessage(null);

    try {
      const res = await authFetch("/api/sync/plaud", { method: "POST" });
      const data = await res.json();

      if (res.ok) {
        setSyncMessage(
          `✅ ${data.message}. Total: ${data.total}, Skipped: ${data.skipped}${
            data.errors?.length ? `. Errors: ${data.errors.length}` : ""
          }`
        );
      } else {
        setSyncMessage(`❌ ${data.error || "Sync failed"}`);
      }

      // Refresh status
      await fetchPlaudStatus();
    } catch (err) {
      setSyncMessage(
        `❌ ${err instanceof Error ? err.message : "Network error"}`
      );
    } finally {
      setSyncing(false);
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

      {/* Plaud Sync */}
      <div className="bg-surface border border-border rounded-xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Plaud Audio Sync</h2>
          {plaudStatus?.connected ? (
            <span className="px-2 py-1 bg-green-500/10 text-green-400 text-xs rounded-full border border-green-500/20">
              Connected
            </span>
          ) : (
            <span className="px-2 py-1 bg-red-500/10 text-red-400 text-xs rounded-full border border-red-500/20">
              {plaudStatus?.error || "Not Connected"}
            </span>
          )}
        </div>

        {plaudStatus?.connected && (
          <>
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-background border border-border rounded-lg p-3 text-center">
                <p className="text-2xl font-bold">
                  {plaudStatus.plaudFileCount}
                </p>
                <p className="text-muted text-xs mt-1">On Plaud</p>
              </div>
              <div className="bg-background border border-border rounded-lg p-3 text-center">
                <p className="text-2xl font-bold">
                  {plaudStatus.syncedCount}
                </p>
                <p className="text-muted text-xs mt-1">Synced</p>
              </div>
              <div className="bg-background border border-border rounded-lg p-3 text-center">
                <p className="text-2xl font-bold">
                  {Math.max(
                    0,
                    plaudStatus.plaudFileCount - plaudStatus.syncedCount
                  )}
                </p>
                <p className="text-muted text-xs mt-1">Pending</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={handlePlaudSync}
                disabled={syncing}
                className="px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {syncing ? (
                  <>
                    <svg
                      className="animate-spin h-4 w-4"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                        fill="none"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                    Syncing...
                  </>
                ) : (
                  <>
                    <svg
                      className="h-4 w-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                      />
                    </svg>
                    Sync Now
                  </>
                )}
              </button>

              {plaudStatus.lastSyncTime && (
                <span className="text-muted text-xs">
                  Last sync:{" "}
                  {new Date(plaudStatus.lastSyncTime).toLocaleString()}
                </span>
              )}
            </div>

            {syncMessage && (
              <div
                className={`text-sm p-3 rounded-lg ${
                  syncMessage.startsWith("✅")
                    ? "bg-green-500/10 text-green-400 border border-green-500/20"
                    : "bg-red-500/10 text-red-400 border border-red-500/20"
                }`}
              >
                {syncMessage}
              </div>
            )}

            <p className="text-muted text-xs">
              Auto-sync runs every hour. New recordings are automatically
              transcribed and processed with your default template.
            </p>
          </>
        )}

        {!plaudStatus?.connected && (
          <p className="text-muted text-sm">
            Plaud sync requires a valid PLAUD_TOKEN environment variable.
            Contact your administrator.
          </p>
        )}
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

      {/* Default Template */}
      <div className="bg-surface border border-border rounded-xl p-6 space-y-4">
        <h2 className="font-semibold">Default Template</h2>
        <p className="text-muted text-sm">
          Choose the default AI template applied to new transcripts and
          auto-synced Plaud recordings.
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
