"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { TripWorkspace } from "@/components/trip-workspace";
import { useAuth } from "@/components/auth-provider";

export default function TripPage() {
  const router = useRouter();
  const params = useParams<{ tripId: string }>();
  const { isAuthenticated, isReady } = useAuth();
  const tripId = Array.isArray(params.tripId) ? params.tripId[0] : params.tripId;

  useEffect(() => {
    if (isReady && !isAuthenticated) {
      router.replace("/login");
    }
  }, [isAuthenticated, isReady, router]);

  if (!isReady || !isAuthenticated) {
    return <main className="centerMessage">Checking session...</main>;
  }

  if (!tripId) {
    return <main className="centerMessage">Invalid trip id.</main>;
  }

  return <TripWorkspace tripId={tripId} />;
}
