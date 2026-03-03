interface StatusBadgeProps {
  status: "pending" | "transcribing" | "completed" | "failed";
}

const statusConfig = {
  pending: {
    label: "Pending",
    classes: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
    dot: "bg-yellow-400",
  },
  transcribing: {
    label: "Transcribing",
    classes: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    dot: "bg-blue-400 animate-pulse",
  },
  completed: {
    label: "Completed",
    classes: "bg-green-500/10 text-green-400 border-green-500/20",
    dot: "bg-green-400",
  },
  failed: {
    label: "Failed",
    classes: "bg-red-500/10 text-red-400 border-red-500/20",
    dot: "bg-red-400",
  },
};

export default function StatusBadge({ status }: StatusBadgeProps) {
  const config = statusConfig[status] || statusConfig.pending;

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${config.classes}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
      {config.label}
    </span>
  );
}
