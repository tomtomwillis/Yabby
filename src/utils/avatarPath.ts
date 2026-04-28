export function normalizeAvatarPath(avatarPath: string | null | undefined): string {
  if (!avatarPath) return '';

  const cleanPath = avatarPath.startsWith('/') ? avatarPath.substring(1) : avatarPath;

  if (cleanPath.startsWith('Stickers/')) {
    return `/${cleanPath}`;
  }
  if (cleanPath.startsWith('assets/')) {
    return `/Stickers/${cleanPath.replace('assets/', '')}`;
  }
  if (cleanPath.includes('/')) {
    return `/Stickers/${cleanPath.split('/').pop() || ''}`;
  }
  return `/Stickers/${cleanPath}`;
}
