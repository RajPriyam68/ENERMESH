"use client";

import { useRealtimeSync } from "@/lib/use-realtime";

export function RealtimeBridge() {
  useRealtimeSync();
  return null;
}
