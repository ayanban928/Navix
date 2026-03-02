"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { TripWorkspace } from "@/components/trip-workspace";
import { useAuth } from "@/components/auth-provider";

export default function AppPage() {
  const router = useRouter();
  const { isAuthenticated, isReady } = useAuth();

  useEffect(() => {
    if (isReady && !isAuthenticated) {
      router.replace("/login");
    }
  }, [isAuthenticated, isReady, router]);

  if (!isReady || !isAuthenticated) {
    return <main className="centerMessage">Checking session...</main>;
  }

  return <TripWorkspace />;
}
