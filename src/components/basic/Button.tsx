import React from 'react';
import { FaTimes, FaArrowLeft, FaArrowRight } from 'react-icons/fa'; // Import icons
import './button.css';

interface ButtonProps {
  label?: string; // Optional label for the button (not needed for 'close', 'arrow-left', or 'arrow-right' types)
  onClick?: () => void; // The function to call when the button is clicked
  type?: 'basic' | 'close' | 'arrow-left' | 'arrow-right' | 'submit'; // Specifies the button type
  className?: string; // Allows additional custom styles in the CSS
  disabled?: boolean;
  size?: string; // Size for the button (e.g., "3em", "50px")
  htmlType?: 'button' | 'submit' | 'reset'; // HTML button type
}

const Button: React.FC<ButtonProps> = ({
  label,
  onClick,
  type = 'basic',
  className = '',
  disabled = false,
  size = '3em',
  htmlType = 'button', // Default to "button"
}) => {
  const buttonClass =
    type === 'close'
      ? 'close-button'
      : type === 'arrow-left' || type === 'arrow-right'
      ? 'arrow-button'
      : 'basic-button';

  const style = type !== 'basic' ? { width: size, height: size } : {};

  return (
    <button
      type={htmlType} // Use the htmlType prop
      className={`${buttonClass} ${className}`}
      onClick={onClick}
      disabled={disabled}
      style={style} // Apply dynamic styles
    >
      {type === 'close' && <FaTimes />}
      {type === 'arrow-left' && <FaArrowLeft />}
      {type === 'arrow-right' && <FaArrowRight />}
      {type === 'basic' && label}
    </button>
  );
};

export default Button;