import React, { useEffect } from 'react';
import './AvatarPreview.css'; // Import the CSS file
import { getAllShapes, getAvailableColors, isValidCombination, getDefaultColorForShape } from './avatarOptions';

interface AvatarPreviewProps {
  selectedColor: string;
  selectedShape: string;
  avatar: string; // Current avatar URL
  onColorChange: (color: string) => void;
  onShapeChange: (shape: string) => void;
  onAvatarChange: (avatar: string) => void; // Callback to update avatar
}

const AvatarPreview: React.FC<AvatarPreviewProps> = ({
  selectedColor,
  selectedShape,
  avatar,
  onColorChange,
  onShapeChange,
  onAvatarChange,
}) => {
  const shapes = getAllShapes(); // Get all available shapes
  const availableColors = getAvailableColors(selectedShape); // Get colors for current shape

  // Validate and auto-correct color when shape changes
  useEffect(() => {
    if (!isValidCombination(selectedShape, selectedColor)) {
      // If current color isn't valid for this shape, switch to default color
      const defaultColor = getDefaultColorForShape(selectedShape);
      onColorChange(defaultColor);
    }
  }, [selectedShape, selectedColor, onColorChange]);

  // Update avatar dynamically based on selected color and shape
  useEffect(() => {
    // Only update if the combination is valid
    if (isValidCombination(selectedShape, selectedColor)) {
      const newAvatar = `/Stickers/avatar_${selectedShape}_${selectedColor}.webp`;
      onAvatarChange(newAvatar); // Notify parent component of the new avatar
    }
  }, [selectedColor, selectedShape, onAvatarChange]);

  const handleShapeChange = (newShape: string) => {
    onShapeChange(newShape);
    
    // Check if current color is valid for new shape
    if (!isValidCombination(newShape, selectedColor)) {
      // Auto-select the first available color for this shape
      const defaultColor = getDefaultColorForShape(newShape);
      onColorChange(defaultColor);
    }
  };

  return (
    <div className="avatar-preview-container">
      <label>Choose Avatar:</label>
      <div className="dropdown-container">
        <select
          id="shape"
          value={selectedShape}
          onChange={(e) => handleShapeChange(e.target.value)}
        >
          {shapes.map((shape) => (
            <option key={shape} value={shape}>
              {shape.charAt(0).toUpperCase() + shape.slice(1)}
            </option>
          ))}
        </select>
        <select
          id="color"
          value={selectedColor}
          onChange={(e) => onColorChange(e.target.value)}
        >
          {availableColors.map((color) => (
            <option key={color} value={color}>
              {color.charAt(0).toUpperCase() + color.slice(1)}
            </option>
          ))}
        </select>
      </div>
      <div className="avatar-preview-window">
        {avatar && <img src={avatar} alt="Avatar Preview" />}
      </div>
    </div>
  );
};

export default AvatarPreview;