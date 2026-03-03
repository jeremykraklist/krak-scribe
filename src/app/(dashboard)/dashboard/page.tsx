"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { authFetch } from "@/lib/auth-client";
import LoadingSpinner from "@/components/loading-spinner";
import StatusBadge from "@/components/status-badge";

interface TranscriptSummary {
  id: string;
  originalFilename: string;
  status: "pending" | "transcribing" | "completed" | "failed";
  duration: number | null;
  createdAt: string;
}

interface DashboardData {
  user: { name: string | null; email: string };
  stats: { transcripts: number; templates: number };
  recentTranscripts: TranscriptSummary[];
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const [userRes, transcriptsRes] = await Promise.all([
          authFetch("/api/user"),
          authFetch("/api/transcripts"),
        ]);

        const userData = await userRes.json();
        const transcriptsData = await transcriptsRes.json();

        setData({
          user: userData.user,
          stats: userData.stats,
          recentTranscripts: (transcriptsData.transcripts || []).slice(0, 5),
        });
      } catch (err) {
        console.error("Dashboard fetch error:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  if (loading) return <LoadingSpinner text="Loading dashboard..." />;

  const user = data?.user;
  const stats = data?.stats;
  const recent = data?.recentTranscripts || [];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">
          Welcome back{user?.name ? `, ${user.name}` : ""}
        </h1>
        <p className="text-muted text-sm mt-1">
          Your transcript pipeline at a glance
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-surface border border-border rounded-xl p-5">
          <p className="text-muted text-sm">Total Transcripts</p>
          <p className="text-3xl font-bold mt-1">{stats?.transcripts || 0}</p>
        </div>
        <div className="bg-surface border border-border rounded-xl p-5">
          <p className="text-muted text-sm">Templates</p>
          <p className="text-3xl font-bold mt-1">{stats?.templates || 0}</p>
        </div>
        <div className="bg-surface border border-border rounded-xl p-5">
          <p className="text-muted text-sm">Completed</p>
          <p className="text-3xl font-bold text-green-400 mt-1">
            {recent.filter((t) => t.status === "completed").length}
          </p>
        </div>
        <div className="bg-surface border border-border rounded-xl p-5">
          <p className="text-muted text-sm">In Progress</p>
          <p className="text-3xl font-bold text-blue-400 mt-1">
            {
              recent.filter(
                (t) =>
                  t.status === "pending" || t.status === "transcribing"
              ).length
            }
          </p>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Link
          href="/upload"
          className="bg-accent/10 border border-accent/20 rounded-xl p-5 hover:bg-accent/15 transition-colors group"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-accent/20 flex items-center justify-center group-hover:bg-accent/30 transition-colors">
              <svg
                className="w-5 h-5 text-accent"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
                />
              </svg>
            </div>
            <div>
              <p className="font-medium text-accent">Upload Audio</p>
              <p className="text-muted text-xs">
                Drag & drop or browse files
              </p>
            </div>
          </div>
        </Link>
        <Link
          href="/transcripts"
          className="bg-surface border border-border rounded-xl p-5 hover:bg-surface-hover transition-colors group"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-surface-hover flex items-center justify-center group-hover:bg-border transition-colors">
              <svg
                className="w-5 h-5 text-muted"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
                />
              </svg>
            </div>
            <div>
              <p className="font-medium">View Transcripts</p>
              <p className="text-muted text-xs">Browse all recordings</p>
            </div>
          </div>
        </Link>
        <Link
          href="/templates"
          className="bg-surface border border-border rounded-xl p-5 hover:bg-surface-hover transition-colors group"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-surface-hover flex items-center justify-center group-hover:bg-border transition-colors">
              <svg
                className="w-5 h-5 text-muted"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"
                />
              </svg>
            </div>
            <div>
              <p className="font-medium">AI Templates</p>
              <p className="text-muted text-xs">Manage prompt templates</p>
            </div>
          </div>
        </Link>
      </div>

      {/* Recent Transcripts */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Recent Transcripts</h2>
          <Link
            href="/transcripts"
            className="text-accent text-sm hover:text-accent-hover transition-colors"
          >
            View all →
          </Link>
        </div>

        {recent.length === 0 ? (
          <div className="bg-surface border border-border rounded-xl p-8 text-center">
            <p className="text-muted">No transcripts yet.</p>
            <Link
              href="/upload"
              className="text-accent text-sm hover:text-accent-hover mt-2 inline-block"
            >
              Upload your first recording →
            </Link>
          </div>
        ) : (
          <div className="bg-surface border border-border rounded-xl divide-y divide-border">
            {recent.map((t) => (
              <Link
                key={t.id}
                href={`/transcripts/${t.id}`}
                className="flex items-center justify-between p-4 hover:bg-surface-hover transition-colors first:rounded-t-xl last:rounded-b-xl"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center flex-shrink-0">
                    <svg
                      className="w-4 h-4 text-accent"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={1.5}
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z"
                      />
                    </svg>
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium truncate text-sm">
                      {t.originalFilename}
                    </p>
                    <p className="text-muted text-xs">
                      {new Date(t.createdAt).toLocaleDateString()} •{" "}
                      {t.duration
                        ? `${Math.floor(t.duration / 60)}m ${t.duration % 60}s`
                        : "—"}
                    </p>
                  </div>
                </div>
                <StatusBadge status={t.status} />
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
