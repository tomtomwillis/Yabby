import React, { useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import './UserMessage.css';
import Button from './Button'; // Import the actual Button component
import parse, { type HTMLReactParserOptions, Element, domToReact, type DOMNode } from 'html-react-parser';
import { FaHeart, FaRegHeart, FaPlus, FaMinus, FaReply, FaEdit, FaTrash } from 'react-icons/fa';
import ForumBox from './ForumMessageBox';
import { sanitizeHtml, parseMarkdownLinks, linkifyText } from '../../utils/sanitise';

interface Reaction {
  userId: string;
  username: string;
  timestamp: any;
}

interface Reply {
  id: string;
  text: string;
  userId: string;
  timestamp: any;
  username: string;
  avatar: string;
  reactions?: Reaction[];
  reactionCount?: number;
  currentUserReacted?: boolean;
}

interface UserMessageProps {
  username: string;
  message: string;
  timestamp: string;
  userSticker?: string; // Can be an emoji or an image URL
  onClose: () => void;
  hideCloseButton?: boolean; // New optional prop to hide the close button
  reactions?: Reaction[];
  reactionCount?: number;
  currentUserReacted?: boolean;
  onToggleReaction?: () => void;
  replies?: Reply[];
  replyCount?: number;
  onReply?: (text: string) => void;
  onToggleReplies?: () => void;
  repliesExpanded?: boolean;
  isReply?: boolean;
  onToggleReplyReaction?: (replyId: string) => void;
  replyingToUsername?: string;
  enableReplies?: boolean;
  // New props for edit/delete and profile links
  userId?: string;
  currentUserId?: string;
  isAdmin?: boolean;
  onEdit?: (newText: string) => void;
  onDelete?: () => void;
  onEditReply?: (replyId: string, newText: string) => void;
  onDeleteReply?: (replyId: string) => void;
  edited?: boolean;
}

// Utility function to normalize avatar paths
const normalizeAvatarPath = (avatarPath: string): string => {
  if (!avatarPath) return '';

  // Remove leading slash if present
  const cleanPath = avatarPath.startsWith('/') ? avatarPath.substring(1) : avatarPath;

  // Handle different path formats
  if (cleanPath.startsWith('Stickers/')) {
    // Path is already in correct format: "Stickers/avatar_name.webp"
    return `/${cleanPath}`;
  } else if (cleanPath.startsWith('assets/')) {
    // Convert "assets/avatar_name.webp" to "Stickers/avatar_name.webp"
    const fileName = cleanPath.replace('assets/', '');
    return `/Stickers/${fileName}`;
  } else if (cleanPath.includes('/')) {
    // Extract just the filename from any path format
    const fileName = cleanPath.split('/').pop() || '';
    return `/Stickers/${fileName}`;
  } else {
    // Assume it's just a filename
    return `/Stickers/${cleanPath}`;
  }
};

// Utility function to validate and sanitize URLs
const isValidUrl = (url: string): boolean => {
  try {
    const urlObj = new URL(url);
    // Only allow http and https protocols
    return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
  } catch {
    return false;
  }
};

// Utility function to format message text for display.
// Handles both legacy HTML messages (with <a>, <br> tags) and new plain text messages.
const parseMessageHTML = (htmlString: string): React.ReactNode => {
  // 1. Sanitize HTML (preserves safe tags like <a>, <br> from legacy messages)
  let processed = sanitizeHtml(htmlString);

  // 2. Convert \n to <br> (for new plain text messages; legacy HTML messages don't have \n)
  processed = processed.replace(/\n/g, '<br>');

  // 3. Parse markdown-style [text](url) links (from @/# tagging in new messages)
  processed = parseMarkdownLinks(processed);

  // 4. Auto-detect bare URLs and wrap in <a> tags (skips URLs already in <a> tags)
  processed = linkifyText(processed);

  // HTML parser options — enforce safe link rendering
  const options: HTMLReactParserOptions = {
    replace: (domNode) => {
      if (domNode instanceof Element) {
        const { name, attribs, children } = domNode;

        if (name === 'a') {
          const href = attribs?.href;
          if (!href || !isValidUrl(href)) {
            return <span>{domToReact(children as DOMNode[], options)}</span>;
          }
          return (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="user-message-link"
            >
              {domToReact(children as DOMNode[], options)}
            </a>
          );
        }

        // Allow <br> tags through
        if (name === 'br') {
          return <br />;
        }

        // For any other HTML tags, render as plain text
        return <span>{domToReact(children as DOMNode[], options)}</span>;
      }
      return undefined;
    }
  };

  try {
    return parse(processed, options);
  } catch (error) {
    console.warn('Failed to parse message content, falling back to plain text:', error);
    return htmlString;
  }
};

const UserMessage: React.FC<UserMessageProps> = ({
  username,
  message,
  timestamp,
  userSticker,
  onClose,
  hideCloseButton,
  reactions,
  reactionCount,
  currentUserReacted,
  onToggleReaction,
  replies,
  replyCount,
  onReply,
  onToggleReplies,
  repliesExpanded,
  isReply,
  onToggleReplyReaction,
  replyingToUsername,
  enableReplies,
  userId,
  currentUserId,
  isAdmin,
  onEdit,
  onDelete,
  onEditReply,
  onDeleteReply,
  edited
}) => {
  const [imageError, setImageError] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const [isLongPress, setIsLongPress] = useState(false);
  const [showReplyInput, setShowReplyInput] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState('');
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);

  const isOwner = userId !== undefined && currentUserId !== undefined && userId === currentUserId;
  const canEdit = isOwner && onEdit;
  const canDelete = onDelete && (isOwner || isAdmin);

  const handleTouchStart = () => {
    longPressTimer.current = setTimeout(() => {
      setShowTooltip(true);
      setIsLongPress(true);
    }, 500); // 500ms long press
  };

  const handleTouchEnd = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    setIsLongPress(false);
  };

  const formatTimestamp = (timestamp: any): string => {
    if (!timestamp) return '';
    try {
      return new Date(timestamp.seconds * 1000).toLocaleString();
    } catch (error) {
      return '';
    }
  };

  const handleStartEdit = () => {
    setEditText(message);
    setIsEditing(true);
  };

  const handleSaveEdit = () => {
    const sanitized = sanitizeHtml(editText.trim());
    if (!sanitized.trim()) {
      alert('Your message contains invalid content. Please try again.');
      return;
    }
    onEdit?.(sanitized);
    setIsEditing(false);
  };

  const handleDelete = () => {
    if (window.confirm('Are you sure you want to delete this? This cannot be undone.')) {
      onDelete?.();
    }
  };

  // Check if userSticker is an image file
  const isImage = userSticker?.endsWith('.webp') ||
                  userSticker?.endsWith('.png') ||
                  userSticker?.endsWith('.jpg') ||
                  userSticker?.endsWith('.jpeg');

  // Get the normalized path for images
  const normalizedStickerPath = isImage ? normalizeAvatarPath(userSticker || '') : userSticker;

  const handleImageError = () => {
    console.warn(`Failed to load avatar: ${normalizedStickerPath} for user: ${username}`);
    setImageError(true);
  };

  const renderUserSticker = () => {
    if (isImage && !imageError) {
      return (
        <img
          src={normalizedStickerPath}
          alt={`${username}'s avatar`}
          className="user-message-sticker"
          onError={handleImageError}
        />
      );
    } else if (isImage && imageError) {
      // Fallback for failed image loads - show user initial
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
      // Regular emoji or text sticker
      return <span className="user-message-sticker">{userSticker}</span>;
    }
  };

  return (
    <div className={`user-message ${isReply ? 'reply' : ''}`}>
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
              placeholder="Edit your message..."
              initialValue={editText}
              onSend={(text) => {
                const sanitized = sanitizeHtml(text.trim());
                if (!sanitized.trim()) {
                  alert('Your message contains invalid content. Please try again.');
                  return;
                }
                onEdit?.(sanitized);
                setIsEditing(false);
              }}
              maxWords={250}
              maxChars={10000}
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
            {parseMessageHTML(message)}
          </div>
        )}


        {/* Reply count indicator - only show for non-reply messages with replies */}
        {!isReply && enableReplies && replyCount !== undefined && replyCount > 0 && (
          <div
            className="user-message-reply-indicator"
            onClick={onToggleReplies}
            role="button"
            tabIndex={0}
            aria-label={repliesExpanded ? "Collapse replies" : "Expand replies"}
          >
            {repliesExpanded ? <FaMinus /> : <FaPlus />}
            <span className="user-message-reply-count">{replyCount} {replyCount === 1 ? 'reply' : 'replies'}</span>
          </div>
        )}

        {/* Reply input */}
        {!isReply && showReplyInput && onReply && (
          <div className="user-message-reply-input-container">
            {replyingToUsername && (
              <div className="user-message-reply-header">
                Replying in thread to {replyingToUsername}
              </div>
            )}
            <ForumBox
              placeholder="Write a reply..."
              onSend={(text) => {
                onReply(text);
                setShowReplyInput(false);
              }}
              maxWords={250}
              maxChars={1000}
              showSendButton={true}
            />
            <button
              className="user-message-cancel-reply"
              onClick={() => setShowReplyInput(false)}
            >
              Cancel
            </button>
          </div>
        )}

        {/* Replies container */}
        {!isReply && repliesExpanded && replies && replies.length > 0 && (
          <div className="user-message-replies-container">
            {replies.map((reply) => (
              <UserMessage
                key={reply.id}
                username={reply.username}
                message={reply.text}
                timestamp={formatTimestamp(reply.timestamp)}
                userSticker={reply.avatar}
                userId={reply.userId}
                currentUserId={currentUserId}
                isAdmin={isAdmin}
                onEdit={onEditReply ? (newText: string) => onEditReply(reply.id, newText) : undefined}
                onDelete={onDeleteReply ? () => onDeleteReply(reply.id) : undefined}
                onClose={() => {}}
                hideCloseButton={true}
                reactions={reply.reactions}
                reactionCount={reply.reactionCount}
                currentUserReacted={reply.currentUserReacted}
                onToggleReaction={onToggleReplyReaction ? () => onToggleReplyReaction(reply.id) : undefined}
                isReply={true}
                enableReplies={false}
              />
            ))}
          </div>
        )}
      </div>

      {/* Action buttons container (reactions, reply, edit, delete) */}
      <div className="user-message-actions-container">
        {/* Edit button - owner only */}
        {canEdit && !isEditing && (
          <div
            className="user-message-edit-button"
            onClick={handleStartEdit}
            role="button"
            tabIndex={0}
            aria-label="Edit message"
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleStartEdit();
              }
            }}
          >
            <FaEdit />
          </div>
        )}

        {/* Delete button - owner or admin */}
        {canDelete && !isEditing && (
          <div
            className="user-message-delete-button"
            onClick={handleDelete}
            role="button"
            tabIndex={0}
            aria-label="Delete message"
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleDelete();
              }
            }}
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
              // Hide tooltip after a short delay on touch end
              setTimeout(() => setShowTooltip(false), 2000);
            }}
            onTouchCancel={handleTouchEnd}
          >
            <div
              className={`user-message-heart-button ${currentUserReacted ? 'reacted' : ''}`}
              onClick={(e) => {
                // Prevent reaction toggle only during active long press on mobile
                if (isLongPress && showTooltip) {
                  e.preventDefault();
                  return;
                }
                onToggleReaction();
              }}
              role="button"
              tabIndex={0}
              aria-label="React to message"
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onToggleReaction();
                }
              }}
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

        {/* Reply icon button - only show for non-reply messages */}
        {!isReply && enableReplies && onReply && (
          <div
            className="user-message-reply-icon-button"
            onClick={() => setShowReplyInput(!showReplyInput)}
            role="button"
            tabIndex={0}
            aria-label="Reply to message"
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setShowReplyInput(!showReplyInput);
              }
            }}
          >
            <FaReply />
          </div>
        )}
      </div>

      {!hideCloseButton && ( // Conditionally render the close button
        <Button type='close' onClick={onClose} className="custom-close-button" />
      )}
    </div>
  );
};

export default UserMessage;
