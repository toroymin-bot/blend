// Blend - Meeting Store (localStorage persist)

import { create } from 'zustand';
import { MeetingAnalysis } from '@/types';
import { safeSetItem } from '@/lib/safe-storage';

interface MeetingState {
  meetings: MeetingAnalysis[];
  currentMeetingId: string | null;

  addMeeting: (meeting: MeetingAnalysis) => void;
  updateMeeting: (meeting: MeetingAnalysis) => void;
  deleteMeeting: (id: string) => void;
  setCurrentMeeting: (id: string | null) => void;
  loadFromStorage: () => void;
  saveToStorage: () => void;
}

const STORAGE_KEY = 'blend:meetings';

export const useMeetingStore = create<MeetingState>((set, get) => ({
  meetings: [],
  currentMeetingId: null,

  addMeeting: (meeting) => {
    set((state) => ({ meetings: [meeting, ...state.meetings], currentMeetingId: meeting.id }));
    get().saveToStorage();
  },

  updateMeeting: (meeting) => {
    set((state) => ({
      meetings: state.meetings.map((m) => (m.id === meeting.id ? meeting : m)),
    }));
    get().saveToStorage();
  },

  deleteMeeting: (id) => {
    set((state) => ({
      meetings: state.meetings.filter((m) => m.id !== id),
      currentMeetingId: state.currentMeetingId === id ? null : state.currentMeetingId,
    }));
    get().saveToStorage();
  },

  setCurrentMeeting: (id) => set({ currentMeetingId: id }),

  loadFromStorage: () => {
    if (typeof window === 'undefined') return;
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        set({ meetings: JSON.parse(stored) });
      }
    } catch {}
  },

  saveToStorage: () => {
    if (typeof window === 'undefined') return;
    safeSetItem(STORAGE_KEY, JSON.stringify(get().meetings), 'meetings');
  },
}));
