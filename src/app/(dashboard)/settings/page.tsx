"use client";

import { useState, useEffect } from "react";
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

export default function SettingsPage() {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [stats, setStats] = useState({ transcripts: 0, templates: 0 });
  const [loading, setLoading] = useState(true);
  const [defaultTemplateId, setDefaultTemplateId] = useState<string>("");

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
  }, []);

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
              <p className="text-sm font-medium">Groq API</p>
              <p className="text-muted text-xs">
                Whisper transcription & LLM processing
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
