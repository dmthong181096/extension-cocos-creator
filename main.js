'use strict';

const child_process = require('child_process');
const path = require('path');

// Execute sharp-worker.js using the system's Node.js
function runSharpWorker(args) {
  return new Promise((resolve, reject) => {
    const workerPath = path.join(__dirname, 'sharp-worker.js');
    // Escape arguments for the shell
    const escapedArgs = args.map(arg => `"${arg.toString().replace(/"/g, '\\"')}"`).join(' ');
    
    // Check if node exists
    child_process.exec(`node "${workerPath}" ${escapedArgs}`, {
      cwd: __dirname,
      maxBuffer: 1024 * 1024 * 10 // 10MB buffer just in case
    }, (error, stdout, stderr) => {
      if (error) {
        // Not a node error, probably command failed
        if (stderr) {
          Editor.error('[Tool-Optimize] Worker stderr:', stderr);
        }
        return reject(new Error(`Failed to execute Node.js: ${error.message}`));
      }

      try {
        // We expect stdout to be the JSON response
        // But there might be other logs. Get the last line that looks like JSON
        const lines = stdout.trim().split('\n');
        let jsonStr = lines[lines.length - 1];
        
        const result = JSON.parse(jsonStr);
        if (result.success) {
          resolve(result);
        } else {
          reject(new Error(result.error || 'Unknown worker error'));
        }
      } catch (err) {
        Editor.error('[Tool-Optimize] Failed to parse worker output:', stdout);
        reject(new Error(`Worker parse error: ${err.message}`));
      }
    });
  });
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
          
          // Create backup (Use writeFileSync + readFileSync because old Node doesn't have copyFileSync)
          const backupPath = asset.path + '.backup';
          fs.writeFileSync(backupPath, fs.readFileSync(asset.path));
          
          // Optimize based on file type
          const tmpPath = asset.path + '.tmp';
          
          // Call sharp worker
          try {
            await runSharpWorker(['optimize', asset.path, tmpPath, ext, compressionLevel]);
          } catch (err) {
            Editor.error(`[Tool-Optimize] Worker error processing ${asset.path}:`, err);
            throw err;
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
              fs.writeFileSync(asset.path, fs.readFileSync(backupPath));
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
      
      Editor.log('[Tool-Optimize] Creating test image via child process...');
      
      runSharpWorker(['test'])
        .then(result => {
          Editor.log('[Tool-Optimize] ✓ Sharp test successful!');
          Editor.log('[Tool-Optimize] Generated buffer size:', result.size, 'bytes');
          Editor.log('[Tool-Optimize] ========================================');
          
          Editor.Dialog.messageBox({
            type: 'info',
            buttons: ['OK'],
            title: 'Sharp Test Success',
            message: `Sharp.js is working via Worker!\n\nVersion: ${result.version}\nTest buffer: ${result.size} bytes`,
            defaultId: 0
          });
        })
        .catch(err => {
          Editor.error('[Tool-Optimize] ✗ Sharp test failed:', err);
          
          Editor.Dialog.messageBox({
            type: 'error',
            buttons: ['OK'],
            title: 'Sharp Test Failed',
            message: `Worker test failed!\n\nError: ${err.message}`,
            defaultId: 0
          });
        });
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