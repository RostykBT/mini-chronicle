import { create } from "zustand";
import type { PartId } from "@/lib/parts";

type ExplorerState = {
  /** Cursor position on the timeline, ISO date (YYYY-MM-DD). */
  time: string;
  hoveredPart: PartId | null;
  selectedPart: PartId | null;
  playing: boolean;
  setTime: (t: string) => void;
  setHoveredPart: (p: PartId | null) => void;
  setSelectedPart: (p: PartId | null) => void;
  setPlaying: (p: boolean) => void;
};

export const useExplorer = create<ExplorerState>((set) => ({
  time: "", // set from ?t= or today on mount
  hoveredPart: null,
  selectedPart: null,
  playing: false,
  setTime: (time) => set({ time }),
  setHoveredPart: (hoveredPart) => set({ hoveredPart }),
  setSelectedPart: (selectedPart) => set({ selectedPart }),
  setPlaying: (playing) => set({ playing }),
}));
