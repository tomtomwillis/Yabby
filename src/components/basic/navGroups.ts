import { useState, useEffect } from 'react';
import { collection, query, where, getCountFromServer } from 'firebase/firestore';
import { db } from '../../firebaseConfig';
import { useMediaManager } from '../../utils/useMediaManager';
import { useAdmin } from '../../utils/useAdmin';

// Module-level cache — the nav renders on every page, avoid a count query per navigation
const ISSUE_COUNT_TTL = 5 * 60 * 1000;
let issueCountCache: { count: number; timestamp: number } | null = null;

export interface NavLink {
  label: string;
  href: string;
  external?: true;
  condition?: boolean;
  badge?: number;
}

export interface NavGroup {
  name: string;
  links: NavLink[];
}

/** The site's nav table, gated by the current user's roles. Shared by the
 *  header and the home page's sidebar index so the two cannot drift. */
export function useNavGroups(): NavGroup[] {
  const { isMediaManager } = useMediaManager();
  const { isAdmin } = useAdmin();
  const [issueCount, setIssueCount] = useState(0);

  useEffect(() => {
    if (!isAdmin) return;
    if (issueCountCache && Date.now() - issueCountCache.timestamp < ISSUE_COUNT_TTL) {
      setIssueCount(issueCountCache.count);
      return;
    }
    getCountFromServer(query(collection(db, 'issues'), where('status', '==', 'inprogress')))
      .then((snap) => {
        const count = snap.data().count;
        issueCountCache = { count, timestamp: Date.now() };
        setIssueCount(count);
      })
      .catch((error) => console.error('Error fetching issue count:', error));
  }, [isAdmin]);

  return [
    {
      name: 'Music',
      links: [
        { label: 'listen', href: import.meta.env.VITE_NAVIDROME_SERVER_URL, external: true },
        { label: 'upload', href: '/upload' },
        { label: 'request', href: import.meta.env.VITE_SLSK_REQUEST_URL, external: true },
        { label: 'radio', href: '/' },
      ],
    },
    {
      name: 'Social',
      links: [
        { label: 'message board', href: '/messageboard' },
        { label: 'travel', href: '/travel' },
        { label: 'lists', href: '/lists' },
        { label: 'film club', href: '/film-club' },
        { label: 'stickers', href: '/stickers' },
      ],
    },
    {
      name: 'Yabby',
      links: [
        { label: 'profile', href: '/profile' },
        { label: 'news', href: '/news' },
        { label: 'wiki', href: '/wiki' },
        { label: 'issues', href: '/issues', badge: isAdmin ? issueCount : undefined },
        { label: 'media management', href: '/media', condition: isMediaManager },
      ],
    },
  ];
}
