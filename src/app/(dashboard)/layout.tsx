"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { isAuthenticated } from "@/lib/auth-client";
import Sidebar from "@/components/sidebar";
import LoadingSpinner from "@/components/loading-spinner";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (!isAuthenticated()) {
      router.replace("/login");
    } else {
      setChecking(false);
    }
  }, [router]);

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner text="Loading..." />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex">
      <Sidebar />
      <main className="flex-1 lg:ml-0 min-h-screen">
        <div className="p-6 lg:p-8 pt-16 lg:pt-8">{children}</div>
      </main>
    </div>
  );
}
