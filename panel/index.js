const fs = require('fs');
const path = require('path');

Editor.Panel.extend({
  style: `
    :host { 
      margin: 0; 
      padding: 0; 
      display: flex; 
      flex-direction: column; 
      height: 100%; 
      overflow: hidden; 
      background: #101622; 
    }
  `,

  template: fs.readFileSync(Editor.url('packages://tool-optimize/panel/home.html'), 'utf8'),

  $: {},

  ready() {
    // Initialize debug logging (default: OFF)
    this.debugLogsEnabled = false;
    
    Editor.log('[Tool-Optimize] ========================================');
    Editor.log('[Tool-Optimize] Panel Ready - Initializing...');
    Editor.log('[Tool-Optimize] ========================================');
    
    // Get elements from shadow DOM
    const folderAsset = this.shadowRoot.querySelector('#folderAsset');
    const folderInfo = this.shadowRoot.querySelector('#folderInfo');
    const folderPath = this.shadowRoot.querySelector('#folderPath');
    const folderUrl = this.shadowRoot.querySelector('#folderUrl');
    const devToolsBtn = this.shadowRoot.querySelector('#devToolsBtn');
    const optimizeBtn = this.shadowRoot.querySelector('#optimizeBtn');
    
    Editor.log('[Tool-Optimize] Elements found:');
    Editor.log('[Tool-Optimize]   - folderAsset:', folderAsset);
    Editor.log('[Tool-Optimize]   - folderInfo:', folderInfo);
    Editor.log('[Tool-Optimize]   - devToolsBtn:', devToolsBtn);
    Editor.log('[Tool-Optimize]   - optimizeBtn:', optimizeBtn);
    
    if (!folderAsset) {
      Editor.error('[Tool-Optimize] folderAsset not found!');
      return;
    }
    
    // Store selected folder
    let selectedFolder = null;
    this.selectedFolder = null; // Store as property for access in other methods
    
    // Listen to folder asset change
    Editor.log('[Tool-Optimize] Adding change listener to folderAsset...');
    folderAsset.addEventListener('change', (e) => {
      Editor.log('[Tool-Optimize] ========================================');
      Editor.log('[Tool-Optimize] === FOLDER ASSET CHANGED ===');
      Editor.log('[Tool-Optimize] Value (UUID):', folderAsset.value);
      Editor.log('[Tool-Optimize] ========================================');
      
      if (folderAsset.value) {
        // Folder selected
        Editor.assetdb.queryInfoByUuid(folderAsset.value, (err, info) => {
          if (err) {
            Editor.error('[Tool-Optimize] Error querying asset info:', err);
            this.resetUI();
            return;
          }
          
          Editor.log('[Tool-Optimize] ========================================');
          Editor.log('[Tool-Optimize] ✓✓✓ FOLDER DROPPED SUCCESSFULLY! ✓✓✓');
          Editor.log('[Tool-Optimize] ========================================');
          Editor.log('[Tool-Optimize] UUID:', info.uuid);
          Editor.log('[Tool-Optimize] URL:', info.url);
          Editor.log('[Tool-Optimize] Path:', info.path);
          Editor.log('[Tool-Optimize] Type:', info.type);
          Editor.log('[Tool-Optimize] ========================================');
          
          selectedFolder = info;
          this.selectedFolder = info; // Store as property
          
          // Update UI
          if (folderInfo) folderInfo.style.display = 'block';
          if (folderPath) folderPath.textContent = info.path;
          if (folderUrl) folderUrl.textContent = info.url;
          
          // Show footer with slide up animation
          const footer = this.shadowRoot.querySelector('#statsFooter');
          if (footer) {
            footer.classList.remove('hidden');
            Editor.log('[Tool-Optimize] ✓ Footer shown (slide up)');
          }
          
          Editor.log('[Tool-Optimize] ✓ UI updated');
          
          // Scan folder for assets
          this.scanFolderAssets(info);
        });
      } else {
        // Folder removed/cleared
        Editor.log('[Tool-Optimize] Folder cleared - resetting UI');
        selectedFolder = null;
        this.selectedFolder = null; // Clear property
        this.resetUI();
      }
    });
    
    // Drag events
    Editor.log('[Tool-Optimize] Adding drag event listeners...');
    folderAsset.addEventListener('dragenter', (e) => {
      Editor.log('[Tool-Optimize] 🎯 User is dragging into drop zone...');
    });
    
    folderAsset.addEventListener('dragleave', (e) => {
      Editor.log('[Tool-Optimize] ❌ User dragged away');
    });
    
    folderAsset.addEventListener('drop', (e) => {
      Editor.log('[Tool-Optimize] 📦 User dropped something!');
    });
    
    // Size Info button
    const sizeInfoBtn = this.shadowRoot.querySelector('#sizeInfoBtn');
    const sizeInfoOverlay = this.shadowRoot.querySelector('#sizeInfoOverlay');
    const sizeInfoClose = this.shadowRoot.querySelector('#sizeInfoClose');
    
    if (sizeInfoBtn) {
      sizeInfoBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        Editor.log('[Tool-Optimize] Size Info button clicked!');
        this.showSizeInfo();
      });
    }
    
    if (sizeInfoClose) {
      sizeInfoClose.addEventListener('click', () => {
        if (sizeInfoOverlay) {
          sizeInfoOverlay.classList.remove('show');
        }
      });
    }
    
    if (sizeInfoOverlay) {
      sizeInfoOverlay.addEventListener('click', (e) => {
        if (e.target === sizeInfoOverlay) {
          sizeInfoOverlay.classList.remove('show');
        }
      });
    }
    
    // Show Logs checkbox
    const showLogsCheckbox = this.shadowRoot.querySelector('#showLogsCheckbox');
    if (showLogsCheckbox) {
      showLogsCheckbox.addEventListener('change', (e) => {
        this.debugLogsEnabled = e.target.checked;
        Editor.log('[Tool-Optimize] Debug logs:', this.debugLogsEnabled ? 'ENABLED' : 'DISABLED');
      });
    }
    
    // Test Sharp button
    const testSharpBtn = this.shadowRoot.querySelector('#testSharpBtn');
    if (testSharpBtn) {
      testSharpBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        Editor.log('[Tool-Optimize] Test Sharp button clicked!');
        Editor.Ipc.sendToMain('tool-optimize:test-sharp');
      });
    }
    
    // DevTools button
    if (devToolsBtn) {
      devToolsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        Editor.log('[Tool-Optimize] DevTools button clicked!');
        
        try {
          const electron = require('electron');
          const browserWindow = electron.remote.BrowserWindow;
          const thisWindow = browserWindow.getFocusedWindow();
          const extensionWindow = Editor.remote.Window.find(thisWindow);
          
          if (extensionWindow) {
            Editor.log('[Tool-Optimize] Opening DevTools...');
            extensionWindow.openDevTools();
          } else {
            Editor.error('[Tool-Optimize] Extension window not found!');
          }
        } catch (err) {
          Editor.error('[Tool-Optimize] Error:', err);
        }
      });
    }
    
    // Optimize button
    if (optimizeBtn) {
      optimizeBtn.addEventListener('click', () => {
        Editor.log('[Tool-Optimize] === OPTIMIZE BUTTON CLICKED ===');
        
        if (!selectedFolder) {
          Editor.warn('[Tool-Optimize] No folder selected!');
          Editor.Dialog.messageBox({
            type: 'warning',
            buttons: ['OK'],
            title: 'Warning',
            message: 'Please select a folder first!',
            defaultId: 0
          });
          return;
        }
        
        // Get selected assets (checked checkboxes)
        const tableBody = this.shadowRoot.querySelector('#assetTableBody');
        const checkboxes = tableBody.querySelectorAll('input[type="checkbox"]:checked');
        
        if (checkboxes.length === 0) {
          Editor.warn('[Tool-Optimize] No assets selected!');
          Editor.Dialog.messageBox({
            type: 'warning',
            buttons: ['OK'],
            title: 'Warning',
            message: 'Please select at least one asset to optimize!',
            defaultId: 0
          });
          return;
        }
        
        // Get compression level
        const compressionLevel = this.shadowRoot.querySelector('#compressionLevel');
        let quality = parseFloat(compressionLevel.value);
        
        // Validate compression level
        if (isNaN(quality) || quality < 0 || quality > 100) {
          Editor.warn('[Tool-Optimize] Invalid compression level:', quality);
          Editor.Dialog.messageBox({
            type: 'warning',
            buttons: ['OK'],
            title: 'Invalid Compression Level',
            message: 'Please enter a value between 0 and 100!',
            defaultId: 0
          });
          return;
        }
        
        // Get auto-scroll option
        const autoScrollCheckbox = this.shadowRoot.querySelector('#autoScrollCheckbox');
        const autoScroll = autoScrollCheckbox ? autoScrollCheckbox.checked : false;
        
        // Store auto-scroll setting
        this.autoScrollEnabled = autoScroll;
        
        Editor.log('[Tool-Optimize] Starting optimization...');
        Editor.log('[Tool-Optimize] Selected assets:', checkboxes.length);
        Editor.log('[Tool-Optimize] Compression quality:', quality + '%');
        Editor.log('[Tool-Optimize] Auto-scroll:', autoScroll);
        
        // Collect selected assets data
        const selectedAssets = [];
        checkboxes.forEach(checkbox => {
          const uuid = checkbox.getAttribute('data-uuid');
          const row = checkbox.closest('tr');
          
          // Find asset in currentAssets
          const asset = this.currentAssets.find(a => a.uuid === uuid);
          if (asset) {
            selectedAssets.push({
              uuid: asset.uuid,
              path: asset.path,
              url: asset.url,
              type: asset.type
            });
          }
        });
        
        // Disable optimize button during processing
        optimizeBtn.disabled = true;
        optimizeBtn.innerHTML = '<span>⏳</span><span>Optimizing...</span>';
        
        // Reset progress
        const progressFill = this.shadowRoot.querySelector('.progress-fill');
        const progressLabel = this.shadowRoot.querySelector('.progress-label');
        if (progressFill) progressFill.style.width = '0%';
        if (progressLabel) progressLabel.textContent = 'Overall Progress (0%)';
        
        // Reset stats
        const sizeAfterStat = this.shadowRoot.querySelector('.stat-item:nth-child(4) .stat-value');
        const savingsStat = this.shadowRoot.querySelector('.stat-item:nth-child(5) .stat-value');
        if (sizeAfterStat) sizeAfterStat.textContent = '0 MB';
        if (savingsStat) savingsStat.textContent = '0%';
        
        // Reset all asset rows to pending
        checkboxes.forEach(checkbox => {
          const row = checkbox.closest('tr');
          const progressBar = row.querySelector('.progress-bar');
          const statusIcon = row.querySelector('.status-icon');
          const newSizeCell = row.querySelector('td:nth-child(5)');
          
          if (progressBar) {
            progressBar.style.width = '0%';
            progressBar.className = 'progress-bar';
          }
          if (statusIcon) {
            statusIcon.textContent = '⏱';
            statusIcon.className = 'status-icon pending';
          }
          if (newSizeCell) {
            newSizeCell.textContent = '-';
          }
        });
        
        // Send IPC message to main process
        Editor.Ipc.sendToMain('tool-optimize:optimize-assets', {
          assets: selectedAssets,
          compressionLevel: quality
        });
      });
    }
    
    // Filter tabs
    const filterTabs = this.shadowRoot.querySelectorAll('.filter-tab');
    Editor.log('[Tool-Optimize] Filter tabs found:', filterTabs.length);
    
    filterTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const filter = tab.getAttribute('data-filter');
        Editor.log('[Tool-Optimize] Filter tab clicked:', filter);
        
        // Update active tab
        filterTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        
        // Apply filter
        this.applyFilter(filter);
      });
    });
    
    // Search input
    const searchInput = this.shadowRoot.querySelector('.search-input');
    Editor.log('[Tool-Optimize] Search input found:', searchInput);
    
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        const searchTerm = e.target.value.trim().toLowerCase();
        Editor.log('[Tool-Optimize] Search term:', searchTerm);
        this.applySearch(searchTerm);
      });
    }
    
    // Select all checkbox
    const selectAllCheckbox = this.shadowRoot.querySelector('#selectAllCheckbox');
    Editor.log('[Tool-Optimize] Select all checkbox found:', selectAllCheckbox);
    
    if (selectAllCheckbox) {
      selectAllCheckbox.addEventListener('change', (e) => {
        const isChecked = e.target.checked;
        Editor.log('[Tool-Optimize] Select all:', isChecked);
        this.toggleSelectAll(isChecked);
      });
    }
    
    // Reset UI to initial state
    this.resetUI();
    
    Editor.log('[Tool-Optimize] ========================================');
    Editor.log('[Tool-Optimize] ✓ Panel initialized successfully!');
    Editor.log('[Tool-Optimize] ========================================');
  },

  currentAssets: [],
  currentFilter: 'all',
  currentSearchTerm: '',

  applyFilter(filter) {
    Editor.log('[Tool-Optimize] Applying filter:', filter);
    
    this.currentFilter = filter;
    this.applyFiltersAndSearch();
  },

  applySearch(searchTerm) {
    this.currentSearchTerm = searchTerm;
    this.applyFiltersAndSearch();
  },

  applyFiltersAndSearch() {
    const tableBody = this.shadowRoot.querySelector('#assetTableBody');
    
    if (!tableBody || this.currentAssets.length === 0) {
      return;
    }
    
    // Start with all assets
    let filteredAssets = this.currentAssets;
    
    // Apply type filter
    if (this.currentFilter === 'images') {
      filteredAssets = filteredAssets.filter(a => a.type === 'texture');
    } else if (this.currentFilter === 'audio') {
      filteredAssets = filteredAssets.filter(a => a.type === 'audio-clip');
    } else if (this.currentFilter === 'videos') {
      filteredAssets = filteredAssets.filter(a => a.type === 'video-clip');
    }
    
    // Apply search filter
    if (this.currentSearchTerm) {
      filteredAssets = filteredAssets.filter(asset => {
        const path = require('path');
        const fileName = path.basename(asset.url).toLowerCase();
        return fileName.includes(this.currentSearchTerm);
      });
    }
    
    Editor.log('[Tool-Optimize] Filtered assets:', filteredAssets.length, '/', this.currentAssets.length);
    if (this.currentSearchTerm) {
      Editor.log('[Tool-Optimize] Search term:', this.currentSearchTerm);
    }
    
    // Update table with filtered assets
    this.updateAssetTable(filteredAssets);
    
    // Update tab counts (always show total counts, not filtered)
    this.updateTabCounts();
  },

  updateTabCounts() {
    const tabs = this.shadowRoot.querySelectorAll('.filter-tab');
    
    // If no assets, show tabs without counts
    if (!this.currentAssets || this.currentAssets.length === 0) {
      const filterNames = {
        all: 'All',
        images: 'Images',
        audio: 'Audio',
        videos: 'Videos'
      };
      
      tabs.forEach(tab => {
        const filter = tab.getAttribute('data-filter');
        tab.textContent = filterNames[filter];
      });
      
      Editor.log('[Tool-Optimize] Tab counts cleared (no assets)');
      return;
    }
    
    // Count by type
    const counts = {
      all: this.currentAssets.length,
      images: this.currentAssets.filter(a => a.type === 'texture').length,
      audio: this.currentAssets.filter(a => a.type === 'audio-clip').length,
      videos: this.currentAssets.filter(a => a.type === 'video-clip').length
    };
    
    tabs.forEach(tab => {
      const filter = tab.getAttribute('data-filter');
      const count = counts[filter] || 0;
      
      // Update tab text with count
      const filterNames = {
        all: 'All',
        images: 'Images',
        audio: 'Audio',
        videos: 'Videos'
      };
      
      tab.textContent = `${filterNames[filter]} (${count})`;
    });
    
    Editor.log('[Tool-Optimize] Tab counts updated:', counts);
  },

  scanFolderAssets(folderInfo) {
    Editor.log('[Tool-Optimize] ========================================');
    Editor.log('[Tool-Optimize] Scanning folder for assets...');
    Editor.log('[Tool-Optimize] Folder URL:', folderInfo.url);
    Editor.log('[Tool-Optimize] Folder Path:', folderInfo.path);
    Editor.log('[Tool-Optimize] ========================================');
    
    // Ensure URL ends with /
    let folderUrl = folderInfo.url;
    if (!folderUrl.endsWith('/')) {
      folderUrl += '/';
    }
    
    // Query all assets recursively
    const pattern = folderUrl + '**/*';
    Editor.log('[Tool-Optimize] Query pattern:', pattern);
    
    Editor.assetdb.queryAssets(pattern, null, (err, results) => {
      if (err) {
        Editor.error('[Tool-Optimize] Error querying assets:', err);
        return;
      }
      
      Editor.log('[Tool-Optimize] ========================================');
      Editor.log('[Tool-Optimize] Total items found:', results.length);
      
      // Log first few items for debugging
      if (results.length > 0) {
        Editor.log('[Tool-Optimize] Sample items:');
        results.slice(0, 5).forEach((item, i) => {
          Editor.log(`[Tool-Optimize]   ${i + 1}. ${item.url} (${item.type})`);
        });
      }
      
      // Filter supported asset types
      const supportedTypes = ['texture', 'audio-clip', 'video-clip'];
      const assets = results.filter(asset => {
        const isSupported = supportedTypes.includes(asset.type);
        if (!isSupported && asset.type !== 'folder') {
          Editor.log('[Tool-Optimize] Skipping unsupported type:', asset.type, '-', asset.url);
        }
        return isSupported;
      });
      
      Editor.log('[Tool-Optimize] ========================================');
      Editor.log('[Tool-Optimize] Supported assets found:', assets.length);
      
      // Group by type
      const byType = {};
      assets.forEach(asset => {
        if (!byType[asset.type]) byType[asset.type] = 0;
        byType[asset.type]++;
      });
      
      Editor.log('[Tool-Optimize] Assets by type:');
      Object.keys(byType).forEach(type => {
        Editor.log(`[Tool-Optimize]   - ${type}: ${byType[type]}`);
      });
      
      Editor.log('[Tool-Optimize] ========================================');
      
      // Store assets for filtering
      this.currentAssets = assets;
      this.currentFilter = 'all';
      
      // Update tab counts
      this.updateTabCounts();
      
      // Update table with all assets initially
      this.updateAssetTable(assets);
      
      // Enable controls (filter, search, etc.) when folder is selected
      // But optimize button depends on whether there are assets
      this.setControlsEnabled(true, assets.length > 0);
    });
  },

  updateAssetTable(assets) {
    const tableBody = this.shadowRoot.querySelector('#assetTableBody');
    if (!tableBody) {
      Editor.error('[Tool-Optimize] Table body not found!');
      return;
    }
    
    // Clear table
    tableBody.innerHTML = '';
    
    if (assets.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align: center; padding: 40px; color: #6b7280;">
            No supported assets found in this folder<br>
            <span style="font-size: 12px; color: #9ca3af;">Supported types: Images (PNG, JPG), Audio (MP3, WAV), Video (MP4)</span>
          </td>
        </tr>
      `;
      return;
    }
    
    const fs = require('fs');
    const path = require('path');
    
    // Sort assets by type then name
    assets.sort((a, b) => {
      if (a.type !== b.type) {
        return a.type.localeCompare(b.type);
      }
      return a.url.localeCompare(b.url);
    });
    
    // Add rows for each asset
    assets.forEach((asset, index) => {
      // Get file size
      let fileSize = '-';
      let fileSizeBytes = 0;
      try {
        const stats = fs.statSync(asset.path);
        fileSizeBytes = stats.size;
        fileSize = this.formatFileSize(stats.size);
      } catch (err) {
        Editor.warn('[Tool-Optimize] Cannot get file size for:', asset.path);
      }
      
      // Get asset type display name and icon
      let typeDisplay = asset.type;
      let typeIcon = '📄';
      if (asset.type === 'texture') {
        typeDisplay = 'Image';
        typeIcon = '🖼️';
      } else if (asset.type === 'audio-clip') {
        typeDisplay = 'Audio';
        typeIcon = '🎵';
      } else if (asset.type === 'video-clip') {
        typeDisplay = 'Video';
        typeIcon = '🎥';
      }
      
      // Get relative path from folder
      const fileName = path.basename(asset.url);
      const relativePath = asset.url;
      
      const row = document.createElement('tr');
      row.setAttribute('data-uuid', asset.uuid);
      row.setAttribute('data-path', asset.path);
      row.setAttribute('data-size', fileSizeBytes);
      row.innerHTML = `
        <td><input type="checkbox" checked data-uuid="${asset.uuid}" class="asset-checkbox" /></td>
        <td class="file-name" title="${relativePath}">${typeIcon} ${fileName}</td>
        <td class="file-type table-col-type">${typeDisplay}</td>
        <td class="file-size">${fileSize}</td>
        <td class="file-size table-col-new-size">-</td>
        <td>
          <div class="progress-wrapper">
            <div class="progress-bar-bg">
              <div class="progress-bar" style="width: 0%"></div>
            </div>
            <span class="status-icon pending">⏱</span>
          </div>
        </td>
      `;
      
      // Add change listener to individual checkbox
      const checkbox = row.querySelector('.asset-checkbox');
      checkbox.addEventListener('change', () => {
        this.updateSelectedCount();
      });
      
      tableBody.appendChild(row);
    });
    
    Editor.log('[Tool-Optimize] ========================================');
    Editor.log('[Tool-Optimize] ✓ Table updated with', assets.length, 'assets');
    Editor.log('[Tool-Optimize] ========================================');
    
    // Update stats
    this.updateStats(assets);
    
    // Update selected count
    this.updateSelectedCount();
  },

  updateStats(assets) {
    // Update total assets count
    const totalAssets = this.shadowRoot.querySelector('.stat-item:nth-child(1) .stat-value');
    if (totalAssets) {
      totalAssets.textContent = assets.length;
    }
    
    // Count selected
    const selectedCount = assets.length; // All checked by default
    const selectedAssets = this.shadowRoot.querySelector('.stat-item:nth-child(2) .stat-value');
    if (selectedAssets) {
      selectedAssets.textContent = selectedCount;
    }
    
    // Calculate total size
    const fs = require('fs');
    let totalSize = 0;
    assets.forEach(asset => {
      try {
        const stats = fs.statSync(asset.path);
        totalSize += stats.size;
      } catch (err) {
        // Ignore
      }
    });
    
    // Store original size for later (won't change after optimization)
    this.originalTotalSize = totalSize;
    
    // Format total size in MB with comma separator
    const totalSizeMB = totalSize / (1024 * 1024);
    const totalSizeFormatted = this.formatNumber(totalSizeMB.toFixed(2)) + ' MB';
    
    const sizeBefore = this.shadowRoot.querySelector('.stat-item:nth-child(3) .stat-value');
    if (sizeBefore) {
      sizeBefore.textContent = totalSizeFormatted;
    }
    
    Editor.log('[Tool-Optimize] Total size:', totalSizeFormatted);
  },

  logDebug(message) {
    // Only log if debug logs are enabled
    if (this.debugLogsEnabled) {
      Editor.log(message);
    }
  },
  
  formatNumber(num) {
    // Convert to string and add comma separators
    const parts = num.toString().split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return parts.join('.');
  },

  resetUI() {
    Editor.log('[Tool-Optimize] Resetting UI...');
    
    // Clear assets
    this.currentAssets = [];
    this.currentFilter = 'all';
    this.currentSearchTerm = '';
    
    // Hide folder info
    const folderInfo = this.shadowRoot.querySelector('#folderInfo');
    if (folderInfo) {
      folderInfo.style.display = 'none';
    }
    
    // Hide footer with slide down animation
    const footer = this.shadowRoot.querySelector('#statsFooter');
    if (footer) {
      footer.classList.add('hidden');
      Editor.log('[Tool-Optimize] ✓ Footer hidden (slide down)');
    }
    
    // Clear table
    const tableBody = this.shadowRoot.querySelector('#assetTableBody');
    if (tableBody) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align: center; padding: 40px; color: #6b7280;">
            Select a folder to view assets
          </td>
        </tr>
      `;
    }
    
    // Reset stats to 0
    const stats = [
      { selector: '.stat-item:nth-child(1) .stat-value', value: '0' },
      { selector: '.stat-item:nth-child(2) .stat-value', value: '0' },
      { selector: '.stat-item:nth-child(3) .stat-value', value: '0 MB' },
      { selector: '.stat-item:nth-child(4) .stat-value', value: '0 MB' },
      { selector: '.stat-item:nth-child(5) .stat-value', value: '0%' }
    ];
    
    stats.forEach(stat => {
      const element = this.shadowRoot.querySelector(stat.selector);
      if (element) {
        element.textContent = stat.value;
      }
    });
    
    // Reset tab counts
    this.updateTabCounts();
    
    // Reset select all checkbox
    const selectAllCheckbox = this.shadowRoot.querySelector('#selectAllCheckbox');
    if (selectAllCheckbox) {
      selectAllCheckbox.checked = false;
      selectAllCheckbox.indeterminate = false;
    }
    
    // Clear search input
    const searchInput = this.shadowRoot.querySelector('.search-input');
    if (searchInput) {
      searchInput.value = '';
    }
    
    // Reset progress bar
    const progressFill = this.shadowRoot.querySelector('.progress-fill');
    if (progressFill) {
      progressFill.style.width = '0%';
    }
    
    const progressLabel = this.shadowRoot.querySelector('.progress-label');
    if (progressLabel) {
      progressLabel.textContent = 'Overall Progress (0%)';
    }
    
    // Disable all controls except DevTools button
    this.setControlsEnabled(false, false);
    
    Editor.log('[Tool-Optimize] ✓ UI reset complete');
  },

  setControlsEnabled(enabled, hasAssets) {
    Editor.log('[Tool-Optimize] Setting controls - enabled:', enabled, 'hasAssets:', hasAssets);
    
    // Optimize button - ONLY enabled when folder is selected
    const optimizeBtn = this.shadowRoot.querySelector('#optimizeBtn');
    if (optimizeBtn) {
      optimizeBtn.disabled = !enabled;
      
      // Visual feedback
      if (!enabled) {
        optimizeBtn.style.opacity = '0.5';
        optimizeBtn.style.cursor = 'not-allowed';
      } else {
        optimizeBtn.style.opacity = '1';
        optimizeBtn.style.cursor = 'pointer';
      }
    }
    
    // Filter tabs - enabled when folder is selected
    const filterTabs = this.shadowRoot.querySelectorAll('.filter-tab');
    filterTabs.forEach(tab => {
      if (enabled) {
        tab.style.pointerEvents = 'auto';
        tab.style.opacity = '1';
      } else {
        tab.style.pointerEvents = 'none';
        tab.style.opacity = '0.5';
      }
    });
    
    // Search input - enabled when folder is selected
    const searchInput = this.shadowRoot.querySelector('.search-input');
    if (searchInput) {
      searchInput.disabled = !enabled;
    }
    
    // Select all checkbox - enabled when folder is selected
    const selectAllCheckbox = this.shadowRoot.querySelector('#selectAllCheckbox');
    if (selectAllCheckbox) {
      selectAllCheckbox.disabled = !enabled;
    }
    
    // Compression level input - enabled when folder is selected
    const compressionLevel = this.shadowRoot.querySelector('#compressionLevel');
    if (compressionLevel) {
      compressionLevel.disabled = !enabled;
    }
    
    // Auto-scroll checkbox - enabled when folder is selected
    const autoScrollCheckbox = this.shadowRoot.querySelector('#autoScrollCheckbox');
    if (autoScrollCheckbox) {
      autoScrollCheckbox.disabled = !enabled;
    }
    
    Editor.log('[Tool-Optimize] Controls updated - All controls:', enabled ? 'enabled' : 'disabled');
  },

  formatFileSize(bytes) {
    if (bytes === 0) return '0 KB';
    
    const k = 1024;
    const sizeInKB = (bytes / k).toFixed(2);
    
    return sizeInKB + ' KB';
  },

  toggleSelectAll(isChecked) {
    const tableBody = this.shadowRoot.querySelector('#assetTableBody');
    if (!tableBody) return;
    
    // Get all visible checkboxes in table body
    const checkboxes = tableBody.querySelectorAll('input[type="checkbox"]');
    
    checkboxes.forEach(checkbox => {
      checkbox.checked = isChecked;
    });
    
    Editor.log('[Tool-Optimize] Toggled', checkboxes.length, 'checkboxes to:', isChecked);
    
    // Update selected count
    this.updateSelectedCount();
  },

  updateSelectedCount() {
    const tableBody = this.shadowRoot.querySelector('#assetTableBody');
    if (!tableBody) return;
    
    const checkboxes = tableBody.querySelectorAll('input[type="checkbox"]');
    const checkedCount = Array.from(checkboxes).filter(cb => cb.checked).length;
    
    // Update "Selected" stat
    const selectedStat = this.shadowRoot.querySelector('.stat-item:nth-child(2) .stat-value');
    if (selectedStat) {
      selectedStat.textContent = checkedCount;
    }
    
    // Update select all checkbox state
    const selectAllCheckbox = this.shadowRoot.querySelector('#selectAllCheckbox');
    if (selectAllCheckbox) {
      if (checkedCount === 0) {
        selectAllCheckbox.checked = false;
        selectAllCheckbox.indeterminate = false;
      } else if (checkedCount === checkboxes.length) {
        selectAllCheckbox.checked = true;
        selectAllCheckbox.indeterminate = false;
      } else {
        selectAllCheckbox.checked = false;
        selectAllCheckbox.indeterminate = true;
      }
    }
    
    Editor.log('[Tool-Optimize] Selected count:', checkedCount, '/', checkboxes.length);
  },
  
  showSizeInfo() {
    Editor.log('[Tool-Optimize] Showing size info...');
    
    const overlay = this.shadowRoot.querySelector('#sizeInfoOverlay');
    const tableBody = this.shadowRoot.querySelector('#sizeInfoTableBody');
    const summary = this.shadowRoot.querySelector('#sizeSummary');
    
    if (!overlay || !tableBody) {
      Editor.error('[Tool-Optimize] Size info elements not found!');
      return;
    }
    
    // Analyze all files in folder (not just currentAssets)
    if (!this.currentAssets || this.currentAssets.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="5" style="text-align: center; padding: 40px; color: #6b7280;">
            No folder selected or no assets found
          </td>
        </tr>
      `;
      if (summary) summary.style.display = 'none';
      overlay.classList.add('show');
      return;
    }
    
    // Scan and collect data
    this.collectSizeData();
    
    // Render with default sort (by size before, desc)
    this.renderSizeInfo('sizeBefore', 'desc');
    
    // Setup sort buttons
    this.setupSortButtons();
    
    // Show modal
    overlay.classList.add('show');
  },
  
  collectSizeData() {
    this.logDebug('[Tool-Optimize] Collecting size data...');
    
    // Get all files in folder (including meta, js, etc.)
    const fs = require('fs');
    const path = require('path');
    
    // Group by extension
    const sizeByType = {};
    let totalFiles = 0;
    let totalSize = 0;
    
    // Scan all files in folder recursively
    const scanFolder = (folderPath) => {
      try {
        const items = fs.readdirSync(folderPath);
        
        items.forEach(item => {
          const fullPath = path.join(folderPath, item);
          
          try {
            const stats = fs.statSync(fullPath);
            
            if (stats.isDirectory()) {
              scanFolder(fullPath);
            } else {
              const ext = path.extname(item).toLowerCase() || '.no-ext';
              const size = stats.size;
              
              if (!sizeByType[ext]) {
                sizeByType[ext] = {
                  count: 0,
                  sizeBefore: 0,
                  sizeAfter: 0,
                  files: {} // Track individual files: { path: { before, after } }
                };
              }
              
              sizeByType[ext].count++;
              sizeByType[ext].sizeBefore += size;
              sizeByType[ext].sizeAfter += size; // Will be recalculated from files
              
              // Track individual file
              sizeByType[ext].files[fullPath] = {
                before: size,
                after: size // Will update when optimized
              };
              
              totalFiles++;
              totalSize += size;
            }
          } catch (err) {
            // Skip files we can't read
          }
        });
      } catch (err) {
        Editor.warn('[Tool-Optimize] Cannot scan folder:', err.message);
      }
    };
    
    // Get folder path from selectedFolder
    if (this.selectedFolder && this.selectedFolder.path) {
      const folderPath = this.selectedFolder.path;
      this.logDebug('[Tool-Optimize] Scanning folder: ' + folderPath);
      
      scanFolder(folderPath);
      
      this.logDebug('[Tool-Optimize] Scan complete - Total files: ' + totalFiles);
      this.logDebug('[Tool-Optimize] Total size: ' + (totalSize / 1024 / 1024).toFixed(2) + ' MB');
    } else {
      Editor.warn('[Tool-Optimize] No selected folder found!');
    }
    
    // Store data for sorting
    this.sizeData = {
      byType: sizeByType,
      totalFiles: totalFiles,
      totalSize: totalSize
    };
    
    Editor.log('[Tool-Optimize] Data collected:', Object.keys(sizeByType).length, 'file types');
  },
  
  renderSizeInfo(sortBy = 'sizeBefore', sortOrder = 'desc') {
    const tableBody = this.shadowRoot.querySelector('#sizeInfoTableBody');
    const summary = this.shadowRoot.querySelector('#sizeSummary');
    
    if (!this.sizeData || this.sizeData.totalFiles === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="5" style="text-align: center; padding: 40px; color: #6b7280;">
            No files found in folder
          </td>
        </tr>
      `;
      if (summary) summary.style.display = 'none';
      return;
    }
    
    const { byType: sizeByType, totalFiles, totalSize } = this.sizeData;
    
    // Sort types
    const sortedTypes = Object.keys(sizeByType).sort((a, b) => {
      let compareA, compareB;
      
      if (sortBy === 'sizeBefore') {
        compareA = sizeByType[a].sizeBefore;
        compareB = sizeByType[b].sizeBefore;
      } else if (sortBy === 'sizeAfter') {
        compareA = sizeByType[a].sizeAfter;
        compareB = sizeByType[b].sizeAfter;
      } else if (sortBy === 'distribution') {
        compareA = (sizeByType[a].sizeBefore / totalSize) * 100;
        compareB = (sizeByType[b].sizeBefore / totalSize) * 100;
      }
      
      if (sortOrder === 'desc') {
        return compareB - compareA;
      } else {
        return compareA - compareB;
      }
    });
    
    this.logDebug('[Tool-Optimize] Rendering ' + sortedTypes.length + ' file types, sort: ' + sortBy + ' ' + sortOrder);
    
    // Build table
    tableBody.innerHTML = '';
    
    sortedTypes.forEach(ext => {
      const data = sizeByType[ext];
      const percent = ((data.sizeBefore / totalSize) * 100).toFixed(1);
      const sizeMB = (data.sizeBefore / 1024 / 1024).toFixed(2);
      
      // Size After: show "--" if not optimized yet
      const sizeAfterDisplay = data.sizeAfter === data.sizeBefore ? '--' : (data.sizeAfter / 1024 / 1024).toFixed(2) + ' MB';
      
      // Get icon for file type
      let icon = '📄';
      if (['.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(ext)) icon = '🖼️';
      else if (['.mp3', '.wav', '.ogg'].includes(ext)) icon = '🎵';
      else if (['.mp4', '.webm'].includes(ext)) icon = '🎥';
      else if (['.js'].includes(ext)) icon = '📜';
      else if (['.json', '.meta'].includes(ext)) icon = '📋';
      else if (['.txt', '.md'].includes(ext)) icon = '📝';
      
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>
          <div class="size-type">
            <span>${icon}</span>
            <span>${ext}</span>
          </div>
        </td>
        <td>${data.count}</td>
        <td class="size-value">${sizeMB} MB</td>
        <td class="size-value optimized">${sizeAfterDisplay}</td>
        <td>
          <div class="size-bar-wrapper">
            <div class="size-bar-bg">
              <div class="size-bar-fill" style="width: ${percent}%"></div>
            </div>
            <span class="size-percent">${percent}%</span>
          </div>
        </td>
      `;
      
      tableBody.appendChild(row);
    });
    
    // Update summary
    if (summary) {
      summary.style.display = 'block';
      
      const summaryTotalFiles = this.shadowRoot.querySelector('#summaryTotalFiles');
      const summaryTotalBefore = this.shadowRoot.querySelector('#summaryTotalBefore');
      const summaryTotalAfter = this.shadowRoot.querySelector('#summaryTotalAfter');
      
      if (summaryTotalFiles) summaryTotalFiles.textContent = totalFiles;
      if (summaryTotalBefore) summaryTotalBefore.textContent = (totalSize / 1024 / 1024).toFixed(2) + ' MB';
      
      // Calculate total size after (only count optimized files)
      let totalSizeAfter = 0;
      let hasOptimized = false;
      
      Object.keys(sizeByType).forEach(ext => {
        const data = sizeByType[ext];
        if (data.sizeAfter !== data.sizeBefore) {
          hasOptimized = true;
        }
        totalSizeAfter += data.sizeAfter;
      });
      
      // Show "--" if nothing has been optimized yet
      if (summaryTotalAfter) {
        if (!hasOptimized) {
          summaryTotalAfter.textContent = '--';
        } else {
          summaryTotalAfter.textContent = (totalSizeAfter / 1024 / 1024).toFixed(2) + ' MB';
        }
      }
    }
    
    Editor.log('[Tool-Optimize] Size info rendered:', sortedTypes.length, 'file types');
  },
  
  setupSortButtons() {
    const sortSizeBefore = this.shadowRoot.querySelector('#sortSizeBefore');
    const sortSizeAfter = this.shadowRoot.querySelector('#sortSizeAfter');
    const sortDistribution = this.shadowRoot.querySelector('#sortDistribution');
    
    // Store current sort state
    if (!this.sortState) {
      this.sortState = {
        by: 'sizeBefore',
        order: 'desc'
      };
    }
    
    // Update button states
    const updateButtonStates = () => {
      [sortSizeBefore, sortSizeAfter, sortDistribution].forEach(btn => {
        if (btn) {
          btn.classList.remove('active', 'asc', 'desc');
        }
      });
      
      let activeBtn;
      if (this.sortState.by === 'sizeBefore') activeBtn = sortSizeBefore;
      else if (this.sortState.by === 'sizeAfter') activeBtn = sortSizeAfter;
      else if (this.sortState.by === 'distribution') activeBtn = sortDistribution;
      
      if (activeBtn) {
        activeBtn.classList.add('active', this.sortState.order);
      }
    };
    
    // Sort button click handler
    const handleSort = (sortBy) => {
      if (this.sortState.by === sortBy) {
        // Toggle order
        this.sortState.order = this.sortState.order === 'desc' ? 'asc' : 'desc';
      } else {
        // New sort column, default to desc
        this.sortState.by = sortBy;
        this.sortState.order = 'desc';
      }
      
      Editor.log('[Tool-Optimize] Sorting by:', this.sortState.by, this.sortState.order);
      
      // Re-render with new sort
      this.renderSizeInfo(this.sortState.by, this.sortState.order);
      
      // Update button states
      updateButtonStates();
    };
    
    // Attach event listeners
    if (sortSizeBefore) {
      sortSizeBefore.addEventListener('click', () => handleSort('sizeBefore'));
    }
    
    if (sortSizeAfter) {
      sortSizeAfter.addEventListener('click', () => handleSort('sizeAfter'));
    }
    
    if (sortDistribution) {
      sortDistribution.addEventListener('click', () => handleSort('distribution'));
    }
    
    // Set initial button states
    updateButtonStates();
    
    Editor.log('[Tool-Optimize] Sort buttons setup complete');
  },

  messages: {
    'tool-optimize:hello'(event) {
      Editor.log('[Tool-Optimize] Hello from tool-optimize!');
    },
    
    'tool-optimize:asset-progress'(event, data) {
      // Update individual asset progress
      const tableBody = this.shadowRoot.querySelector('#assetTableBody');
      if (!tableBody) {
        Editor.warn('[Tool-Optimize] Table body not found!');
        return;
      }
      
      const row = tableBody.querySelector(`tr[data-uuid="${data.uuid}"]`);
      if (!row) {
        Editor.warn('[Tool-Optimize] Row not found for UUID:', data.uuid);
        return;
      }
      
      const progressBar = row.querySelector('.progress-bar');
      const statusIcon = row.querySelector('.status-icon');
      const newSizeCell = row.querySelector('td:nth-child(5)');
      
      this.logDebug(`[Tool-Optimize] Updating asset progress: ${data.status}`);
      
      // Auto-scroll to current row if enabled
      if (this.autoScrollEnabled && data.status === 'processing') {
        // Scroll row into view with smooth animation
        row.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'center',
          inline: 'nearest'
        });
        
        // Add highlight animation
        row.style.transition = 'background-color 0.3s';
        row.style.backgroundColor = 'rgba(19, 91, 236, 0.2)';
        
        // Remove highlight after animation
        setTimeout(() => {
          row.style.backgroundColor = '';
        }, 1000);
      }
      
      if (data.status === 'processing') {
        if (progressBar) {
          progressBar.style.width = '50%';
          progressBar.className = 'progress-bar primary';
        }
        if (statusIcon) {
          statusIcon.textContent = '⚙️';
          statusIcon.className = 'status-icon primary spin';
        }
      } else if (data.status === 'success') {
        if (progressBar) {
          progressBar.style.width = '100%';
          progressBar.className = 'progress-bar success';
        }
        if (statusIcon) {
          statusIcon.textContent = '✓';
          statusIcon.className = 'status-icon success';
        }
        if (newSizeCell && data.newSize) {
          const newSizeKB = (data.newSize / 1024).toFixed(2);
          newSizeCell.textContent = newSizeKB + ' KB';
          this.logDebug(`[Tool-Optimize] Updated new size: ${newSizeKB} KB`);
        }
        
        // Track optimized file for Size Info update
        if (data.originalSize && data.newSize && this.sizeData) {
          // Find asset to get file path
          const asset = this.currentAssets.find(a => a.uuid === data.uuid);
          if (asset && asset.path) {
            const path = require('path');
            const ext = path.extname(asset.path).toLowerCase();
            
            // Update individual file tracking
            if (this.sizeData.byType[ext]) {
              // Find file in tracking (path might be different format)
              const fileKey = Object.keys(this.sizeData.byType[ext].files).find(key => {
                return key === asset.path || key.endsWith(path.basename(asset.path));
              });
              
              if (fileKey) {
                this.sizeData.byType[ext].files[fileKey].after = data.newSize;
                
                // Recalculate total sizeAfter for this extension
                let totalAfter = 0;
                Object.values(this.sizeData.byType[ext].files).forEach(file => {
                  totalAfter += file.after;
                });
                this.sizeData.byType[ext].sizeAfter = totalAfter;
                
                const sizeDiff = data.originalSize - data.newSize;
                this.logDebug(`[Tool-Optimize] Updated size data for ${ext}: saved ${(sizeDiff / 1024).toFixed(2)} KB`);
              } else {
                this.logDebug(`[Tool-Optimize] Warning: File not found in tracking: ${asset.path}`);
              }
            }
          }
        }
      } else if (data.status === 'error') {
        if (progressBar) {
          progressBar.style.width = '100%';
          progressBar.className = 'progress-bar error';
        }
        if (statusIcon) {
          statusIcon.textContent = '✗';
          statusIcon.className = 'status-icon error';
        }
      } else if (data.status === 'skipped') {
        if (progressBar) {
          progressBar.style.width = '100%';
          progressBar.className = 'progress-bar warning';
        }
        if (statusIcon) {
          statusIcon.textContent = '⊘';
          statusIcon.className = 'status-icon pending';
        }
      }
    },
    
    'tool-optimize:overall-progress'(event, data) {
      // Update overall progress
      const progressFill = this.shadowRoot.querySelector('.progress-fill');
      const progressLabel = this.shadowRoot.querySelector('.progress-label');
      
      if (progressFill) {
        progressFill.style.width = data.progress + '%';
      }
      
      if (progressLabel) {
        progressLabel.textContent = `Overall Progress (${data.progress}%) - ${data.completed}/${data.total}`;
      }
      
      // Update stats
      const sizeAfterStat = this.shadowRoot.querySelector('.stat-item:nth-child(4) .stat-value');
      const savingsStat = this.shadowRoot.querySelector('.stat-item:nth-child(5) .stat-value');
      
      if (sizeAfterStat && data.totalNewSize) {
        const sizeMB = (data.totalNewSize / 1024 / 1024).toFixed(2);
        sizeAfterStat.textContent = this.formatNumber(sizeMB) + ' MB';
      }
      
      if (savingsStat && data.savings) {
        const savedMB = ((data.totalOriginalSize - data.totalNewSize) / 1024 / 1024).toFixed(2);
        savingsStat.textContent = `${data.savings}% (${this.formatNumber(savedMB)} MB)`;
      }
      
      // If complete, re-enable optimize button
      if (data.completed === data.total) {
        const optimizeBtn = this.shadowRoot.querySelector('#optimizeBtn');
        if (optimizeBtn) {
          optimizeBtn.disabled = false;
          optimizeBtn.innerHTML = '<span>⚡</span><span>Start Optimization</span>';
        }
        
        Editor.log('[Tool-Optimize] ✓ Optimization complete!');
        
        // Refresh Size Info modal if it's open
        const sizeInfoOverlay = this.shadowRoot.querySelector('#sizeInfoOverlay');
        if (sizeInfoOverlay && sizeInfoOverlay.classList.contains('show')) {
          Editor.log('[Tool-Optimize] Refreshing Size Info modal...');
          this.renderSizeInfo(this.sortState.by, this.sortState.order);
          this.setupSortButtons();
        }
        
        // Show completion dialog
        const successMsg = data.successCount > 0 ? `✓ Success: ${data.successCount}` : '';
        const errorMsg = data.errorCount > 0 ? `✗ Error: ${data.errorCount}` : '';
        const skippedMsg = data.skippedCount > 0 ? `⊘ Skipped: ${data.skippedCount}` : '';
        const stats = [successMsg, errorMsg, skippedMsg].filter(s => s).join('\n');
        
        Editor.Dialog.messageBox({
          type: 'info',
          buttons: ['OK'],
          title: 'Optimization Complete',
          message: `Completed ${data.completed} assets!\n\n${stats}\n\nOriginal: ${(data.totalOriginalSize / 1024 / 1024).toFixed(2)} MB\nNew: ${(data.totalNewSize / 1024 / 1024).toFixed(2)} MB\nSaved: ${data.savings}% (${((data.totalOriginalSize - data.totalNewSize) / 1024 / 1024).toFixed(2)} MB)`,
          defaultId: 0
        });
      }
    }
  }
});
