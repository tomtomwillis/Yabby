import React from 'react';
import { Link } from 'react-router-dom';
import './ListItem.css';
import { parseMessageHTML } from './basic/UserMessages';
import { normalizeAvatarPath } from '../utils/avatarPath';

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
  const { type, userText, onRemove, showRemoveButton = false } = props;

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
        typeLabel: '[album]'
      };
    } else {
      return {
        title: props.title,
        subtitle: null,
        imageUrl: props.imageUrl,
        imageAlt: props.title,
        clickable: !!props.linkUrl,
        typeLabel: '[custom]'
      };
    }
  };

  const itemDetails = getItemDetails();

  return (
    <div
      className={
        'ls-item' +
        (itemDetails.imageUrl ? '' : ' ls-item--no-image') +
        (showRemoveButton && onRemove ? ' ls-item--removable' : '')
      }
    >
      {itemDetails.imageUrl && (
        itemDetails.clickable ? (
          <button
            type="button"
            className="ls-item-thumb"
            onClick={handleItemClick}
            aria-label={`Open ${itemDetails.title}`}
          >
            <img src={itemDetails.imageUrl} alt={itemDetails.imageAlt} onError={handleImageError} />
          </button>
        ) : (
          <span className="ls-item-thumb">
            <img src={itemDetails.imageUrl} alt={itemDetails.imageAlt} onError={handleImageError} />
          </span>
        )
      )}

      <div className="ls-item-body">
        <div className="ls-item-head">
          {itemDetails.clickable ? (
            <button type="button" className="ls-item-title" onClick={handleItemClick}>
              {itemDetails.title}
            </button>
          ) : (
            <span className="ls-item-title">{itemDetails.title}</span>
          )}
          {itemDetails.subtitle && <span className="ls-item-artist">{itemDetails.subtitle}</span>}
          <span className="ls-item-kind">{itemDetails.typeLabel}</span>
        </div>

        <div className={`ls-item-text${userText ? '' : ' ls-item-text--none'}`}>
          {userText ? parseMessageHTML(userText) : 'no note.'}
        </div>

        {props.addedByUsername && (
          <div className="ls-item-by">
            {props.addedByAvatar && (
              <img
                className="ls-item-av"
                src={normalizeAvatarPath(props.addedByAvatar)}
                alt={`${props.addedByUsername}'s avatar`}
                onError={(e) => { e.currentTarget.style.display = 'none'; }}
              />
            )}
            {props.addedByUserId ? (
              <Link to={`/user/${props.addedByUserId}`}>added by {props.addedByUsername}</Link>
            ) : (
              <span>added by {props.addedByUsername}</span>
            )}
          </div>
        )}
      </div>

      {showRemoveButton && onRemove && (
        <button type="button" className="ls-item-del" onClick={onRemove} aria-label="Remove item from list">
          del
        </button>
      )}
    </div>
  );
};

export default ListItem;
