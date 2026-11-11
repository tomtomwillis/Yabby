import React, { useState, useEffect } from 'react';
import { auth } from '../firebaseConfig';
import UserMessage from './basic/UserMessages';
import './MessageBoard.css';
import ForumBox from './basic/ForumMessageBox';
import Button from './basic/Button';
import { useAdmin } from '../utils/useAdmin';
import { getUserData } from '../utils/userCache';
import { EVENT_BOT_BOARDS } from '../utils/eventsApi';
import { formatTimestamp } from '../utils/formatTimestamp';
import type { CrossPostSource } from '../types/firestore';
import { useBoardMessages } from './board/useBoardMessages';
import { useBoardActions } from './board/useBoardActions';

interface MessageBoardProps {
  enableReactions?: boolean;
  enableReplies?: boolean;
  collectionName?: string;
  // When set, only messages with this status are loaded and new posts are
  // created as 'inprogress'. Changing the filter requires a remount (key prop).
  statusFilter?: 'inprogress' | 'complete';
  enablePolls?: boolean;
  enableFilmAnnounce?: boolean;
  showComposer?: boolean;
  highlightMessageId?: string;
  // Forum identity block under each poster's name. Costs a users read per
  // distinct author on screen, so only the message board turns it on.
  showPosterStats?: boolean;
  /** Leave the newest N replies on show under each post instead of hiding the
      whole thread behind the toggle. Off by default because it is not free: a
      page of messages costs one extra (N-document) subcollection query per
      message that has replies. Where a thread turns out to be no longer than
      the preview, that query has fetched all of it and expanding costs
      nothing. */
  replyPreviewCount?: number;
  /** Draw the composer with the signed-in user's avatar beside it. */
  showComposerAvatar?: boolean;
  /** Rendered between the composer and the thread list — the board's own
      heading for the list, which only the page above knows the wording of. */
  listHeader?: React.ReactNode;
  /** The ledger layout: every composer on the board — the one at the top, and
      the reply and edit boxes inside a post — puts send, attach and the counter
      in a row under the field rather than inside it. */
  ledger?: boolean;
  /** Other boards whose cross-posted threads are listed here alongside this
      board's own, newest activity first. */
  crossPostSources?: CrossPostSource[];
  /** Offer a tick box on the composer that also lists the post on the main
      board. Writes showOnMain, which is what the main board queries on. */
  enableCrossPost?: boolean;
  composerPlaceholder?: string;
  /** How long a post on this board may be. News runs to essays; chat does not.
      Applies to the composer and to the edit box on a post, not to replies. */
  postMaxWords?: number;
  postMaxChars?: number;
}

const NO_CROSS_POST_SOURCES: CrossPostSource[] = [];

const MessageBoard: React.FC<MessageBoardProps> = ({
  enableReactions = false,
  enableReplies = false,
  collectionName = 'messages',
  statusFilter,
  enablePolls = true,
  enableFilmAnnounce = true,
  showComposer = true,
  highlightMessageId,
  showPosterStats = false,
  replyPreviewCount = 0,
  showComposerAvatar = false,
  listHeader,
  ledger = false,
  crossPostSources = NO_CROSS_POST_SOURCES,
  enableCrossPost = false,
  composerPlaceholder,
  postMaxWords = 250,
  postMaxChars = 1000,
}) => {
  const [composerAvatar, setComposerAvatar] = useState<string>('');
  const [composerName, setComposerName] = useState<string>('');
  const { isAdmin } = useAdmin();

  const {
    messages,
    setMessages,
    loadingMessages,
    hasMore,
    loadingMore,
    expandedReplies,
    setExpandedReplies,
    boardOf,
    loadInitialMessages,
    loadMoreMessages,
    handleToggleReplies,
    handleReactionHover,
    handleReplyReactionHover,
    handlePollVoterHover,
  } = useBoardMessages({
    collectionName,
    statusFilter,
    crossPostSources,
    replyPreviewCount,
    highlightMessageId,
    enableReactions,
    enableReplies,
  });

  const {
    loading,
    setPendingImage,
    setPendingPoll,
    crossPostChecked,
    setCrossPostChecked,
    handleSendMessage,
    handleTogglePollVote,
    handleFilmAnnounce,
    handleEventAnnounce,
    handleToggleReaction,
    handleSendReply,
    handleToggleReplyReaction,
    handleEditMessage,
    handleToggleStatus,
    handleDeleteMessage,
    handleEditReply,
    handleDeleteReply,
  } = useBoardActions({
    messages,
    setMessages,
    setExpandedReplies,
    boardOf,
    loadInitialMessages,
    collectionName,
    statusFilter,
    replyPreviewCount,
    enableCrossPost,
  });

  // Your own avatar for the composer. Goes through the shared profile cache,
  // so on a board where you have already posted it is free.
  useEffect(() => {
    if (!showComposerAvatar) return;
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    let live = true;
    getUserData(uid).then((data) => {
      if (!live) return;
      setComposerAvatar(data.avatar);
      setComposerName(data.username);
    });
    return () => {
      live = false;
    };
  }, [showComposerAvatar]);

  return (
    <div className="message-board-container">
      {showComposer && (
        <ForumBox onSend={handleSendMessage} disabled={loading} placeholder={composerPlaceholder} maxWords={postMaxWords} maxChars={postMaxChars} onImageAttach={setPendingImage} onFilmAnnounce={isAdmin && enableFilmAnnounce ? handleFilmAnnounce : undefined} onEventAnnounce={isAdmin && EVENT_BOT_BOARDS.includes(collectionName) ? handleEventAnnounce : undefined} onPollAttach={enablePolls ? setPendingPoll : undefined} avatar={showComposerAvatar ? composerAvatar : undefined} avatarName={showComposerAvatar ? composerName : undefined} outsideControls={ledger} crossPost={enableCrossPost ? { label: 'also post to the message board', checked: crossPostChecked, onChange: setCrossPostChecked } : undefined} />
      )}
      {listHeader}
      <div className="messages-container">
        {loadingMessages && <p className="messages-loading">Loading messages...</p>}
        {messages.map((message) => {
          const canReact = enableReactions;
          const canReply = enableReplies;
          return (
          <div key={`${message.sourceBoard?.collection ?? ''}${message.id}`} id={`mb-msg-${message.id}`} className={message.id === highlightMessageId ? 'mb-msg-highlight' : undefined}>
          <UserMessage
            username={message.username || 'Anonymous'}
            message={message.text}
            timestamp={formatTimestamp(message.timestamp)}
            userSticker={message.avatar || 'default-avatar.png'}
            userId={message.userId}
            isBot={message.isBot}
            currentUserId={auth.currentUser?.uid}
            isAdmin={isAdmin}
            showPosterStats={showPosterStats}
            replyPreviewCount={canReply ? replyPreviewCount : 0}
            ledgerControls={ledger}
            postMaxWords={message.sourceBoard?.postMaxWords ?? postMaxWords}
            sourceTag={message.sourceBoard && { label: message.sourceBoard.label, href: message.sourceBoard.href }}
            onEdit={(newText: string) => handleEditMessage(message, newText)}
            onDelete={() => handleDeleteMessage(message)}
            onEditReply={(replyId: string, newText: string) => handleEditReply(message, replyId, newText)}
            onDeleteReply={(replyId: string) => handleDeleteReply(message, replyId)}
            edited={!!message.editedAt}
            imageId={message.imageId}
            posterUrl={message.posterUrl}
            pollQuestion={message.pollQuestion}
            pollOptions={message.pollOptions}
            pollMultiple={message.pollMultiple}
            pollVotes={message.pollVotes}
            pollVoterNames={message.pollVoterNames}
            onTogglePollVote={(optionIndex: number) => handleTogglePollVote(message, optionIndex)}
            onPollVoterHover={(optionIndex: number) => handlePollVoterHover(message.id, optionIndex)}
            onClose={() => {}}
            hideCloseButton={true}
            reactions={canReact ? message.reactions : undefined}
            reactionCount={canReact ? message.reactionCount : undefined}
            currentUserReacted={canReact ? message.currentUserReacted : undefined}
            onToggleReaction={canReact ? () => handleToggleReaction(message) : undefined}
            onReactionHover={canReact ? () => handleReactionHover(message.id) : undefined}
            replies={canReply ? message.replies : undefined}
            replyCount={canReply ? message.replyCount : undefined}
            onReply={canReply ? (text: string, image?: File | null) => handleSendReply(message, text, image) : undefined}
            onToggleReplies={canReply ? () => handleToggleReplies(message) : undefined}
            repliesExpanded={canReply ? expandedReplies.has(message.id) : undefined}
            onToggleReplyReaction={canReply && canReact ? (replyId: string) => handleToggleReplyReaction(message, replyId) : undefined}
            onReplyReactionHover={canReply && canReact ? (replyId: string) => handleReplyReactionHover(message.id, replyId) : undefined}
            replyingToUsername={message.username}
            enableReplies={canReply}
            status={message.status as 'inprogress' | 'complete' | undefined}
            onToggleStatus={statusFilter && !message.sourceBoard && (isAdmin || message.userId === auth.currentUser?.uid) ? () => handleToggleStatus(message.id) : undefined}
          />
          </div>
          );
        })}
      </div>

      {!loadingMessages && hasMore && (
        <div className="messages-more">
          <Button
            type="basic"
            label={loadingMore ? 'Loading...' : 'Load More Messages'}
            onClick={loadMoreMessages}
            disabled={loadingMore}
          />
        </div>
      )}


      {!loadingMessages && !hasMore && messages.length > 0 && (
        <div className="messages-end">
          No more messages to load
        </div>
      )}
    </div>
  );
};

export default MessageBoard;

