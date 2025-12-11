import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { collection, query, onSnapshot, orderBy, limit } from "firebase/firestore";
import { db } from "../firebaseConfig";
import Carousel from "./basic/Carousel";
import "./basic/Carousel.css";
import "./CarouselLists.css";

interface BaseListItem {
  type: 'album' | 'custom';
  userText: string;
  order: number;
}

interface AlbumListItem extends BaseListItem {
  type: 'album';
  albumId: string;
  albumTitle: string;
  albumArtist: string;
  albumCover: string;
}

interface CustomListItem extends BaseListItem {
  type: 'custom';
  title: string;
  imageUrl?: string;
}

type ListItem = AlbumListItem | CustomListItem;

interface List {
  id: string;
  title: string;
  userId: string;
  username: string;
  timestamp: any;
  itemCount: number;
  isPublic?: boolean;
  items?: ListItem[];
}

const CarouselLists: React.FC = () => {
  const navigate = useNavigate();
  const [lists, setLists] = useState<List[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const listsQuery = query(
      collection(db, 'lists'),
      orderBy('timestamp', 'desc'),
      limit(10)
    );

    const unsubscribe = onSnapshot(
      listsQuery,
      (snapshot) => {
        const listsData: List[] = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data() as List;

          // Only show public lists
          const isPublic = data.isPublic !== false;

          if (isPublic) {
            listsData.push({
              ...data,
              id: docSnap.id
            });
          }
        });
        setLists(listsData);
        setLoading(false);
        setError(null);
      },
      (err) => {
        console.error("Error fetching lists:", err);
        setError(err.message);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  // Truncate title if too long (more than 5 words)
  const truncateTitle = (title: string): string => {
    const words = title.split(' ');
    if (words.length > 5) {
      return words.slice(0, 5).join(' ') + '...';
    }
    return title;
  };

  if (loading) {
    return (
      <div className="carousel">
        <p>Loading lists...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="carousel">
        <p>Error loading lists: {error}</p>
      </div>
    );
  }

  if (lists.length === 0) {
    return (
      <div className="carousel">
        <p>No lists found</p>
      </div>
    );
  }

  const slides = lists.map((list) => (
    <div key={list.id} className="carousel__slide">
      <div
        className="carousel__slide-box"
        onClick={() => navigate(`/lists/${list.id}`)}
      >
        <div className="carousel__slide-content">
          <div className="carousel__slide-title">
            {truncateTitle(list.title)}
          </div>
          <div className="carousel__slide-meta">
            by {list.username}
          </div>
          <div className="carousel__slide-meta">
            {list.itemCount} item{list.itemCount !== 1 ? 's' : ''}
          </div>
        </div>
      </div>
    </div>
  ));

  return (
    <div className="carousel-lists">
      <Carousel slides={slides} loop autoplay />
    </div>
  );
};

export default CarouselLists;
