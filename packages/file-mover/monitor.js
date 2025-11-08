const fs = require('fs').promises;
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const { fileTypeFromFile } = require('file-type');
const chokidar = require('chokidar');
const config = require('./config');

class UploadFolderMonitor {
  constructor(config) {
    this.uploadFolder = config.folders.uploadFolder;
    this.destinationFolder = config.folders.destinationFolder;
    this.debounceTimeout = config.monitor.debounceTimeout || 60000;
    this.rejectedLogPath = config.monitor.rejectedLogPath || './rejected_files.log';
    this.allowedExtensions = config.monitor.allowedExtensions || [];
    this.maxFileSize = config.monitor.maxFileSize ? config.monitor.maxFileSize * 1024 * 1024 : null; // Convert MB to bytes

    // Derive file type categories from allowed extensions in config
    const audioExtensions = ['.mp3', '.flac', '.wav', '.m4a', '.aac', '.ogg', '.wma', '.opus'];
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.tiff', '.webp', '.svg'];

    this.audioExtensions = this.allowedExtensions.filter(ext => audioExtensions.includes(ext.toLowerCase()));
    this.imageExtensions = this.allowedExtensions.filter(ext => imageExtensions.includes(ext.toLowerCase()));

    // Tracking pending files and debounce timer
    this.pendingFiles = new Set();
    this.debounceTimer = null;
    this.watcher = null;
    this.isRunning = false;

    console.log(`🚀 Upload Folder Monitor initialized`);
    console.log(`📁 Upload folder: ${this.uploadFolder}`);
    console.log(`📂 Destination folder: ${this.destinationFolder}`);
    console.log(`📋 Rejected log: ${this.rejectedLogPath}`);
    console.log(`⏱️  Debounce timeout: ${this.debounceTimeout / 1000}s`);
  }

  async ensureDirectories() {
    try {
      await fs.access(this.uploadFolder);
    } catch (error) {
      await fs.mkdir(this.uploadFolder, { recursive: true });
      console.log(`📁 Created upload directory: ${this.uploadFolder}`);
    }

    try {
      await fs.access(this.destinationFolder);
    } catch (error) {
      await fs.mkdir(this.destinationFolder, { recursive: true });
      console.log(`📂 Created destination directory: ${this.destinationFolder}`);
    }
  }

  async logRejectedFile(filename, reason, fileSize = 0, filePath = '') {
    const logEntry = {
      timestamp: new Date().toISOString(),
      filename: filename,
      filePath: filePath,
      fileSize: fileSize,
      reason: reason,
      action: 'REJECTED'
    };

    const logLine = JSON.stringify(logEntry) + '\n';

    try {
      await fs.appendFile(this.rejectedLogPath, logLine);
      console.log(`📝 Logged rejection: ${filename} - ${reason}`);
    } catch (error) {
      console.error(`❌ Failed to write to rejection log:`, error.message);
    }
  }

  isFileTypeAllowed(filename) {
    if (this.allowedExtensions.length === 0) {
      return true; // Allow all files if no filter is set
    }

    const ext = path.extname(filename).toLowerCase();
    return this.allowedExtensions.includes(ext);
  }

  getFileCategory(filename) {
    const ext = path.extname(filename).toLowerCase();
    if (this.audioExtensions.includes(ext)) {
      return 'audio';
    } else if (this.imageExtensions.includes(ext)) {
      return 'image';
    }
    return 'other';
  }

  async validateAudioFile(filePath) {
    return new Promise((resolve) => {
      ffmpeg.ffprobe(filePath, (err, metadata) => {
        if (err) {
          resolve({
            valid: false,
            reason: `FFmpeg validation failed: ${err.message}`
          });
          return;
        }

        // Check if it has audio streams
        const audioStreams = metadata.streams.filter(stream => stream.codec_type === 'audio');
        if (audioStreams.length === 0) {
          resolve({
            valid: false,
            reason: 'No audio streams found in file'
          });
          return;
        }

        // Additional checks can be added here
        const duration = metadata.format.duration;
        if (!duration || duration <= 0) {
          resolve({
            valid: false,
            reason: 'Invalid or zero duration'
          });
          return;
        }

        resolve({
          valid: true,
          metadata: {
            duration: duration,
            bitrate: metadata.format.bit_rate,
            codec: audioStreams[0].codec_name,
            streams: audioStreams.length
          }
        });
      });
    });
  }

  async validateImageFile(filePath) {
    try {
      const fileType = await fileTypeFromFile(filePath);

      if (!fileType) {
        return {
          valid: false,
          reason: 'Could not determine file type from header'
        };
      }

      const validImageTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/bmp', 'image/tiff', 'image/webp'];

      if (!validImageTypes.includes(fileType.mime)) {
        return {
          valid: false,
          reason: `Invalid image type: ${fileType.mime}`
        };
      }

      // Check file size (basic validation)
      const stats = await fs.stat(filePath);
      if (stats.size < 100) { // Less than 100 bytes is suspicious
        return {
          valid: false,
          reason: 'File too small to be a valid image'
        };
      }

      return {
        valid: true,
        metadata: {
          type: fileType.mime,
          extension: fileType.ext,
          size: stats.size
        }
      };

    } catch (error) {
      return {
        valid: false,
        reason: `Image validation error: ${error.message}`
      };
    }
  }

  async validateFile(filePath, filename) {
    const category = this.getFileCategory(filename);

    try {
      // Check if file exists
      await fs.access(filePath);
      const stats = await fs.stat(filePath);

      if (stats.size === 0) {
        return {
          valid: false,
          reason: 'File is empty (0 bytes)',
          fileSize: 0,
          category: category
        };
      }

      // Check max file size
      if (this.maxFileSize && stats.size > this.maxFileSize) {
        return {
          valid: false,
          reason: `File exceeds maximum size limit of ${this.maxFileSize / 1024 / 1024} MB`,
          fileSize: stats.size,
          category: category
        };
      }

      let validationResult;

      if (category === 'audio') {
        validationResult = await this.validateAudioFile(filePath);
      } else if (category === 'image') {
        validationResult = await this.validateImageFile(filePath);
      } else {
        // Reject all non-audio/image files
        const fileExtension = path.extname(filename).toLowerCase();
        validationResult = {
          valid: false,
          reason: `File type not supported: '${fileExtension}' is not an audio or image file`
        };
      }

      return {
        ...validationResult,
        fileSize: stats.size,
        category: category
      };

    } catch (error) {
      return {
        valid: false,
        reason: `File access error: ${error.message}`,
        fileSize: 0,
        category: category
      };
    }
  }

  async moveFile(sourcePath, relativePath) {
    try {
      // Create the full destination path, preserving folder structure
      const destPath = path.join(this.destinationFolder, relativePath);

      // Ensure the destination directory structure exists
      const destDir = path.dirname(destPath);
      await fs.mkdir(destDir, { recursive: true });

      // Move the file (rename is atomic if on same filesystem)
      await fs.rename(sourcePath, destPath);

      console.log(`✅ Moved: ${relativePath} -> ${destPath}`);

      return {
        success: true,
        destPath: destPath
      };
    } catch (error) {
      // If rename fails (e.g., cross-device), try copy + delete
      if (error.code === 'EXDEV') {
        try {
          const destPath = path.join(this.destinationFolder, relativePath);
          const destDir = path.dirname(destPath);
          await fs.mkdir(destDir, { recursive: true });

          await fs.copyFile(sourcePath, destPath);
          await fs.unlink(sourcePath);

          console.log(`✅ Moved (copy+delete): ${relativePath} -> ${destPath}`);

          return {
            success: true,
            destPath: destPath
          };
        } catch (copyError) {
          console.error(`❌ Error moving ${relativePath}:`, copyError.message);
          return {
            success: false,
            error: copyError.message
          };
        }
      }

      console.error(`❌ Error moving ${relativePath}:`, error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async cleanupEmptyDirectories(startPath) {
    try {
      const entries = await fs.readdir(startPath, { withFileTypes: true });

      // Process subdirectories first (depth-first cleanup)
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const fullPath = path.join(startPath, entry.name);
          await this.cleanupEmptyDirectories(fullPath);
        }
      }

      // Re-read directory after subdirectory cleanup to check for remaining files
      const updatedEntries = await fs.readdir(startPath, { withFileTypes: true });

      // Remove any remaining files that aren't allowed (like .DS_Store files)
      for (const entry of updatedEntries) {
        if (entry.isFile()) {
          const filename = entry.name;
          const fullPath = path.join(startPath, filename);

          // Check if this file type is allowed
          if (!this.isFileTypeAllowed(filename)) {
            try {
              await fs.unlink(fullPath);
              const relativePath = path.relative(this.uploadFolder, fullPath);
              console.log(`🧹 Cleaned up orphaned file: ${relativePath}`);
            } catch (unlinkError) {
              console.error(`❌ Failed to remove orphaned file ${fullPath}: ${unlinkError.message}`);
            }
          }
        }
      }

      // Final check if directory is now empty
      const finalEntries = await fs.readdir(startPath);
      if (finalEntries.length === 0 && startPath !== this.uploadFolder) {
        try {
          await fs.rmdir(startPath);
          const relativePath = path.relative(this.uploadFolder, startPath);
          console.log(`🧹 Removed empty directory: ${relativePath}`);
        } catch (rmError) {
          // Only log if it's not a "directory not empty" or "doesn't exist" error
          if (rmError.code !== 'ENOTEMPTY' && rmError.code !== 'ENOENT') {
            console.error(`❌ Failed to remove directory ${startPath}: ${rmError.message}`);
          }
        }
      }
    } catch (error) {
      // Only log unexpected errors (not "directory doesn't exist")
      if (error.code !== 'ENOENT') {
        console.error(`❌ Error during directory cleanup for ${startPath}: ${error.message}`);
      }
    }
  }

  async processBatch() {
    console.log(`\n🔄 Processing batch of ${this.pendingFiles.size} files...`);

    const filesToProcess = Array.from(this.pendingFiles);
    this.pendingFiles.clear(); // Clear the set

    const validationResults = [];
    let movedCount = 0;
    let rejectedCount = 0;

    // Process all pending files
    for (const filePath of filesToProcess) {
      try {
        // Check if file still exists (might have been deleted)
        await fs.access(filePath);
      } catch (error) {
        console.log(`⏭️  Skipping ${filePath} (file no longer exists)`);
        continue;
      }

      const filename = path.basename(filePath);
      const relativePath = path.relative(this.uploadFolder, filePath);

      if (!this.isFileTypeAllowed(filename)) {
        console.log(`⏭️  Skipping ${relativePath} (not in allowed extensions)`);
        await this.logRejectedFile(
          filename,
          'File extension not in allowed list',
          0,
          relativePath
        );

        // Delete the file
        try {
          await fs.unlink(filePath);
          console.log(`🗑️  Deleted rejected file: ${relativePath}`);
        } catch (error) {
          console.error(`❌ Failed to delete rejected file: ${error.message}`);
        }
        rejectedCount++;
        continue;
      }

      // Validate the file
      const validation = await this.validateFile(filePath, filename);

      validationResults.push({
        filePath: filePath,
        relativePath: relativePath,
        validation: validation
      });

      if (validation.valid) {
        console.log(`✅ Validation passed: ${relativePath} (${validation.category})`);

        // Move file to destination
        const moveResult = await this.moveFile(filePath, relativePath);
        if (moveResult.success) {
          movedCount++;
        }
      } else {
        console.log(`❌ Validation failed: ${relativePath} - ${validation.reason}`);
        await this.logRejectedFile(
          filename,
          validation.reason,
          validation.fileSize,
          relativePath
        );

        // Delete invalid file
        try {
          await fs.unlink(filePath);
          console.log(`🗑️  Deleted invalid file: ${relativePath}`);
          rejectedCount++;
        } catch (error) {
          console.error(`❌ Failed to delete invalid file: ${error.message}`);
        }
      }
    }

    // Clean up empty directories in upload folder
    await this.cleanupEmptyDirectories(this.uploadFolder);

    // Summary
    console.log(`\n📊 Batch Summary:`);
    console.log(`   Processed: ${filesToProcess.length} files`);
    console.log(`   Moved to destination: ${movedCount} files`);
    console.log(`   Rejected/Deleted: ${rejectedCount} files`);

    return {
      processed: filesToProcess.length,
      moved: movedCount,
      rejected: rejectedCount
    };
  }

  resetDebounceTimer() {
    // Clear existing timer if any
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    // Set new timer
    this.debounceTimer = setTimeout(async () => {
      if (this.pendingFiles.size > 0) {
        console.log(`\n⏰ Debounce timeout reached. Processing ${this.pendingFiles.size} pending files...`);
        await this.processBatch();
      }
    }, this.debounceTimeout);

    console.log(`⏱️  Debounce timer reset (${this.debounceTimeout / 1000}s)`);
  }

  async scanExistingFiles() {
    console.log('🔍 Scanning for existing files in upload folder...');

    const scanDirectory = async (dir) => {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          await scanDirectory(fullPath);
        } else if (entry.isFile()) {
          this.pendingFiles.add(fullPath);
        }
      }
    };

    try {
      await scanDirectory(this.uploadFolder);
      console.log(`📋 Found ${this.pendingFiles.size} existing files`);

      if (this.pendingFiles.size > 0) {
        this.resetDebounceTimer();
      }
    } catch (error) {
      console.error('❌ Error scanning existing files:', error.message);
    }
  }

  async start() {
    if (this.isRunning) {
      console.log('⚠️  Monitor is already running');
      return;
    }

    this.isRunning = true;
    await this.ensureDirectories();

    // Scan for existing files
    await this.scanExistingFiles();

    console.log('🎯 Starting folder monitoring...');
    console.log('Press Ctrl+C to stop');

    // Start watching the upload folder
    this.watcher = chokidar.watch(this.uploadFolder, {
      ignored: /(^|[\/\\])\../, // ignore dotfiles
      persistent: true,
      ignoreInitial: true, // We already scanned existing files
      awaitWriteFinish: {
        stabilityThreshold: 2000,
        pollInterval: 100
      }
    });

    this.watcher
      .on('add', (filePath) => {
        console.log(`\n📥 New file detected: ${path.relative(this.uploadFolder, filePath)}`);
        this.pendingFiles.add(filePath);
        this.resetDebounceTimer();
      })
      .on('error', (error) => {
        console.error(`❌ Watcher error: ${error.message}`);
      });

    console.log('✅ Monitoring started successfully');
  }

  stop() {
    if (!this.isRunning) {
      console.log('⚠️  Monitor is not running');
      return;
    }

    this.isRunning = false;

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    if (this.watcher) {
      this.watcher.close();
    }

    console.log('🛑 Monitor stopped');
  }
}

// Create and start monitor
const monitor = new UploadFolderMonitor(config);

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down gracefully...');
  monitor.stop();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Shutting down gracefully...');
  monitor.stop();
  process.exit(0);
});

// Start monitoring
monitor.start().catch(error => {
  console.error('Failed to start monitor:', error);
  process.exit(1);
});

module.exports = UploadFolderMonitor;
