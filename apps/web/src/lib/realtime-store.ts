"use client";

import { create } from "zustand";

export type RealtimeStatus = "idle" | "connecting" | "connected" | "disconnected" | "error";

interface RealtimeState {
  status: RealtimeStatus;
  setStatus: (status: RealtimeStatus) => void;
}

export const useRealtimeStore = create<RealtimeState>((set) => ({
  status: "idle",
  setStatus: (status) => set({ status }),
}));
