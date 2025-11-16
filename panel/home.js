(function() {
    // Drop zone handlers
    const dropZone = document.getElementById('dropZone');
    
    if (dropZone) {
        dropZone.addEventListener('click', () => {
            console.log('Drop zone clicked - open folder dialog');
        });
        
        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.style.borderColor = '#135bec';
            dropZone.style.background = 'rgba(19, 91, 236, 0.1)';
        });
        
        dropZone.addEventListener('dragleave', () => {
            dropZone.style.borderColor = 'rgba(107, 114, 128, 0.5)';
            dropZone.style.background = 'rgba(17, 19, 24, 0.2)';
        });
        
        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.style.borderColor = 'rgba(107, 114, 128, 0.5)';
            dropZone.style.background = 'rgba(17, 19, 24, 0.2)';
            console.log('Files dropped:', e.dataTransfer.files);
        });
    }
    
    // Filter tabs
    const filterTabs = document.querySelectorAll('.filter-tab');
    filterTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            filterTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            
            const filter = tab.dataset.filter;
            console.log('Filter changed to:', filter);
        });
    });
    
    // Optimize button
    const optimizeBtn = document.getElementById('optimizeBtn');
    if (optimizeBtn) {
        optimizeBtn.addEventListener('click', () => {
            console.log('Optimize all files clicked');
        });
    }
})();
