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
  linkUrl?: string;
}

type ListItemProps = AlbumListItemProps | CustomListItemProps;

const ListItem: React.FC<ListItemProps> = (props) => {
  const { type, userText, username, timestamp, onRemove, showRemoveButton = false } = props;

  const handleItemClick = () => {
    if (type === 'album') {
      // Open album in Navidrome
      const NAVIDROME_SERVER_URL = import.meta.env.VITE_NAVIDROME_SERVER_URL;
      if (NAVIDROME_SERVER_URL && props.albumId) {
        window.open(`${NAVIDROME_SERVER_URL}/app/#/album/${props.albumId}/show`, '_blank');
      }
    } else if (type === 'custom' && props.linkUrl) {
      // Open custom item link
      window.open(props.linkUrl, '_blank', 'noopener,noreferrer');
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
        clickable: !!props.linkUrl,
        typeLabel: '📝 Custom Item'
      };
    }
  };

  const itemDetails = getItemDetails();

  return (
    <div className="user-message" style={{ flexDirection: 'column', padding: '0' }}>
      {showRemoveButton && onRemove && (
        <button 
          className="user-message-close-button"
          onClick={onRemove}
          aria-label="Remove album from list"
          style={{ top: '8px', right: '8px', zIndex: 20 }}
        >
          ✕
        </button>
      )}

      {/* Full-width header image */}
      {itemDetails.imageUrl && (
        <div 
          style={{
            width: '100%',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            borderRadius: '12px 12px 0 0',
            position: 'relative',
            backgroundColor: 'var(--colour1)'
          }}
        >
          <img
            src={itemDetails.imageUrl}
            alt={itemDetails.imageAlt}
            onClick={itemDetails.clickable ? handleItemClick : undefined}
            onError={handleImageError}
            style={{ 
              maxWidth: '100%',
              objectFit: 'contain',
              cursor: itemDetails.clickable ? 'pointer' : 'default',
              borderRadius: '12px 12px 0 0'
            }}
          />
        </div>
      )}

      {/* Content container */}
      <div className="user-message-content" style={{ padding: '16px' }}>
        {/* Item title (replaces username) */}
        <div className="user-message-username">
          {itemDetails.title}
          {itemDetails.subtitle && (
            <span style={{ fontWeight: 'normal', opacity: 0.8, marginLeft: '8px' }}>
              {itemDetails.subtitle}
            </span>
          )}
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