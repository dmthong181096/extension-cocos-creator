// @ts-ignore
import { readFileSync } from 'fs-extra';
import { join } from 'path';

interface AssetInfo {
    uuid: string;
    path: string;
    name: string;
    type: string;
    size: number;
}

interface ScanResult {
    allAssets: AssetInfo[];
    unusedAssets: AssetInfo[];
    usedUUIDs: Set<string>;
}

let currentResult: ScanResult | null = null;
let selectedUUIDs = new Set<string>();

module.exports = Editor.Panel.define({
    listeners: {
        show() {
            console.log('[remove-unused-asset] Panel shown');
        },
        hide() {
            console.log('[remove-unused-asset] Panel hidden');
        },
    },
    template: readFileSync(join(__dirname, '../../../static/template/default/index.html'), 'utf-8'),
    style: readFileSync(join(__dirname, '../../../static/style/default/index.css'), 'utf-8'),
    $: {
        dropZone: '#dropZone',
        folderInput: '#folderInput',
        selectedFolder: '#selectedFolder',
        folderPath: '#folderPath',
        clearBtn: '#clearBtn',
        scanSection: '#scanSection',
        scanBtn: '#scanBtn',
        loading: '#loading',
        results: '#results',
        totalAssets: '#totalAssets',
        unusedAssets: '#unusedAssets',
        totalSize: '#totalSize',
        selectAllBtn: '#selectAllBtn',
        deselectAllBtn: '#deselectAllBtn',
        deleteBtn: '#deleteBtn',
        assetListBody: '#assetListBody',
        headerCheckbox: '#headerCheckbox',
    },
    methods: {
        setupEventListeners() {
            const self = this;

            this.$.dropZone.addEventListener('click', () => {
                this.$.folderInput.click();
            });

            this.$.folderInput.addEventListener('change', (e: any) => {
                const files = e.target.files;
                if (files && files.length > 0) {
                    const folderPath = files[0].webkitRelativePath.split('/')[0];
                    const fullPath = files[0].path.replace(folderPath, '').slice(0, -1);
                    this.showSelectedFolder(fullPath);
                }
            });

            this.$.dropZone.addEventListener('dragover', (e: DragEvent) => {
                e.preventDefault();
                this.$.dropZone.classList.add('drag-over');
            });

            this.$.dropZone.addEventListener('dragleave', () => {
                this.$.dropZone.classList.remove('drag-over');
            });

            this.$.dropZone.addEventListener('drop', async (e: DragEvent) => {
                e.preventDefault();
                this.$.dropZone.classList.remove('drag-over');
                
                if (e.dataTransfer && e.dataTransfer.files.length > 0) {
                    const file = e.dataTransfer.files[0];
                    // @ts-ignore
                    this.showSelectedFolder(file.path);
                }
            });

            this.$.clearBtn.addEventListener('click', () => {
                this.resetUI();
            });

            this.$.scanBtn.addEventListener('click', async () => {
                await this.startScan();
            });

            this.$.selectAllBtn.addEventListener('click', () => {
                this.selectAll(true);
            });

            this.$.deselectAllBtn.addEventListener('click', () => {
                this.selectAll(false);
            });

            this.$.deleteBtn.addEventListener('click', async () => {
                await this.deleteSelected();
            });

            this.$.headerCheckbox.addEventListener('change', (e: any) => {
                this.selectAll(e.target.checked);
            });
        },

        showSelectedFolder(path: string) {
            this.$.dropZone.style.display = 'none';
            this.$.selectedFolder.style.display = 'flex';
            this.$.scanSection.style.display = 'flex';
            this.$.folderPath.textContent = path;
            (this.$.folderInput as any).dataset.path = path;
        },

        resetUI() {
            this.$.dropZone.style.display = 'block';
            this.$.selectedFolder.style.display = 'none';
            this.$.scanSection.style.display = 'none';
            this.$.loading.style.display = 'none';
            this.$.results.style.display = 'none';
            this.$.folderInput.value = '';
            currentResult = null;
            selectedUUIDs.clear();
        },

        async startScan() {
            const folderPath = (this.$.folderInput as any).dataset.path;
            if (!folderPath) return;

            this.$.scanSection.style.display = 'none';
            this.$.loading.style.display = 'flex';
            this.$.results.style.display = 'none';

            try {
                const result = await Editor.Message.request('remove-unused-asset', 'scan-assets', folderPath);
                currentResult = result;
                this.showResults(result);
            } catch (error) {
                console.error('[remove-unused-asset] Scan failed:', error);
                alert('Scan failed: ' + error);
                this.$.loading.style.display = 'none';
                this.$.scanSection.style.display = 'flex';
            }
        },

        showResults(result: ScanResult) {
            this.$.loading.style.display = 'none';
            this.$.results.style.display = 'flex';

            this.$.totalAssets.textContent = result.allAssets.length.toString();
            this.$.unusedAssets.textContent = result.unusedAssets.length.toString();
            
            const totalSize = result.unusedAssets.reduce((sum, asset) => sum + asset.size, 0);
            this.$.totalSize.textContent = this.formatSize(totalSize);

            this.renderAssetList(result.unusedAssets);
            this.updateDeleteButton();
        },

        renderAssetList(assets: AssetInfo[]) {
            this.$.assetListBody.innerHTML = '';
            selectedUUIDs.clear();

            assets.forEach((asset, index) => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td class="col-check">
                        <input type="checkbox" class="asset-checkbox" data-uuid="${asset.uuid}">
                    </td>
                    <td class="col-name">${this.escapeHtml(asset.name)}</td>
                    <td class="col-type">${this.escapeHtml(asset.type)}</td>
                    <td class="col-size">${this.formatSize(asset.size)}</td>
                    <td class="col-path">${this.escapeHtml(asset.path)}</td>
                `;
                
                const checkbox = tr.querySelector('.asset-checkbox') as HTMLInputElement;
                checkbox.addEventListener('change', (e: any) => {
                    if (e.target.checked) {
                        selectedUUIDs.add(asset.uuid);
                    } else {
                        selectedUUIDs.delete(asset.uuid);
                    }
                    this.updateHeaderCheckbox();
                    this.updateDeleteButton();
                });

                this.$.assetListBody.appendChild(tr);
            });
        },

        selectAll(select: boolean) {
            const checkboxes = this.$.assetListBody.querySelectorAll('.asset-checkbox') as NodeListOf<HTMLInputElement>;
            checkboxes.forEach(checkbox => {
                checkbox.checked = select;
                const uuid = checkbox.dataset.uuid;
                if (uuid) {
                    if (select) {
                        selectedUUIDs.add(uuid);
                    } else {
                        selectedUUIDs.delete(uuid);
                    }
                }
            });
            this.$.headerCheckbox.checked = select;
            this.updateDeleteButton();
        },

        updateHeaderCheckbox() {
            const checkboxes = this.$.assetListBody.querySelectorAll('.asset-checkbox') as NodeListOf<HTMLInputElement>;
            const allChecked = Array.from(checkboxes).every(cb => cb.checked);
            const someChecked = Array.from(checkboxes).some(cb => cb.checked);
            this.$.headerCheckbox.checked = allChecked;
            this.$.headerCheckbox.indeterminate = someChecked && !allChecked;
        },

        updateDeleteButton() {
            this.$.deleteBtn.disabled = selectedUUIDs.size === 0;
            if (selectedUUIDs.size > 0) {
                this.$.deleteBtn.textContent = `Delete Selected (${selectedUUIDs.size})`;
            } else {
                this.$.deleteBtn.textContent = 'Delete Selected';
            }
        },

        async deleteSelected() {
            if (selectedUUIDs.size === 0) return;

            const confirmed = confirm(`Are you sure you want to delete ${selectedUUIDs.size} assets? This action cannot be undone.`);
            if (!confirmed) return;

            this.$.deleteBtn.disabled = true;
            this.$.deleteBtn.textContent = 'Deleting...';

            try {
                const result = await Editor.Message.request('remove-unused-asset', 'delete-assets', Array.from(selectedUUIDs));
                
                alert(`Deleted ${result.success} assets successfully. ${result.failed > 0 ? result.failed + ' failed.' : ''}`);
                
                if (currentResult) {
                    currentResult.unusedAssets = currentResult.unusedAssets.filter(asset => !selectedUUIDs.has(asset.uuid));
                    this.showResults(currentResult);
                }
            } catch (error) {
                console.error('[remove-unused-asset] Delete failed:', error);
                alert('Delete failed: ' + error);
            }
        },

        formatSize(bytes: number): string {
            if (bytes === 0) return '0 B';
            const k = 1024;
            const sizes = ['B', 'KB', 'MB', 'GB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
        },

        escapeHtml(text: string): string {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }
    },
    ready() {
        this.setupEventListeners();
    },
    beforeClose() {},
    close() {},
});
