// Configuration for Upload Folder Monitor

module.exports = {
  // Folder paths
  folders: {
    // Folder to monitor for new uploads
    uploadFolder: process.env.UPLOAD_FOLDER || '/mnt/HAMNAS/YabbyUserUploads',

    // Folder where approved files will be moved to
    destinationFolder: process.env.DESTINATION_FOLDER || '/media/UserUploads',
  },

  // Monitor settings
  monitor: {
    // Time to wait (in milliseconds) after last file upload before processing
    // Timer resets each time a new file is detected
    debounceTimeout: 30000, // 30 seconds

    // Where to store the rejected files log
    rejectedLogPath: process.env.REJECTED_LOG || './rejected_files.log',

    // Enable verbose logging
    verbose: true,

    // Maximum file size to process (in megabytes)
    // Set to null for no limit
    maxFileSize: 1500, // 1500 MB (1.5GB)

    // Allowed file extensions (audio and image files)
    // Files with extensions not in this list will be rejected and deleted
    allowedExtensions: [
      // Audio files
      '.mp3', '.flac', '.wav', '.m4a', '.aac', '.ogg', '.wma', '.opus',
      // Image files
      '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.tiff', '.webp', '.svg'
    ],

    // File validation settings
    validation: {
      // Enable strict validation (if false, only basic checks are performed)
      strictMode: true,

      // Minimum file size for images (in bytes)
      minImageSize: 100,

      // Minimum duration for audio files (in seconds)
      minAudioDuration: 1
    }
  },

  // Notification settings (for future expansion)
  notifications: {
    enabled: false,
    // Could add email, webhook, etc. later
  }
};