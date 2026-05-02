import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, query, orderBy, limit } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { trackedGetDocs as getDocs } from '../utils/firestoreMetrics';
import './RecentLists.css';

interface RecentList {
  id: string;
  title: string;
  lastItemImage: string;
  lastItemLink: string;
  lastItemAddedByAvatar: string;
}

const normalizeAvatarPath = (avatarPath: string): string => {
  if (!avatarPath) return '';
  const cleanPath = avatarPath.startsWith('/') ? avatarPath.substring(1) : avatarPath;
  if (cleanPath.startsWith('Stickers/')) return `/${cleanPath}`;
  if (cleanPath.includes('/')) return `/Stickers/${cleanPath.split('/').pop()}`;
  return `/Stickers/${cleanPath}`;
};

const useIsMobile = () => {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  return isMobile;
};

const RecentLists: React.FC = () => {
  const [lists, setLists] = useState<RecentList[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  useEffect(() => {
    const fetchRecentLists = async () => {
      try {
        const q = query(
          collection(db, 'lists'),
          orderBy('lastUpdated', 'desc'),
          limit(10),
        );
        const snapshot = await getDocs(q);

        const result: RecentList[] = [];
        for (const docSnap of snapshot.docs) {
          if (result.length >= 3) break;
          const data = docSnap.data();
          if (data.isPublic === false) continue;
          result.push({
            id: docSnap.id,
            title: data.title || 'Untitled',
            lastItemImage: data.lastItemImage || '',
            lastItemLink: data.lastItemLink || '',
            lastItemAddedByAvatar: data.lastItemAddedByAvatar || '',
          });
        }

        setLists(result);
      } catch (error) {
        console.error('Error fetching recent lists:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchRecentLists();
  }, []);

  if (loading) {
    return <p className="recent-lists-loading">Loading lists...</p>;
  }

  if (lists.length === 0) {
    return null;
  }

  const handleImageClick = (list: RecentList) => {
    navigate(`/lists/${list.id}`);
  };

  const getImageSrc = (list: RecentList): string => {
    if (list.lastItemImage) return list.lastItemImage;
    if (list.lastItemAddedByAvatar) return normalizeAvatarPath(list.lastItemAddedByAvatar);
    return '';
  };

  const displayedLists = isMobile ? lists.slice(0, 2) : lists;

  return (
    <div className="recent-lists-container">
      {displayedLists.map((list) => {
        const imageSrc = getImageSrc(list);
        return (
          <div key={list.id} className="recent-list-card">
            {imageSrc && (
              <div
                className="recent-list-image-wrapper"
                onClick={() => handleImageClick(list)}
              >
                <img
                  src={imageSrc}
                  alt={list.title}
                  loading="lazy"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              </div>
            )}
            <div
              className="recent-list-title-bar"
              onClick={() => navigate(`/lists/${list.id}`)}
            >
              {list.title}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default RecentLists;
