import React from 'react';
import { Link } from 'react-router-dom';
import './basic/UserMessage.css';
import { parseMessageHTML } from './basic/UserMessages';

const normalizeAvatarPath = (avatarPath: string): string => {
  if (!avatarPath) return '';
  const cleanPath = avatarPath.startsWith('/') ? avatarPath.substring(1) : avatarPath;
  if (cleanPath.startsWith('Stickers/')) return `/${cleanPath}`;
  if (cleanPath.startsWith('assets/')) {
    const fileName = cleanPath.replace('assets/', '');
    return `/Stickers/${fileName}`;
  }
  if (cleanPath.includes('/')) {
    const fileName = cleanPath.split('/').pop() || '';
    return `/Stickers/${fileName}`;
  }
  return `/Stickers/${cleanPath}`;
};

interface BaseListItemProps {
  type: 'album' | 'custom';
  userText: string;
  username: string;
  timestamp: string;
  onRemove?: () => void;
  showRemoveButton?: boolean;
  addedByUserId?: string;
  addedByUsername?: string;
  addedByAvatar?: string;
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
      <div
        className="user-message-content"
        style={{ padding: '16px', cursor: itemDetails.clickable ? 'pointer' : 'default' }}
        onClick={itemDetails.clickable ? handleItemClick : undefined}
      >
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
          {userText ? parseMessageHTML(userText) : 'No description provided.'}
        </div>

        {/* Attribution - who added this item */}
        {props.addedByUsername && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            marginTop: '8px',
            fontSize: '0.8em',
            opacity: 0.7
          }}>
            {props.addedByAvatar && (
              <img
                src={normalizeAvatarPath(props.addedByAvatar)}
                alt={`${props.addedByUsername}'s avatar`}
                style={{
                  width: '1em',
                  height: '1em',
                  borderRadius: '50%',
                  objectFit: 'cover'
                }}
                onError={(e) => { e.currentTarget.style.display = 'none'; }}
              />
            )}
            {props.addedByUserId ? (
              <Link
                to={`/user/${props.addedByUserId}`}
                style={{ color: 'inherit', textDecoration: 'none' }}
              >
                Added by {props.addedByUsername}
              </Link>
            ) : (
              <span>Added by {props.addedByUsername}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ListItem;