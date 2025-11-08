import React, { useEffect, useState, type ChangeEvent } from 'react';
import './ForumMessageBox.css';
import Editor,  {Toolbar, type ContentEditableEvent } from 'react-simple-wysiwyg';
import Button from './Button';

interface Result {
  id: string;
  name: string;
  type: string;
}

interface ForumMessageBoxProps {
  placeholder?: string;
  value?: string; // Add value prop for controlled input
  onSend?: (text: string) => void;
  disabled?: boolean;
  maxWords?: number;
  maxChars?: number;
  className?: string;
  showSendButton?: boolean; // New prop to control the visibility of the send button
}

const ForumBox: React.FC<ForumMessageBoxProps> = ({
  placeholder = "Type your message...",
  onSend,
  disabled = false,
  maxWords = 250,
  maxChars = 1000,
  className = '',
  showSendButton = true, // Default to true to show the send button
})  => {
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [artistResults, setArtistResults] = useState<Result[]>([]);
  const [albumResults, setAlbumResults] = useState<Result[]>([]);
  const [isSearching, setisSearching] = useState(false);
  const [searchStatus, setSearchStatus] = useState<string>("");
  const [newMessage, setNewMessage] = useState('');
  const [selectionEnd, setSelectionEnd] = useState(0);

  // API configuration from environment variables
  const API_USERNAME = import.meta.env.VITE_NAVIDROME_API_USERNAME;
  const API_PASSWORD = import.meta.env.VITE_NAVIDROME_API_PASSWORD;
  const SERVER_URL = import.meta.env.VITE_NAVIDROME_SERVER_URL;
  const CLIENT_ID = import.meta.env.VITE_NAVIDROME_CLIENT_ID;

  const fetchResults = async (query: string): Promise<Result[][]> => {
    setSearchStatus("Searching...")

    // TODO: API currently returns all results and ignores count parameters
    const response = await fetch(
      `${SERVER_URL}/rest/search3?query=${query}&artistCount=5&albumCount=5&u=${API_USERNAME}&p=${API_PASSWORD}&v=1.16.1&c=${CLIENT_ID}`,
      {
        headers: {
          Authorization: 'Basic ' + btoa(`${API_USERNAME}:${API_PASSWORD}`),
        },
      }
    );
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const text = await response.text();
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(text, 'application/xml');


    // Check for XML parsing errors
    const parserError = xmlDoc.querySelector('parsererror');
    if (parserError) {
      throw new Error('XML parsing error: ' + parserError.textContent);
    }

    // Check for API errors in the response
    const subsonicResponse = xmlDoc.querySelector('subsonic-response');
    if (subsonicResponse?.getAttribute('status') === 'failed') {
      const errorElement = xmlDoc.querySelector('error');
      const errorMessage = errorElement?.getAttribute('message') || 'Unknown API error';
      throw new Error(`API Error: ${errorMessage}`);
    }

    const artistResults = Array.from(xmlDoc.getElementsByTagName('artist'));
    const albumResults = Array.from(xmlDoc.getElementsByTagName('album'));
    const albumType = 'album'
    const artistType = 'artist'

    const albums: Result[] = albumResults.map((album) => ({
      id: album.getAttribute('id') || '',
      name: album.getAttribute('name') || 'Unknown Album',
      type: albumType || '',
    })).slice(0,3);

    const artists: Result[] = artistResults.map((artist) => ({
      id: artist.getAttribute('id') || '',
      name: artist.getAttribute('name') || 'Unknown Album',
      type: artistType || '',
    })).slice(0,3);

    if (albums.length === 0 && artists.length === 0) {
      setSearchStatus("No results :(")
    }
    else {
      setSearchStatus("Tag an artist or album!")
    }

    return new Promise((resolve) => {
      setTimeout(() => {
        resolve([
          albums,
          artists
        ]);
      }, 500);
    });
  };

  useEffect(() => {
    if (searchQuery.length >= 3) {
      setisSearching(true);
      fetchResults(searchQuery).then((data) => {
        setAlbumResults(data[0]);
        setArtistResults(data[1]);
      });
    } else {
      setAlbumResults([]);
      setArtistResults([]);
    }
  }, [searchQuery]);

  const handleSend = () => {
    if (newMessage.trim() && onSend && !disabled) {
      onSend(newMessage.trim());
      setNewMessage('');
    }
  };

  const checkForHyperlinkModification = (editor: Element, selection: Selection, newValue: string): string | null => {
    if (selection.rangeCount === 0) return null;

    const range = selection.getRangeAt(0);
    let currentNode: Node | null = range.startContainer;

    // Walk up the DOM to find if we're inside a link
    while (currentNode && currentNode !== editor) {
      if (currentNode.nodeType === Node.ELEMENT_NODE && (currentNode as Element).tagName === 'A') {
        const linkElement = currentNode as HTMLAnchorElement;

        // Get the position of this link in the plain text
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = newValue;
        const plainText = tempDiv.textContent || tempDiv.innerText || '';

        // Find the link text in the plain text
        const linkText = linkElement.textContent || '';
        const linkStart = plainText.indexOf(linkText);

        if (linkStart !== -1) {
          // Remove the entire link and position cursor where it started
          const beforeLink = newValue.substring(0, newValue.indexOf(linkElement.outerHTML));
          const afterLink = newValue.substring(newValue.indexOf(linkElement.outerHTML) + linkElement.outerHTML.length);
          const updatedValue = beforeLink + afterLink;

          // Set cursor position to where the link started
          setTimeout(() => {
            const newSelection = window.getSelection();
            if (newSelection && editor) {
              const newRange = document.createRange();
              const beforeLinkDiv = document.createElement('div');
              beforeLinkDiv.innerHTML = beforeLink;
              const textLength = (beforeLinkDiv.textContent || '').length;

              // Find the text node and position at the correct character
              const walker = document.createTreeWalker(
                editor,
                NodeFilter.SHOW_TEXT,
                null
              );

              let currentLength = 0;
              let targetNode = null;
              let targetOffset = 0;

              while (walker.nextNode()) {
                const node = walker.currentNode as Text;
                const nodeLength = node.textContent?.length || 0;

                if (currentLength + nodeLength >= textLength) {
                  targetNode = node;
                  targetOffset = textLength - currentLength;
                  break;
                }
                currentLength += nodeLength;
              }

              if (targetNode) {
                newRange.setStart(targetNode, targetOffset);
                newRange.collapse(true);
                newSelection.removeAllRanges();
                newSelection.addRange(newRange);
              }
            }
          }, 0);

          return updatedValue;
        }
        break;
      }
      currentNode = currentNode.parentNode;
    }

    return null;
  };

  const handleInputChange = (e: ContentEditableEvent, selection?: Selection | null): void => {
    const value = e.target.value;

    // Check if content is truly empty
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = value;
    const plainTextCheck = tempDiv.textContent || tempDiv.innerText || '';

    // If content is empty, reset to empty string
    if (!plainTextCheck.trim()) {
      setNewMessage('');
      setSearchQuery('');
      setisSearching(false);
      return;
    }

    const wordCount = value.trim().split(/\s+/).length;

    if (wordCount <= 250) {
      // Check if we're trying to modify a hyperlink
      const currentSelection = selection || window.getSelection();
      const editor = document.querySelector('[contenteditable="true"]');

      if (currentSelection && editor) {
        const protectedValue = checkForHyperlinkModification(editor, currentSelection, value);
        if (protectedValue !== null) {
          setNewMessage(protectedValue);
          return;
        }
      }

      setNewMessage(value);

      // Get the actual cursor position in terms of visible text
      let caretPositionInText = 0;

      if (currentSelection && currentSelection.rangeCount > 0) {
        const range = currentSelection.getRangeAt(0);

        // Create a range from start of contenteditable to cursor position
        const preCaretRange = range.cloneRange();

        if (editor) {
          preCaretRange.selectNodeContents(editor);
          preCaretRange.setEnd(range.startContainer, range.startOffset);

          // Get only the text content (no HTML) up to cursor - this handles HTML entities properly
          const textBeforeCursor = preCaretRange.toString();
          caretPositionInText = textBeforeCursor.length;
        }
      }

      // Convert HTML to plain text
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = value;
      const plainText = tempDiv.textContent || tempDiv.innerText || '';

      // Find the last @ symbol before the caret position
      const atIndex = plainText.lastIndexOf("@", caretPositionInText - 1);
      console.log("HTML value:", value)
      console.log("plainText:", plainText)
      console.log("caretPositionInText:", caretPositionInText)
      console.log("atIndex:", atIndex)

      if (atIndex !== -1 && atIndex < caretPositionInText) {
        // Extract query from @ to caret position
        const query = plainText.slice(atIndex + 1, caretPositionInText);
        console.log("query:", query)
        setSearchQuery(query);
        setisSearching(true);
      } else {
        setSearchQuery("");
        setisSearching(false);
      }
    }
  };

  const selectResult = (result: Result, newMessage: string): void => {
    const link = `${SERVER_URL}/app/#/${result.type}/${result.id}/show`;

    // Use the current search query directly
    if (searchQuery) {
      const searchPattern = "@" + searchQuery;
      const replacement = `<a href="${link}">${result.name}</a> `;

      // Simple string replacement in the HTML content
      const updatedMessage = newMessage.replace(searchPattern, replacement);

      setNewMessage(updatedMessage);
      setisSearching(false);
      setSearchQuery("");

      // Focus the editor and position caret after the hyperlink
      setTimeout(() => {
        const editor = document.querySelector('.textbox-container [contenteditable="true"]') as HTMLElement;
        if (editor) {
          editor.focus();

          // Find the link element that was just inserted
          const linkElement = editor.querySelector('a[href="' + link + '"]');
          if (linkElement) {
            const selection = window.getSelection();
            if (selection) {
              const range = document.createRange();

              // Position cursor after the link and its trailing space
              const nextSibling = linkElement.nextSibling;
              if (nextSibling && nextSibling.nodeType === Node.TEXT_NODE) {
                // If there's a text node after the link, position at the start of it
                range.setStart(nextSibling, 1); // Position after the space
                range.collapse(true);
              } else {
                // If no text node after link, create one and position there
                const textNode = document.createTextNode(' ');
                linkElement.parentNode?.insertBefore(textNode, linkElement.nextSibling);
                range.setStart(textNode, 1);
                range.collapse(true);
              }

              selection.removeAllRanges();
              selection.addRange(range);
            }
          }
        }
      }, 0);
    }
  }

  // Count words in text - matching MessageTextBox functionality
  const countWords = (text: string): number => {
    if (!text.trim()) return 0;
    return text.trim().split(/\s+/).length;
  };

  // Get plain text from HTML content for word counting
  const getPlainText = (html: string): string => {
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = html;
    return tempDiv.textContent || tempDiv.innerText || '';
  };

  const plainText = getPlainText(newMessage);
  const wordCount = countWords(plainText);
  const charCount = plainText.length;
  maxWords = 250
  maxChars = 1000;

  // Check if content is truly empty (no meaningful text content)
  const hasContent = plainText.trim().length > 0;
  const canSend = hasContent && wordCount <= maxWords && charCount <= maxChars && !disabled;

  return (
    <div className={`textbox-container ${disabled ? 'disabled' : ''} ${className}`}>
      <div className="input-area">
        <div style={{ flex: 1 }}>
          <Editor
            value = {hasContent ? newMessage : ''}
            name = "ChangeEvent"
            placeholder = {placeholder}
            onChange={handleInputChange}
            disabled={disabled}
          >
          <Toolbar style={{display: "none"}}/>
          </Editor>
        </div>
        {showSendButton && (
        <div className="send-button-container">
          <Button
            type="basic"
            label="Send"
            onClick={handleSend}
            size="2.5em"
            disabled={!canSend}
          />
        </div>
      )}
      </div>

      {isSearching && <p>{searchStatus}</p>}
      {artistResults.length > 0 && (
        <figure>
          <figcaption>Artists</figcaption>
          <ul style={{ marginTop: "10px", listStyleType: "none", padding:0 }}>
            {artistResults.map((result, index) => (
              <li
                key = {index}
                style={{
                  padding: "5px 10px",
                  background: "#f0f0f0",
                  marginBottom: "1px",
                  borderRadius: "1px",
                }}
                >
                  <button onClick = {() => selectResult(result, newMessage)}>{result.name}</button>
              </li>
            ))}
          </ul>
        </figure>
      )}
      {albumResults.length > 0 && (
        <figure>
          <figcaption>Albums</figcaption>
          <ul style={{ marginTop: "10px", listStyleType: "none", padding:0 }}>
            {albumResults.map((result, index) => (
              <li
                key = {index}
                style={{
                  padding: "5px 10px",
                  background: "#f0f0f0",
                  marginBottom: "1px",
                  borderRadius: "1px",
                }}
                >
                  <button onClick = {() => selectResult(result, newMessage)}>{result.name}</button>
              </li>
            ))}
          </ul>
        </figure>
      )}

      <div className="word-counter">
        {wordCount}/{maxWords} words | {charCount}/{maxChars} characters
      </div>
    </div>
  )

}

export default ForumBox;
