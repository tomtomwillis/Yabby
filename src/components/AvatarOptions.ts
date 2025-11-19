// avatarOptions.ts
// Maps each avatar shape to its available colors

export interface AvatarOption {
  shape: string;
  availableColors: string[];
}

export const avatarOptions: Record<string, string[]> = {
  star: ['blue', 'green', 'pink', 'red'],
  circle: ['blue', 'green', 'pink', 'red'],
  pointy: ['blue', 'green', 'pink', 'red'],
  dog: ['blue', 'green', 'pink', 'red'],
  ghost: ['blue', 'green', 'pink', 'red'],
  gremlin: ['blue', 'green', 'pink', 'red'],
  astro: ['blue', 'green', 'pink', 'red'],
  makina: ['blue', 'green', 'pink', 'red'],
  frog: ['blue', 'green', 'pink', 'red'],
  miffy: ['blue', 'green', 'pink', 'red'],
  caroline: ['blue', 'green', 'pink', 'red'],
  charli: ['blue', 'green', 'pink', 'red'],
  crest: ['blue', 'green', 'pink', 'red'],
  devilboy: ['blue', 'green', 'pink', 'red'],
  duck: ['blue', 'green', 'pink', 'red'],
  italia: ['blue', 'green', 'pink', 'red'],
  loukeman: ['blue', 'green', 'pink', 'red'],
  overmonodog: ['blue', 'green', 'pink', 'red'],
  starfish: ['blue', 'green', 'pink', 'red'],
  tooth: ['blue', 'green', 'pink', 'red'],
  tp: ['blue', 'green', 'pink', 'red'],
  trebleclef: ['blue', 'green', 'pink', 'red'],
  unsmiley: ['blue', 'green', 'pink', 'red'],
  kingsley1: ['yellow'],
  kingsley2: ['yellow'],
};

// Helper function to get all available shapes
export const getAllShapes = (): string[] => {
  return Object.keys(avatarOptions);
};

// Helper function to get available colors for a specific shape
export const getAvailableColors = (shape: string): string[] => {
  return avatarOptions[shape] || [];
};

// Helper function to check if a shape-color combination is valid
export const isValidCombination = (shape: string, color: string): boolean => {
  return avatarOptions[shape]?.includes(color) || false;
};

// Helper function to get a valid default color for a shape
export const getDefaultColorForShape = (shape: string): string => {
  const colors = avatarOptions[shape];
  return colors && colors.length > 0 ? colors[0] : 'blue';
};