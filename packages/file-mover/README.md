# Upload Folder Monitor

Advanced file monitoring system that watches a local upload folder, validates audio and image files, and automatically moves approved files to a destination folder. Features intelligent debouncing to handle batch uploads gracefully.

## 🎯 What It Does

- **Smart File Watching**: Monitors a local upload folder for new files in real-time
- **Intelligent Debouncing**: Waits 60 seconds after the last file upload before processing (timer resets with each new file)
- **Comprehensive Validation**: Uses FFmpeg for audio files and header validation for images
- **Automatic File Management**: Moves valid files to destination, deletes invalid files
- **Directory Preservation**: Maintains folder structure when moving files
- **Detailed Logging**: Comprehensive rejection logs with specific failure reasons

## 🚀 Quick Setup Instructions

### Prerequisites

**Required Software:**
- Node.js (v16 or higher) - [Download here](https://nodejs.org/)
- FFmpeg (for audio validation) - See installation instructions below

**Installing FFmpeg:**

**On Mac:**
```bash
# Using Homebrew (recommended)
brew install ffmpeg

# Or using MacPorts
sudo port install ffmpeg
```

**On Linux (Ubuntu/Debian):**
```bash
sudo apt update
sudo apt install ffmpeg
```

**On Windows:**
1. Download FFmpeg from [https://ffmpeg.org/download.html](https://ffmpeg.org/download.html)
2. Extract to a folder (e.g., `C:\ffmpeg`)
3. Add `C:\ffmpeg\bin` to your system PATH environment variable

### Installation Steps

1. **Clone or download the project files**
2. **Install Node.js dependencies:**
   ```bash
   npm install
   ```
   This will install:
   - `chokidar` - For robust file system watching
   - `fluent-ffmpeg` - For audio file validation
   - `file-type` - For image header validation

3. **Configure your settings** (edit `config.js`):
   - Set upload folder path (where users upload files)
   - Set destination folder path (where approved files are moved)
   - Configure file size limits and allowed extensions
   - Adjust debounce timeout if needed

### Running the Monitor

**For Mac/Linux:**
```bash
# Make the script executable
chmod +x run_monitor.sh

# Run the monitor
./run_monitor.sh
```

**For Windows:**
```cmd
# Simply run the batch file
run_monitor.bat
```

**Direct Node.js execution:**
```bash
node monitor.js
```

## 📋 How It Works

### Monitoring Flow

1. **Initial Scan**: When started, scans upload folder for existing files
2. **File Detection**: Watches for new files added to upload folder (including subdirectories)
3. **Debounce Timer**: When a file is detected, starts 60-second countdown
4. **Timer Reset**: Each new file resets the countdown (prevents processing incomplete uploads)
5. **Processing**: After 60 seconds of no new files:
   - Validates all pending files
   - Moves valid files to destination (preserving folder structure)
   - Deletes invalid files and logs rejections
6. **Continuous Monitoring**: Returns to watching for new files

### File Validation Process

**Audio Files** (`.mp3`, `.flac`, `.wav`, `.m4a`, `.aac`, `.ogg`, `.wma`, `.opus`):
- FFmpeg validation of file structure
- Checks for valid audio streams
- Verifies duration is greater than 0
- Validates codec information

**Image Files** (`.jpg`, `.jpeg`, `.png`, `.gif`, `.bmp`, `.tiff`, `.webp`, `.svg`):
- Header inspection and MIME type validation
- File size checks (minimum 100 bytes)
- Image type verification

**Other Files**:
- Automatically rejected and deleted
- Logged with specific file type information

### What Happens to Files

✅ **Valid Files**: Moved to destination folder with structure preserved
❌ **Invalid Files**: Deleted from upload folder and logged to `rejected_files.log`
📁 **Empty Folders**: Automatically cleaned up after processing

## 🔧 Configuration Options

Edit `config.js` to customize behavior:

### Folder Paths
```javascript
folders: {
  // Folder to monitor for new uploads
  uploadFolder: '/media/Uploads',

  // Folder where approved files will be moved
  destinationFolder: '/media/IncomingMusic',
}
```

### Monitor Settings
```javascript
monitor: {
  // Time to wait after last file upload before processing (milliseconds)
  debounceTimeout: 60000, // 60 seconds (1 minute)

  // Maximum file size in MEGABYTES (null = no limit)
  maxFileSize: 1500, // 1500 MB (1.5 GB)

  // Allowed file extensions (files not in this list are rejected)
  allowedExtensions: [
    // Audio files
    '.mp3', '.flac', '.wav', '.m4a', '.aac', '.ogg', '.wma', '.opus',
    // Image files
    '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.tiff', '.webp', '.svg'
  ],

  // Rejection log location
  rejectedLogPath: './rejected_files.log',

  // Enable verbose logging
  verbose: true,
}
```

### Validation Settings
```javascript
validation: {
  strictMode: true,           // Enable comprehensive validation
  minImageSize: 100,          // Minimum bytes for valid images
  minAudioDuration: 1         // Minimum seconds for valid audio
}
```

## 📁 File Structure
```
upload-folder-monitor/
├── monitor.js              # Main monitoring program
├── package.json           # Node.js dependencies
├── config.js             # Configuration settings
├── run_monitor.sh        # Mac/Linux runner script
├── run_monitor.bat       # Windows runner script
├── rejected_files.log    # Rejection log (created automatically)
└── node_modules/         # Installed dependencies (after npm install)
```

## 📊 Monitoring Output

The monitor provides detailed real-time feedback:

```
🚀 Upload Folder Monitor initialized
📁 Upload folder: /media/Uploads
📂 Destination folder: /media/IncomingMusic
📋 Rejected log: ./rejected_files.log
⏱️  Debounce timeout: 60s

🔍 Scanning for existing files in upload folder...
📋 Found 5 existing files
⏱️  Debounce timer reset (60s)
🎯 Starting folder monitoring...
Press Ctrl+C to stop

📥 New file detected: album/song1.mp3
⏱️  Debounce timer reset (60s)

📥 New file detected: album/song2.mp3
⏱️  Debounce timer reset (60s)

⏰ Debounce timeout reached. Processing 7 pending files...

🔄 Processing batch of 7 files...
✅ Validation passed: album/song1.mp3 (audio)
✅ Moved: album/song1.mp3 -> /media/IncomingMusic/album/song1.mp3
❌ Validation failed: album/corrupt.mp3 - FFmpeg validation failed
🗑️  Deleted invalid file: album/corrupt.mp3
📝 Logged rejection: corrupt.mp3 - FFmpeg validation failed

📊 Batch Summary:
   Processed: 7 files
   Moved to destination: 6 files
   Rejected/Deleted: 1 files
```

## 📝 Rejection Logging

Invalid files are logged in JSON format for easy analysis:

```json
{"timestamp":"2025-01-15T10:30:45.123Z","filename":"corrupt.mp3","filePath":"album/corrupt.mp3","fileSize":1024,"reason":"FFmpeg validation failed: Invalid data found","action":"REJECTED"}
{"timestamp":"2025-01-15T10:30:46.456Z","filename":"document.pdf","filePath":"document.pdf","fileSize":5000,"reason":"File type not supported: '.pdf' is not an audio or image file","action":"REJECTED"}
{"timestamp":"2025-01-15T10:30:47.789Z","filename":"fake.jpg","filePath":"images/fake.jpg","fileSize":50,"reason":"File too small to be a valid image","action":"REJECTED"}
```

## 🔍 Troubleshooting

### Common Issues

**"FFmpeg not found" error:**
- Ensure FFmpeg is installed and in your system PATH
- Test with: `ffmpeg -version`
- On Mac: `brew install ffmpeg`
- On Linux: `sudo apt install ffmpeg`

**"Permission denied" errors:**
- Check file permissions on upload and destination directories
- Ensure write access to rejection log location
- On Mac/Linux: `chmod 755 /path/to/folders`

**Files processed too quickly:**
- Increase `debounceTimeout` in config (e.g., 120000 for 2 minutes)
- Default is 60 seconds (60000 milliseconds)

**Files not being detected:**
- Verify upload folder path is correct
- Check file permissions on upload folder
- Ensure files are not dotfiles (starting with .)

**Node.js dependency issues:**
```bash
# Clear cache and reinstall
rm -rf node_modules package-lock.json
npm install
```

**Large file processing:**
- Adjust `maxFileSize` in config (value is in MB)
- Monitor memory usage during processing
- Consider increasing Node.js memory limit: `node --max-old-space-size=4096 monitor.js`

### Debug Mode
For additional debugging information, the config has verbose mode enabled by default:
```javascript
verbose: true
```

## 🛡️ Security Notes

- Ensure upload and destination folders have appropriate permissions
- The rejection log may contain sensitive filenames - secure accordingly
- Consider running the monitor as a dedicated user with limited permissions
- Regularly review rejected files log for unusual patterns
- Invalid files are permanently deleted - ensure your upload process has backups if needed

## 💡 Use Cases

### Media Server Upload Processing
Perfect for processing user uploads to media servers like Navidrome, Plex, or Jellyfin. Users upload music to the upload folder, and the monitor validates and moves approved files to your media library.

### Batch Album Uploads
The debouncing feature is ideal for album uploads. When users upload an entire album (10-20 files), the monitor waits until all files are uploaded before processing, preventing partial album processing.

### File Quality Control
Acts as an automated quality control system, ensuring only valid audio and image files make it into your destination folder.

## 🔄 Advanced Usage

### Running as a Service (Linux/Mac)

Create a systemd service file for automatic startup:

```bash
sudo nano /etc/systemd/system/upload-monitor.service
```

Add the following content:
```ini
[Unit]
Description=Upload Folder Monitor
After=network.target

[Service]
Type=simple
User=your-username
WorkingDirectory=/path/to/upload-folder-monitor
ExecStart=/usr/bin/node monitor.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Enable and start the service:
```bash
sudo systemctl enable upload-monitor
sudo systemctl start upload-monitor
sudo systemctl status upload-monitor
```

### Custom Validation Rules

Extend the validation logic in `monitor.js` by modifying the `validateFile` method to add custom rules for specific file types or business requirements.

### Adjusting Debounce Behavior

The debounce timeout can be adjusted based on your use case:
- Fast single-file uploads: 30000 (30 seconds)
- Album uploads: 60000 (60 seconds, default)
- Large batch uploads: 120000 (2 minutes)
- Very slow uploads: 300000 (5 minutes)

### Integration with Other Systems

The JSON rejection log format makes it easy to integrate with:
- Log analysis tools (Logstash, Splunk)
- Monitoring systems (Prometheus, Grafana)
- Custom alerting mechanisms
- Database logging systems

---

**Need Help?** Check the rejection logs first, then review the troubleshooting section. For persistent issues, ensure all prerequisites are properly installed and configured.
