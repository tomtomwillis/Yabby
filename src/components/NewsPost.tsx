import React, { useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { parseMessageHTML } from './basic/UserMessages';
import { sanitizeHtml } from '../utils/sanitise';
import { FaHeart, FaRegHeart, FaEdit, FaTrash } from 'react-icons/fa';
import ForumBox from './basic/ForumMessageBox';
import './basic/UserMessage.css';

interface Reaction {
  userId: string;
  username: string;
  timestamp: any;
}

interface NewsPostProps {
  username: string;
  message: string;
  timestamp: string;
  userSticker?: string;
  userId?: string;
  currentUserId?: string;
  isAdmin?: boolean;
  onEdit?: (newText: string) => void;
  onDelete?: () => void;
  edited?: boolean;
  truncate?: boolean;
  truncateWords?: number;
  reactions?: Reaction[];
  reactionCount?: number;
  currentUserReacted?: boolean;
  onToggleReaction?: () => void;
}

const normalizeAvatarPath = (avatarPath: string): string => {
  if (!avatarPath) return '';
  const cleanPath = avatarPath.startsWith('/') ? avatarPath.substring(1) : avatarPath;
  if (cleanPath.startsWith('Stickers/')) return `/${cleanPath}`;
  if (cleanPath.startsWith('assets/')) return `/Stickers/${cleanPath.replace('assets/', '')}`;
  if (cleanPath.includes('/')) return `/Stickers/${cleanPath.split('/').pop() || ''}`;
  return `/Stickers/${cleanPath}`;
};

const NewsPost: React.FC<NewsPostProps> = ({
  username,
  message,
  timestamp,
  userSticker,
  userId,
  currentUserId,
  isAdmin,
  onEdit,
  onDelete,
  edited,
  truncate = false,
  truncateWords = 25,
  reactions,
  reactionCount,
  currentUserReacted,
  onToggleReaction,
}) => {
  const [imageError, setImageError] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const [isLongPress, setIsLongPress] = useState(false);
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);

  const isOwner = userId !== undefined && currentUserId !== undefined && userId === currentUserId;
  const canEdit = isOwner && isAdmin && onEdit;
  const canDelete = onDelete && isAdmin;

  const isImage = userSticker?.endsWith('.webp') ||
                  userSticker?.endsWith('.png') ||
                  userSticker?.endsWith('.jpg') ||
                  userSticker?.endsWith('.jpeg');

  const normalizedStickerPath = isImage ? normalizeAvatarPath(userSticker || '') : userSticker;

  // Truncation logic
  const words = message.split(/\s+/);
  const needsTruncation = truncate && !expanded && words.length > truncateWords;
  const displayMessage = needsTruncation
    ? words.slice(0, truncateWords).join(' ') + '...'
    : message;

  const handleTouchStart = () => {
    longPressTimer.current = setTimeout(() => {
      setShowTooltip(true);
      setIsLongPress(true);
    }, 500);
  };

  const handleTouchEnd = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    setIsLongPress(false);
  };

  const handleDelete = () => {
    if (window.confirm('Are you sure you want to delete this news post? This cannot be undone.')) {
      onDelete?.();
    }
  };

  const renderUserSticker = () => {
    if (isImage && !imageError) {
      return (
        <img
          src={normalizedStickerPath}
          alt={`${username}'s avatar`}
          className="user-message-sticker"
          onError={() => setImageError(true)}
        />
      );
    } else if (isImage && imageError) {
      return (
        <div
          className="user-message-sticker user-message-sticker-fallback"
          style={{
            backgroundColor: '#ccc',
            color: 'white',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 'bold'
          }}
        >
          {username.charAt(0).toUpperCase()}
        </div>
      );
    } else {
      return <span className="user-message-sticker">{userSticker}</span>;
    }
  };

  return (
    <div className="user-message">
      <div className="user-message-sticker-container">
        {renderUserSticker()}
      </div>
      <div className="user-message-content">
        <div className="user-message-username">
          {userId ? (
            <Link to={`/user/${userId}`} className="user-message-username-link">
              {username}
            </Link>
          ) : (
            username
          )}
        </div>
        <div className="user-message-timestamp">
          {timestamp}
          {edited && <span className="user-message-edited-indicator"> (edited)</span>}
        </div>
        <div className="user-message-separator"></div>

        {isEditing ? (
          <div className="user-message-edit-container">
            <ForumBox
              placeholder="Edit your news post..."
              initialValue={message}
              onSend={(text) => {
                const sanitized = sanitizeHtml(text.trim());
                if (!sanitized.trim()) {
                  alert('Your post contains invalid content. Please try again.');
                  return;
                }
                onEdit?.(sanitized);
                setIsEditing(false);
              }}
              maxWords={1000}
              maxChars={5000}
              showSendButton={true}
            />
            <button
              className="user-message-cancel-reply"
              onClick={() => setIsEditing(false)}
            >
              Cancel
            </button>
          </div>
        ) : (
          <div className="user-message-text">
            {parseMessageHTML(displayMessage)}
            {needsTruncation && (
              <button
                onClick={() => setExpanded(true)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--colour3)',
                  cursor: 'pointer',
                  fontFamily: 'var(--font2)',
                  fontSize: '0.9em',
                  padding: '2px 4px',
                  marginLeft: '4px',
                  textDecoration: 'underline',
                }}
              >
                Show More
              </button>
            )}
            {truncate && expanded && words.length > truncateWords && (
              <button
                onClick={() => setExpanded(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--colour3)',
                  cursor: 'pointer',
                  fontFamily: 'var(--font2)',
                  fontSize: '0.9em',
                  padding: '2px 4px',
                  marginLeft: '4px',
                  textDecoration: 'underline',
                }}
              >
                Show Less
              </button>
            )}
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="user-message-actions-container">
        {canEdit && !isEditing && (
          <div
            className="user-message-edit-button"
            onClick={() => setIsEditing(true)}
            role="button"
            tabIndex={0}
            aria-label="Edit news post"
          >
            <FaEdit />
          </div>
        )}

        {canDelete && !isEditing && (
          <div
            className="user-message-delete-button"
            onClick={handleDelete}
            role="button"
            tabIndex={0}
            aria-label="Delete news post"
          >
            <FaTrash />
          </div>
        )}

        {onToggleReaction && (
          <div
            className="user-message-reaction-container"
            onMouseEnter={() => setShowTooltip(true)}
            onMouseLeave={() => setShowTooltip(false)}
            onTouchStart={handleTouchStart}
            onTouchEnd={() => {
              handleTouchEnd();
              setTimeout(() => setShowTooltip(false), 2000);
            }}
            onTouchCancel={handleTouchEnd}
          >
            <div
              className={`user-message-heart-button ${currentUserReacted ? 'reacted' : ''}`}
              onClick={(e) => {
                if (isLongPress && showTooltip) {
                  e.preventDefault();
                  return;
                }
                onToggleReaction();
              }}
              role="button"
              tabIndex={0}
              aria-label="React to news post"
            >
              {currentUserReacted ? <FaHeart /> : <FaRegHeart />}
              {reactionCount !== undefined && reactionCount > 0 && (
                <span className="user-message-reaction-count">{reactionCount}</span>
              )}
            </div>
            {showTooltip && reactions && reactions.length > 0 && (
              <div className="user-message-reaction-tooltip">
                {reactions.map((reaction, index) => (
                  <div key={index}>{reaction.username}</div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default NewsPost;
