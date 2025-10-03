import React, { useState, useRef, useEffect } from 'react';
import Button from './Button';
import './MessageTextBox.css';

interface TextBoxProps {
  placeholder?: string;
  value?: string; // Add value prop for controlled input
  onSend?: (text: string) => void;
  onChange?: (text: string) => void; // Add onChange prop for controlled input
  disabled?: boolean;
  maxWords?: number;
  className?: string;
  showSendButton?: boolean; // New prop to control the visibility of the send button
  showCounter?: boolean; // New prop to control the visibility of the word/character counter
  children?: React.ReactElement<{ onClick?: () => void; disabled?: boolean }>; // Ensure children support onClick and disabled props
}

const TextBox: React.FC<TextBoxProps> = ({
  placeholder = "Type here",
  value,
  onSend,
  onChange,
  disabled = false,
  maxWords = 250,
  className = '',
  showSendButton = true, // Default to true to show the send button
  showCounter = true, // Default to true to show the word/character counter
  children, // Custom children passed from the parent
}) => {
  const [text, setText] = useState(value || ''); // Initialize with value if provided
  const [wordCount, setWordCount] = useState(0);
  const [charCount, setCharCount] = useState(0); // Track character count
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const maxChars = 1000; // Character limit

  // Count words in text
  const countWords = (text: string): number => {
    if (!text.trim()) return 0;
    return text.trim().split(/\s+/).length;
  };

  // Auto-resize textarea
  const autoResize = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
    }
  };

  useEffect(() => {
    autoResize();
  }, [text]);

  // Initialize counts based on initial value
  useEffect(() => {
    if (value !== undefined) {
      setText(value);
      const initialWordCount = countWords(value);
      const initialCharCount = value.length;
      setWordCount(initialWordCount);
      setCharCount(initialCharCount);
    }
  }, []); // Run only on mount

  // Update internal state when the value prop changes
  useEffect(() => {
    if (value !== undefined && value !== text) {
      setText(value);
      setWordCount(countWords(value));
      setCharCount(value.length);
    }
  }, [value, text]);

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newText = e.target.value;

    // Prevent input if it exceeds character or word limits
    if (newText.length <= maxChars) {
      const newWordCount = countWords(newText);
      if (newWordCount <= maxWords) {
        setText(newText);
        setWordCount(newWordCount);
        setCharCount(newText.length);

        // Call onChange if provided
        if (onChange) {
          onChange(newText);
        }
      }
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    e.preventDefault();

    const pastedText = e.clipboardData.getData('text');
    const currentText = text;

    // Get cursor position
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;

    // Create the new text that would result from the paste
    const newText = currentText.substring(0, start) + pastedText + currentText.substring(end);

    // Prevent paste if it exceeds character or word limits
    if (newText.length <= maxChars) {
      const newWordCount = countWords(newText);
      if (newWordCount <= maxWords) {
        setText(newText);
        setWordCount(newWordCount);
        setCharCount(newText.length);

        // Call onChange if provided
        if (onChange) {
          onChange(newText);
        }

        // Set cursor position after pasted text
        setTimeout(() => {
          if (textarea) {
            textarea.selectionStart = textarea.selectionEnd = start + pastedText.length;
            textarea.focus();
          }
        }, 0);
      }
    }
  };

  const handleSend = () => {
    if (text.trim() && onSend && !disabled) {
      onSend(text.trim());
      setText('');
      setWordCount(0);
      setCharCount(0);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSend();
    }
  };

  // Calculate send button size based on text area height
  const getSendButtonSize = (): string => {
    if (!textareaRef.current) return '2.5em';
    
    const textareaHeight = textareaRef.current.scrollHeight;
    
    if (textareaHeight <= 40) return '2.5em'; // Single line
    if (textareaHeight <= 80) return '3em';   // 2-3 lines
    if (textareaHeight <= 120) return '3.5em'; // 4-5 lines
    return '4em'; // More than 5 lines
  };

  const getCounterClass = (): string => {
    if (wordCount > maxWords * 0.9 || charCount > maxChars * 0.9) return 'error';
    if (wordCount > maxWords * 0.8 || charCount > maxChars * 0.8) return 'warning';
    return '';
  };

  const canSend = text.trim().length > 0 && wordCount <= maxWords && charCount <= maxChars && !disabled;

  return (
    <div className={`textbox-container ${disabled ? 'disabled' : ''} ${className}`}>
      <div className="input-area">
        <textarea
          ref={textareaRef}
          className="text-input"
          value={text}
          onChange={handleTextChange}
          onPaste={handlePaste}
          onKeyDown={handleKeyPress}
          placeholder={placeholder}
          disabled={disabled}
          rows={1}
        />
        {showSendButton && (
          <div className="send-button-container">
            {children ? (
              React.cloneElement(children, { onClick: handleSend, disabled: !canSend })
            ) : (
              <Button
                type="basic"
                label="Send"
                onClick={handleSend}
                size={getSendButtonSize()}
                disabled={!canSend}
              />
            )}
          </div>
        )}
      </div>
      {showCounter && (
        <div className={`word-counter ${getCounterClass()}`}>
          {wordCount}/{maxWords} words | {charCount}/{maxChars} characters
        </div>
      )}
    </div>
  );
};

export default TextBox;