import { useState, useEffect } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db, auth } from '../firebaseConfig';

export interface Submission {
  userId: string;
  title: string;
  releaseYear: string;
  posterPath: string | null;
  overview: string;
  pitch: string;
  username: string;
  tmdbId: number;
}

export function getCurrentMonthId(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function getNextMonthId(): string {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`;
}

function getSubmitMonthId(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const lastDay = new Date(year, month, 0).getDate();
  if (lastDay - now.getDate() < 5) {
    const next = new Date(year, month, 1);
    return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`;
  }
  return `${year}-${String(month).padStart(2, '0')}`;
}

function getPhaseInfo() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const lastDay = new Date(year, month, 0).getDate();
  const isRevealPhase = lastDay - now.getDate() < 5;

  const leavingDate = new Date(year, month, 0).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long',
  });
  const votingDeadlineDay = lastDay - 5;
  const votingDeadline = new Date(year, month - 1, votingDeadlineDay).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long',
  });
  const nextMonthName = new Date(year, month, 1).toLocaleDateString('en-GB', { month: 'long' });
  const monthAfterNextName = new Date(year, month + 1, 1).toLocaleDateString('en-GB', { month: 'long' });

  return { isRevealPhase, leavingDate, votingDeadline, nextMonthName, monthAfterNextName };
}

interface UseFilmClubReturn {
  monthId: string;
  nextMonthId: string;
  submitMonthId: string;
  isRevealPhase: boolean;
  leavingDate: string;
  votingDeadline: string;
  nextMonthName: string;
  monthAfterNextName: string;
  userSubmissions: Submission[];
  submissionsCount: number;
  loadingSubmissions: boolean;
}

export function useFilmClub(): UseFilmClubReturn {
  const monthId = getCurrentMonthId();
  const nextMonthId = getNextMonthId();
  const submitMonthId = getSubmitMonthId();
  const phaseInfo = getPhaseInfo();

  const userId = auth.currentUser?.uid ?? null;

  const [userSubmissions, setUserSubmissions] = useState<Submission[]>([]);
  const [submissionsCount, setSubmissionsCount] = useState(0);
  const [loadingSubmissions, setLoadingSubmissions] = useState(true);

  useEffect(() => {
    getDocs(collection(db, 'filmClub', submitMonthId, 'submissions'))
      .then((snap) => {
        setSubmissionsCount(snap.size);
        if (userId) {
          const mine = snap.docs
            .filter((d) => (d.data() as Submission).userId === userId)
            .map((d) => d.data() as Submission);
          setUserSubmissions(mine);
        }
        setLoadingSubmissions(false);
      })
      .catch(() => setLoadingSubmissions(false));
  }, [submitMonthId, userId]);

  return {
    monthId,
    nextMonthId,
    submitMonthId,
    ...phaseInfo,
    userSubmissions,
    submissionsCount,
    loadingSubmissions,
  };
}
