import React, { useState, useRef } from 'react';
import './UserMessage.css';
import Button from './Button'; // Import the actual Button component
import parse, { type HTMLReactParserOptions, Element, domToReact, type DOMNode } from 'html-react-parser';
import { FaHeart, FaRegHeart } from 'react-icons/fa';

interface Reaction {
  userId: string;
  username: string;
  timestamp: any;
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

// Utility function to sanitize and parse HTML content safely
const parseMessageHTML = (htmlString: string): React.ReactNode => {
  // HTML parser options with security measures
  const options: HTMLReactParserOptions = {
    replace: (domNode) => {
      if (domNode instanceof Element) {
        const { name, attribs, children } = domNode;

        // Only allow anchor tags
        if (name === 'a') {
          const href = attribs?.href;

          // Validate the URL
          if (!href || !isValidUrl(href)) {
            // If invalid URL, render as plain text
            return <span>{domToReact(children as DOMNode[], options)}</span>;
          }

          // Create safe link with security attributes
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

        // For any other HTML tags, render as plain text
        return <span>{domToReact(children as DOMNode[], options)}</span>;
      }

      // Return undefined to use default behavior for text nodes
      return undefined;
    }
  };

  try {
    return parse(htmlString, options);
  } catch (error) {
    console.warn('Failed to parse HTML content, falling back to plain text:', error);
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
  onToggleReaction
}) => {
  const [imageError, setImageError] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const [isLongPress, setIsLongPress] = useState(false);
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);

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
    <div className="user-message">
      <div className="user-message-sticker-container">
        {renderUserSticker()}
      </div>
      <div className="user-message-content">
        <div className="user-message-username">{username}</div>
        <div className="user-message-timestamp">{timestamp}</div>
        <div className="user-message-separator"></div>
        <div className="user-message-text">{parseMessageHTML(message)}</div>
      </div>
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
      {!hideCloseButton && ( // Conditionally render the close button
        <Button type='close' onClick={onClose} className="custom-close-button" />
      )}
    </div>
  );
};

export default UserMessage;