// @ts-ignore
import packageJSON from '../package.json';
import * as path from 'path';
import * as fs from 'fs-extra';

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

let scanResult: ScanResult | null = null;

export const methods: { [key: string]: (...any: any) => any } = {
    openPanel() {
        Editor.Panel.open(packageJSON.name);
    },

    async scanAssets(folderPath: string): Promise<ScanResult> {
        console.log('[remove-unused-asset] Scanning folder:', folderPath);
        
        const allAssets: AssetInfo[] = [];
        const usedUUIDs = new Set<string>();

        try {
            await findAllAssets(folderPath, allAssets);
            await findAllUsedUUIDs(usedUUIDs);

            const unusedAssets = allAssets.filter(asset => !usedUUIDs.has(asset.uuid));

            scanResult = {
                allAssets,
                unusedAssets,
                usedUUIDs
            };

            console.log('[remove-unused-asset] Scan complete:');
            console.log(`  - Total assets: ${allAssets.length}`);
            console.log(`  - Unused assets: ${unusedAssets.length}`);

            return scanResult;
        } catch (error) {
            console.error('[remove-unused-asset] Scan failed:', error);
            throw error;
        }
    },

    async deleteAssets(uuids: string[]): Promise<{ success: number; failed: number; errors: string[] }> {
        console.log('[remove-unused-asset] Deleting assets:', uuids.length);
        
        const result = { success: 0, failed: 0, errors: [] as string[] };

        for (const uuid of uuids) {
            try {
                await Editor.Message.request('asset-db', 'delete-asset', uuid);
                result.success++;
            } catch (error) {
                result.failed++;
                result.errors.push(`Failed to delete ${uuid}: ${error}`);
                console.error('[remove-unused-asset] Delete failed:', uuid, error);
            }
        }

        return result;
    }
};

async function findAllAssets(folderPath: string, assets: AssetInfo[]): Promise<void> {
    const files = await fs.readdir(folderPath);
    
    for (const file of files) {
        const fullPath = path.join(folderPath, file);
        const stat = await fs.stat(fullPath);

        if (stat.isDirectory()) {
            await findAllAssets(fullPath, assets);
        } else if (!file.endsWith('.meta')) {
            const metaPath = fullPath + '.meta';
            if (await fs.pathExists(metaPath)) {
                const metaContent = await fs.readJson(metaPath);
                const assetInfo = await getAssetInfoByPath(fullPath);
                
                if (assetInfo) {
                    assets.push(assetInfo);
                }
            }
        }
    }
}

async function getAssetInfoByPath(filePath: string): Promise<AssetInfo | null> {
    try {
        const projectPath = Editor.Project.path;
        const relativePath = path.relative(projectPath, filePath).replace(/\\/g, '/');
        const dbPath = 'db://' + relativePath;
        
        const assetInfo = await Editor.Message.request('asset-db', 'query-asset-info', dbPath);
        
        if (assetInfo) {
            const stat = await fs.stat(filePath);
            return {
                uuid: assetInfo.uuid,
                path: dbPath,
                name: path.basename(filePath),
                type: assetInfo.type || 'unknown',
                size: stat.size
            };
        }
    } catch (error) {
        console.error('[remove-unused-asset] Failed to get asset info:', filePath, error);
    }
    return null;
}

async function findAllUsedUUIDs(usedUUIDs: Set<string>): Promise<void> {
    const projectPath = Editor.Project.path;
    const assetsPath = path.join(projectPath, 'assets');
    
    await findUUIDsInPath(assetsPath, usedUUIDs);
}

async function findUUIDsInPath(folderPath: string, usedUUIDs: Set<string>): Promise<void> {
    const files = await fs.readdir(folderPath);
    
    for (const file of files) {
        const fullPath = path.join(folderPath, file);
        const stat = await fs.stat(fullPath);

        if (stat.isDirectory()) {
            await findUUIDsInPath(fullPath, usedUUIDs);
        } else if (file.endsWith('.scene') || file.endsWith('.prefab') || file.endsWith('.anim') || file.endsWith('.material')) {
            await findUUIDsInFile(fullPath, usedUUIDs);
        }
    }
}

async function findUUIDsInFile(filePath: string, usedUUIDs: Set<string>): Promise<void> {
    try {
        const content = await fs.readFile(filePath, 'utf-8');
        const uuidRegex = /"__uuid__"\s*:\s*"([a-f0-9\-]+)"/g;
        let match;
        
        while ((match = uuidRegex.exec(content)) !== null) {
            usedUUIDs.add(match[1]);
        }
        
        const uuidRegex2 = /\b([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})\b/g;
        while ((match = uuidRegex2.exec(content)) !== null) {
            usedUUIDs.add(match[1]);
        }
    } catch (error) {
        console.error('[remove-unused-asset] Failed to read file:', filePath, error);
    }
}

export function load() {}

export function unload() {}
