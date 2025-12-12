import React from 'react';
import './basic/UserMessage.css';

interface BaseListItemProps {
  type: 'album' | 'custom';
  userText: string;
  username: string;
  timestamp: string;
  userId: string;
  userAvatar?: string;
  onRemove?: () => void;
  onEdit?: () => void;
  showRemoveButton?: boolean;
  showEditButton?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
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
  const { 
    type, 
    userText, 
    username = '', 
    timestamp = '', 
    userId = '',
    userAvatar,
    onRemove, 
    onEdit,
    showRemoveButton = false,
    showEditButton = false,
    canEdit = false,
    canDelete = false
  } = props;

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

        {/* User attribution section - only show on communal lists */}
        {(userId && username) && (
          <div style={{
            marginTop: '12px',
            paddingTop: '8px',
            borderTop: '1px solid var(--colour3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {userAvatar ? (
                <img 
                  src={userAvatar} 
                  alt={username || 'User'}
                  style={{
                    width: '24px',
                    height: '24px',
                    borderRadius: '50%',
                    objectFit: 'cover'
                  }}
                />
              ) : (
                <div style={{
                  width: '24px',
                  height: '24px',
                  borderRadius: '50%',
                  backgroundColor: 'var(--colour4)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '12px',
                  color: 'var(--colour1)'
                }}>
                  {(username || 'U').charAt(0).toUpperCase()}
                </div>
              )}
              <span style={{ 
                fontSize: '0.85em',
                color: 'var(--colour4)',
                opacity: 0.8
              }}>
                Added by {username || 'Anonymous'}
              </span>
            </div>

            {/* Edit/Delete buttons for item owner */}
            {(canEdit || canDelete) && (
              <div style={{ display: 'flex', gap: '8px' }}>
                {canEdit && onEdit && (
                  <button
                    onClick={onEdit}
                    style={{
                      background: 'none',
                      border: '1px solid var(--colour3)',
                      borderRadius: '6px',
                      padding: '4px 8px',
                      fontSize: '0.8em',
                      color: 'var(--colour2)',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease'
                    }}
                    onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'var(--colour3)'}
                    onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                  >
                    ✏️ Edit
                  </button>
                )}
                {canDelete && onRemove && (
                  <button
                    onClick={onRemove}
                    style={{
                      background: 'none',
                      border: '1px solid var(--colour3)',
                      borderRadius: '6px',
                      padding: '4px 8px',
                      fontSize: '0.8em',
                      color: 'var(--colour2)',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease'
                    }}
                    onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'var(--colour3)'}
                    onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                  >
                    🗑️ Delete
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ListItem;