'use strict';

// STEP 1: Don't load Sharp immediately - only when needed
let sharp = null;

function loadSharp() {
  if (sharp) return sharp;
  
  try {
    Editor.log('[Tool-Optimize] Loading Sharp.js...');
    sharp = require('sharp');
    Editor.log('[Tool-Optimize] ✓ Sharp loaded successfully!');
    Editor.log('[Tool-Optimize] Sharp version:', sharp.versions.sharp);
    return sharp;
  } catch (err) {
    Editor.error('[Tool-Optimize] ✗ Failed to load Sharp:', err.message);
    Editor.error('[Tool-Optimize] Stack:', err.stack);
    return null;
  }
}

module.exports = {
  load () {
    Editor.log('[Tool-Optimize] ========================================');
    Editor.log('[Tool-Optimize] Extension loading...');
    Editor.log('[Tool-Optimize] ========================================');
    // Don't load Sharp here - wait until user clicks optimize
  },

  unload () {
    Editor.log('[Tool-Optimize] Extension unloaded!');
  },

  // register your ipc messages here
  messages: {
    'open' () {
      Editor.log('[Tool-Optimize] Opening panel...');
      Editor.Panel.open('tool-optimize');
    },
    
    'say-hello' () {
      Editor.log('Hello World!');
      Editor.Ipc.sendToPanel('tool-optimize', 'tool-optimize:hello');
    },
    
    'clicked' () {
      Editor.log('Button clicked!');
    },
    
    'optimize-assets' (event, data) {
      const fs = require('fs');
      const path = require('path');
      
      Editor.log('[Tool-Optimize] ========================================');
      Editor.log('[Tool-Optimize] Starting optimization...');
      Editor.log('[Tool-Optimize] Assets to optimize:', data.assets.length);
      Editor.log('[Tool-Optimize] Compression quality:', data.compressionLevel + '%');
      Editor.log('[Tool-Optimize] ========================================');
      
      // Load Sharp
      const sharpLib = loadSharp();
      if (!sharpLib) {
        Editor.error('[Tool-Optimize] Cannot load Sharp!');
        Editor.Dialog.messageBox({
          type: 'error',
          buttons: ['OK'],
          title: 'Error',
          message: 'Failed to load Sharp.js!\n\nPlease check Console for details.',
          defaultId: 0
        });
        return;
      }
      
      const { assets, compressionLevel } = data;
      let completed = 0;
      let totalOriginalSize = 0;
      let totalNewSize = 0;
      let successCount = 0;
      let errorCount = 0;
      let skippedCount = 0;
      
      // Process each asset sequentially
      const processAsset = async (asset, index) => {
        try {
          // Editor.log(`[Tool-Optimize] [${index + 1}/${assets.length}] Processing: ${path.basename(asset.path)}`);
          
          // Send progress - processing
          Editor.Ipc.sendToPanel('tool-optimize', 'tool-optimize:asset-progress', {
            uuid: asset.uuid,
            status: 'processing',
            progress: 50
          });
          
          // Get original file size
          const originalStats = fs.statSync(asset.path);
          const originalSize = originalStats.size;
          totalOriginalSize += originalSize;
          
          // Only process images (texture type)
          if (asset.type !== 'texture') {
            // Editor.log(`[Tool-Optimize] Skipping non-image: ${asset.type}`);
            totalNewSize += originalSize;
            skippedCount++;
            
            Editor.Ipc.sendToPanel('tool-optimize', 'tool-optimize:asset-progress', {
              uuid: asset.uuid,
              status: 'skipped',
              progress: 100,
              originalSize: originalSize,
              newSize: originalSize
            });
            
            completed++;
            this.sendOverallProgress(completed, assets.length, totalOriginalSize, totalNewSize, successCount, errorCount, skippedCount);
            return;
          }
          
          // Get file extension
          const ext = path.extname(asset.path).toLowerCase();
          
          // Check if format is supported
          if (!['.png', '.jpg', '.jpeg', '.webp'].includes(ext)) {
            Editor.warn(`[Tool-Optimize] Unsupported format: ${ext}`);
            totalNewSize += originalSize;
            skippedCount++;
            
            Editor.Ipc.sendToPanel('tool-optimize', 'tool-optimize:asset-progress', {
              uuid: asset.uuid,
              status: 'skipped',
              progress: 100,
              originalSize: originalSize,
              newSize: originalSize
            });
            
            completed++;
            this.sendOverallProgress(completed, assets.length, totalOriginalSize, totalNewSize, successCount, errorCount, skippedCount);
            return;
          }
          
          // Create backup
          const backupPath = asset.path + '.backup';
          fs.copyFileSync(asset.path, backupPath);
          
          // Optimize based on file type
          const tmpPath = asset.path + '.tmp';
          let sharpInstance = sharpLib(asset.path);
          
          if (ext === '.png') {
            await sharpInstance
              .png({ 
                quality: compressionLevel,
                compressionLevel: 9,
                adaptiveFiltering: true
              })
              .toFile(tmpPath);
          } else if (ext === '.jpg' || ext === '.jpeg') {
            await sharpInstance
              .jpeg({ 
                quality: compressionLevel,
                progressive: true,
                mozjpeg: true
              })
              .toFile(tmpPath);
          } else if (ext === '.webp') {
            await sharpInstance
              .webp({ 
                quality: compressionLevel
              })
              .toFile(tmpPath);
          }
          
          // Get new file size from tmp file
          const tmpStats = fs.statSync(tmpPath);
          const newSize = tmpStats.size;
          
          // Check if optimization actually reduced size
          if (newSize >= originalSize) {
            // Optimization failed - new size is same or larger
            Editor.warn(`[Tool-Optimize] ✗ Failed: ${path.basename(asset.path)} - Size not reduced`);
            Editor.log(`[Tool-Optimize]   Original: ${(originalSize / 1024).toFixed(2)} KB`);
            Editor.log(`[Tool-Optimize]   New: ${(newSize / 1024).toFixed(2)} KB`);
            
            // Remove tmp file and restore original
            fs.unlinkSync(tmpPath);
            // Backup is still original, no need to restore
            fs.unlinkSync(backupPath);
            
            totalNewSize += originalSize;
            errorCount++;
            
            // Send progress - error (optimization failed)
            Editor.Ipc.sendToPanel('tool-optimize', 'tool-optimize:asset-progress', {
              uuid: asset.uuid,
              status: 'error',
              progress: 100,
              originalSize: originalSize,
              newSize: originalSize,
              error: 'Size not reduced'
            });
            
            completed++;
            this.sendOverallProgress(completed, assets.length, totalOriginalSize, totalNewSize, successCount, errorCount, skippedCount);
            return;
          }
          
          // Optimization successful - replace original with optimized
          fs.unlinkSync(asset.path);
          fs.renameSync(tmpPath, asset.path);
          totalNewSize += newSize;
          
          // Remove backup
          fs.unlinkSync(backupPath);
          
          const savings = ((originalSize - newSize) / originalSize * 100).toFixed(2);
          successCount++;
          
          // Editor.log(`[Tool-Optimize] ✓ Success: ${path.basename(asset.path)}`);
          // Editor.log(`[Tool-Optimize]   Original: ${(originalSize / 1024).toFixed(2)} KB`);
          // Editor.log(`[Tool-Optimize]   New: ${(newSize / 1024).toFixed(2)} KB`);
          // Editor.log(`[Tool-Optimize]   Saved: ${savings}%`);
          
          // Send progress - success
          Editor.Ipc.sendToPanel('tool-optimize', 'tool-optimize:asset-progress', {
            uuid: asset.uuid,
            status: 'success',
            progress: 100,
            originalSize: originalSize,
            newSize: newSize,
            savings: savings
          });
          
          // Refresh asset in database
          Editor.assetdb.refresh(asset.url);
          
        } catch (err) {
          Editor.error(`[Tool-Optimize] ✗ Error: ${path.basename(asset.path)}`, err.message);
          errorCount++;
          
          // Restore backup if exists
          const backupPath = asset.path + '.backup';
          if (fs.existsSync(backupPath)) {
            try {
              if (fs.existsSync(asset.path + '.tmp')) {
                fs.unlinkSync(asset.path + '.tmp');
              }
              fs.copyFileSync(backupPath, asset.path);
              fs.unlinkSync(backupPath);
              Editor.log(`[Tool-Optimize] Restored backup for: ${path.basename(asset.path)}`);
            } catch (restoreErr) {
              Editor.error(`[Tool-Optimize] Failed to restore backup:`, restoreErr);
            }
          }
          
          // Send progress - error
          Editor.Ipc.sendToPanel('tool-optimize', 'tool-optimize:asset-progress', {
            uuid: asset.uuid,
            status: 'error',
            progress: 100,
            error: err.message
          });
        }
        
        completed++;
        this.sendOverallProgress(completed, assets.length, totalOriginalSize, totalNewSize, successCount, errorCount, skippedCount);
      };
      
      // Process assets sequentially
      (async () => {
        for (let i = 0; i < assets.length; i++) {
          await processAsset(assets[i], i);
        }
      })();
    },
    
    'test-sharp' () {
      Editor.log('[Tool-Optimize] ========================================');
      Editor.log('[Tool-Optimize] Testing Sharp...');
      Editor.log('[Tool-Optimize] ========================================');
      
      const sharpLib = loadSharp();
      
      if (!sharpLib) {
        Editor.Dialog.messageBox({
          type: 'error',
          buttons: ['OK'],
          title: 'Sharp Error',
          message: 'Failed to load Sharp.js!\n\nCheck Console for details.',
          defaultId: 0
        });
        return;
      }
      
      // Test Sharp with a simple operation
      try {
        Editor.log('[Tool-Optimize] Creating test image...');
        
        sharpLib({
          create: {
            width: 100,
            height: 100,
            channels: 4,
            background: { r: 255, g: 0, b: 0, alpha: 1 }
          }
        })
        .png()
        .toBuffer()
        .then(buffer => {
          Editor.log('[Tool-Optimize] ✓ Sharp test successful!');
          Editor.log('[Tool-Optimize] Generated buffer size:', buffer.length, 'bytes');
          Editor.log('[Tool-Optimize] ========================================');
          
          Editor.Dialog.messageBox({
            type: 'info',
            buttons: ['OK'],
            title: 'Sharp Test Success',
            message: `Sharp.js is working!\n\nVersion: ${sharpLib.versions.sharp}\nTest buffer: ${buffer.length} bytes`,
            defaultId: 0
          });
        })
        .catch(err => {
          Editor.error('[Tool-Optimize] ✗ Sharp test failed:', err);
          
          Editor.Dialog.messageBox({
            type: 'error',
            buttons: ['OK'],
            title: 'Sharp Test Failed',
            message: `Sharp loaded but test failed!\n\nError: ${err.message}`,
            defaultId: 0
          });
        });
        
      } catch (err) {
        Editor.error('[Tool-Optimize] ✗ Sharp test error:', err);
        
        Editor.Dialog.messageBox({
          type: 'error',
          buttons: ['OK'],
          title: 'Sharp Test Error',
          message: `Error testing Sharp!\n\nError: ${err.message}`,
          defaultId: 0
        });
      }
    }
  },
  
  sendOverallProgress(completed, total, totalOriginalSize, totalNewSize, successCount, errorCount, skippedCount) {
    const progress = (completed / total * 100).toFixed(2);
    const savings = totalOriginalSize > 0 ? ((totalOriginalSize - totalNewSize) / totalOriginalSize * 100).toFixed(2) : 0;
    
    Editor.Ipc.sendToPanel('tool-optimize', 'tool-optimize:overall-progress', {
      completed: completed,
      total: total,
      progress: progress,
      totalOriginalSize: totalOriginalSize,
      totalNewSize: totalNewSize,
      savings: savings,
      successCount: successCount,
      errorCount: errorCount,
      skippedCount: skippedCount
    });
    
    if (completed === total) {
      Editor.log('[Tool-Optimize] ========================================');
      Editor.log('[Tool-Optimize] ✓✓✓ OPTIMIZATION COMPLETE! ✓✓✓');
      Editor.log('[Tool-Optimize] ========================================');
      Editor.log(`[Tool-Optimize] Total: ${total} assets`);
      Editor.log(`[Tool-Optimize] Success: ${successCount}`);
      Editor.log(`[Tool-Optimize] Error: ${errorCount}`);
      Editor.log(`[Tool-Optimize] Skipped: ${skippedCount}`);
      Editor.log(`[Tool-Optimize] Original size: ${(totalOriginalSize / 1024 / 1024).toFixed(2)} MB`);
      Editor.log(`[Tool-Optimize] New size: ${(totalNewSize / 1024 / 1024).toFixed(2)} MB`);
      Editor.log(`[Tool-Optimize] Saved: ${savings}% (${((totalOriginalSize - totalNewSize) / 1024 / 1024).toFixed(2)} MB)`);
      Editor.log('[Tool-Optimize] ========================================');
    }
  }
};