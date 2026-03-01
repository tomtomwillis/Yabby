import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, query, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import './RecentLists.css';

const NAVIDROME_SERVER_URL = import.meta.env.VITE_NAVIDROME_SERVER_URL;

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

// For legacy lists without metadata, fetch the most recent item to get image info
const fetchLastItemForList = async (listId: string): Promise<{ image: string; link: string; avatar: string }> => {
  try {
    const itemsQuery = query(
      collection(db, 'lists', listId, 'items'),
      orderBy('order', 'desc'),
      limit(5)
    );
    const snapshot = await getDocs(itemsQuery);

    // Find the last item that has an image
    for (const itemDoc of snapshot.docs) {
      const item = itemDoc.data();
      if (item.type === 'album' && item.albumCover) {
        return {
          image: item.albumCover,
          link: NAVIDROME_SERVER_URL ? `${NAVIDROME_SERVER_URL}/app/#/album/${item.albumId}/show` : '',
          avatar: item.addedByAvatar || '',
        };
      }
      if (item.type === 'custom' && item.imageUrl) {
        return {
          image: item.imageUrl,
          link: item.linkUrl || '',
          avatar: item.addedByAvatar || '',
        };
      }
    }

    // No item with image - return avatar of last item
    if (snapshot.docs.length > 0) {
      const lastItem = snapshot.docs[0].data();
      return { image: '', link: '', avatar: lastItem.addedByAvatar || '' };
    }
  } catch (error) {
    console.error('Error fetching items for list', listId, error);
  }
  return { image: '', link: '', avatar: '' };
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
        const result: RecentList[] = [];
        const seenIds = new Set<string>();

        // First: try lists that have lastUpdated metadata
        const updatedQuery = query(
          collection(db, 'lists'),
          orderBy('lastUpdated', 'desc'),
          limit(10)
        );
        const updatedSnapshot = await getDocs(updatedQuery);

        for (const docSnap of updatedSnapshot.docs) {
          if (result.length >= 3) break;
          const data = docSnap.data();
          if (data.isPublic === false) continue;
          seenIds.add(docSnap.id);
          result.push({
            id: docSnap.id,
            title: data.title || 'Untitled',
            lastItemImage: data.lastItemImage || '',
            lastItemLink: data.lastItemLink || '',
            lastItemAddedByAvatar: data.lastItemAddedByAvatar || '',
          });
        }

        // If we don't have 3 yet, backfill from timestamp-ordered lists (legacy)
        if (result.length < 3) {
          const fallbackQuery = query(
            collection(db, 'lists'),
            orderBy('timestamp', 'desc'),
            limit(10)
          );
          const fallbackSnapshot = await getDocs(fallbackQuery);

          for (const docSnap of fallbackSnapshot.docs) {
            if (result.length >= 3) break;
            if (seenIds.has(docSnap.id)) continue;
            const data = docSnap.data();
            if (data.isPublic === false) continue;

            // Fetch item data on-the-fly for legacy lists
            const itemData = await fetchLastItemForList(docSnap.id);

            result.push({
              id: docSnap.id,
              title: data.title || 'Untitled',
              lastItemImage: itemData.image,
              lastItemLink: itemData.link,
              lastItemAddedByAvatar: itemData.avatar,
            });
          }
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
    if (list.lastItemImage && list.lastItemLink) {
      window.open(list.lastItemLink, '_blank', 'noopener,noreferrer');
    } else {
      navigate(`/lists/${list.id}`);
    }
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
