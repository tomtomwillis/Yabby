import React from 'react';
import './basic/UserMessage.css';

interface BaseListItemProps {
  type: 'album' | 'custom';
  userText: string;
  username: string;
  timestamp: string;
  onRemove?: () => void;
  showRemoveButton?: boolean;
}

interface AlbumListItemProps extends BaseListItemProps {
  type: 'album';
  albumId: string;
  albumTitle: string;
  albumArtist: string;
  albumCover: string;
}

interface CustomListItemProps extends BaseListItemProps {
  type: 'custom';
  title: string;
  imageUrl?: string;
}

type ListItemProps = AlbumListItemProps | CustomListItemProps;

const ListItem: React.FC<ListItemProps> = (props) => {
  const { type, userText, username, timestamp, onRemove, showRemoveButton = false } = props;

  const handleAlbumClick = () => {
    // Open album in Navidrome (only for album items)
    if (type === 'album') {
      const NAVIDROME_SERVER_URL = import.meta.env.VITE_NAVIDROME_SERVER_URL;
      if (NAVIDROME_SERVER_URL && props.albumId) {
        window.open(`${NAVIDROME_SERVER_URL}/app/#/album/${props.albumId}/show`, '_blank');
      }
    }
  };

  const handleImageError = (e: React.SyntheticEvent<HTMLImageElement>) => {
    // Fallback to hiding image on error
    e.currentTarget.style.display = 'none';
  };

  // Get display properties based on item type
  const getItemDetails = () => {
    if (type === 'album') {
      return {
        title: props.albumTitle,
        subtitle: `by ${props.albumArtist}`,
        imageUrl: props.albumCover,
        imageAlt: `${props.albumTitle} by ${props.albumArtist}`,
        clickable: true,
        typeLabel: '🎵 Album'
      };
    } else {
      return {
        title: props.title,
        subtitle: null,
        imageUrl: props.imageUrl,
        imageAlt: props.title,
        clickable: false,
        typeLabel: '📝 Custom Item'
      };
    }
  };

  const itemDetails = getItemDetails();

  return (
    <div className="user-message">
      {showRemoveButton && onRemove && (
        <button 
          className="user-message-close-button"
          onClick={onRemove}
          aria-label="Remove album from list"
        >
          ✕
        </button>
      )}

      {/* Image container (for both album covers and custom images) */}
      {itemDetails.imageUrl && (
        <div className="user-message-sticker-container">
          <img
            src={itemDetails.imageUrl}
            alt={itemDetails.imageAlt}
            className="user-message-sticker list-item-album-cover"
            onClick={itemDetails.clickable ? handleAlbumClick : undefined}
            onError={handleImageError}
            style={{ cursor: itemDetails.clickable ? 'pointer' : 'default' }}
          />
        </div>
      )}

      {/* Content container */}
      <div className="user-message-content">
        {/* Item title (replaces username) */}
        <div className="user-message-username">
          {itemDetails.title}
          {itemDetails.subtitle && (
            <span style={{ fontWeight: 'normal', opacity: 0.8, marginLeft: '8px' }}>
              {itemDetails.subtitle}
            </span>
          )}
        </div>

        {/* Timestamp, user info, and type label */}
        <div className="user-message-timestamp">
          Added by {username} • {timestamp} • {itemDetails.typeLabel}
        </div>

        {/* Separator */}
        <div className="user-message-separator"></div>

        {/* User's description text */}
        <div className="user-message-text">
          {userText || 'No description provided.'}
        </div>
      </div>
    </div>
  );
};

export default ListItem;