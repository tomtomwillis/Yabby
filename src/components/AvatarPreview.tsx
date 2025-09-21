import React, { useEffect } from 'react';
import './AvatarPreview.css'; // Import the CSS file

const colors = ['blue', 'green', 'pink', 'red']; // Available colors
const shapes = [
  'star', 'circle', 'pointy', 'dog', 'ghost', 'gremlin', 'astro', 'makina', 
  'frog', 'miffy', 'caroline', 'charli', 'crest', 'devilboy', 'duck', 
  'italia', 'loukeman', 'overmonodog', 'starfish', 'tooth', 'tp', 
  'trebleclef', 'unsmiley'
]; // Available shapes

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
  // Update avatar dynamically based on selected color and shape
  useEffect(() => {
    const newAvatar = `/Stickers/avatar_${selectedShape}_${selectedColor}.webp`;
    onAvatarChange(newAvatar); // Notify parent component of the new avatar
  }, [selectedColor, selectedShape, onAvatarChange]);

  return (
    <div className="avatar-preview-container">
      <label>Choose Avatar:</label>
      <div className="dropdown-container">
        <select
          id="color"
          value={selectedColor}
          onChange={(e) => onColorChange(e.target.value)}
        >
          {colors.map((color) => (
            <option key={color} value={color}>
              {color.charAt(0).toUpperCase() + color.slice(1)}
            </option>
          ))}
        </select>
        <select
          id="shape"
          value={selectedShape}
          onChange={(e) => onShapeChange(e.target.value)}
        >
          {shapes.map((shape) => (
            <option key={shape} value={shape}>
              {shape.charAt(0).toUpperCase() + shape.slice(1)}
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