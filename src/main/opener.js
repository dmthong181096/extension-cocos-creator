const { dialog } = require('electron');
const Fs = require('fs');
const Path = require('path');
const EditorAdapter = require('../common/editor-adapter');
const { print, translate } = require('../eazax/editor-main-util');
const MainEvent = require('../eazax/main-event');
const PanelManager = require('./panel-manager');

/**
 * 资源检索器
 */
const Opener = {

    /**
     * 编辑器选择
     * @param {'asset' | 'node'} type 
     * @param {string[]} uuids 
     */
    async identifySelection(type, uuids) {
        if (type === 'asset') {         // 选中资源
            Opener.identifyByUuids(uuids);
        } else if (type === 'node') {   // 选中节点
            const skeletonUuid = await Opener.querySkeletonOnNode(uuids[0]);
            if (skeletonUuid) {
                Opener.identifyByUuids([skeletonUuid]);
            } else {
                Opener.updateView(null);
            }
        } else {
            Opener.updateView(null);
        }
    },

    /**
     * 检查编辑器当前选中
     */
    checkEditorCurSelection() {
        const type = EditorAdapter.Selection.getSelectedType(),
            uuids = EditorAdapter.Selection.getSelected(type);
        if (type && uuids && uuids.length > 0) {
            Opener.identifySelection(type, uuids);
        } else {
            Opener.updateView(null);
        }
    },

    /**
     * 查找节点上引用的骨骼资源
     * @param {string} nodeUuid 
     * @returns {Promise<string>} 
     */
    async querySkeletonOnNode(nodeUuid) {
        const node = await Editor.Message.request('scene', 'query-node', nodeUuid);
        if (node && node['__comps__']) {
            const components = node['__comps__'];
            for (let i = 0; i < components.length; i++) {
                if (components[i].type === 'sp.Skeleton') {
                    const uuid = components[i].value.skeletonData.value.uuid;
                    return (uuid !== '' ? uuid : null);
                }
            }
        }
        return null;
    },

    /**
     * 选择本地文件
     */
    async selectLocalFiles() {
        // 弹窗选择文件
        const result = await dialog.showOpenDialog({
            filters: [{
                name: translate('skeletonAssets'),
                extensions: ['json', 'skel', 'png', 'atlas'],
            }],
            properties: ['openFile', 'multiSelections'],
            message: translate('selectAssets'),
        });
        // 取消
        if (!result || result.canceled) {
            return;
        }
        // 识别选择的文件路径（兼容不同版本的 Electron）
        const paths = result.filePaths || result;
        Opener.identifyByPaths(paths);
    },

    /**
     * 通过 uuid 识别资源
     * @param {string[]} uuids 
     */
    async identifyByUuids(uuids) {
        console.log('[SKELETON-VIEWER-DEBUG] identifyByUuids called with uuids:', uuids);
        // 资源路径
        let skeletonPath, texturePath, atlasPath;
        // 遍历选中的资源 uuid
        for (let i = 0; i < uuids.length; i++) {
            const assetInfo = await EditorAdapter.getAssetInfoByUuid(uuids[i]),
                { type, file } = assetInfo;
            console.log('[DEBUG] Asset info for uuid', uuids[i], ':', { type, file });
            if (type === 'sp.SkeletonData') {
                skeletonPath = file;   // 骨骼资源
            } else if (type === 'cc.ImageAsset') {
                texturePath = file; // 纹理资源
            } else if (file.endsWith('.atlas') || file.endsWith('.txt')) {
                atlasPath = file;   // 图集资源
            }
            // 只识别一套资源
            if (skeletonPath && texturePath && atlasPath) {
                break;
            }
        }
        console.log('[DEBUG] Final paths - skeleton:', skeletonPath, 'texture:', texturePath, 'atlas:', atlasPath);
        // 未选中骨骼资源
        // if (!skeletonPath) {
        //     return;
        // }
        // 无效
        if (!skeletonPath && !texturePath && !atlasPath) {
            Opener.updateView(null);
            return;
        }
        // 处理路径
        const paths = { skeletonPath, texturePath, atlasPath };
        const assets = Opener.collectAssets(paths);
        Opener.updateView(assets);
    },

    /**
     * 通过路径识别资源
     * @param {string[]} paths 
     */
    identifyByPaths(paths) {
        // 资源路径
        let skeletonPath, texturePath, atlasPath;
        // 遍历选中的文件路径
        for (let i = 0; i < paths.length; i++) {
            const path = paths[i],
                extname = Path.extname(path);
            switch (extname) {
                case '.json':
                case '.skel': {
                    skeletonPath = path;
                    break;
                }
                case '.png': {
                    texturePath = path;
                    break;
                }
                case '.atlas':
                case '.txt': {
                    atlasPath = path;
                    break;
                }
            }
            // 只识别一套资源
            if (skeletonPath && texturePath && atlasPath) {
                break;
            }
        }
        // 未选中骨骼资源
        // if (!skeletonPath) {
        //     print('warn', translate('noSkeleton'));
        //     return;
        // }
        // 无效
        if (!skeletonPath && !texturePath && !atlasPath) {
            // print('warn', translate('noSkeleton'));
            return;
        }
        // 处理路径
        paths = { skeletonPath, texturePath, atlasPath };
        const assets = Opener.collectAssets(paths);
        Opener.updateView(assets);
    },

    /**
     * 收集资源
     * @param {{ skeletonPath: string, texturePath: string, atlasPath: string }} paths 资源路径
     */
    collectAssets(paths) {
        console.log('[DEBUG] collectAssets called with paths:', paths);
        let { skeletonPath, texturePath, atlasPath } = paths;
        const testPath = skeletonPath || texturePath || atlasPath;
        console.log('[DEBUG] testPath:', testPath);
        // 骨骼资源
        if (!skeletonPath) {
            // 暴力查找
            skeletonPath = Opener.getRelatedFile(testPath, 'json');
            // 还没有的话再试试 skel 格式
            if (!skeletonPath) {
                skeletonPath = Opener.getRelatedFile(testPath, 'skel');
            }
            // 找不到骨骼啊
            if (!skeletonPath) {
                // print('warn', translate('noSkeleton'));
                return null;
            }
        }
        // 图集资源
        if (!atlasPath) {
            console.log('[DEBUG] Looking for atlas file...');
            // 暴力查找
            atlasPath = Opener.getRelatedFile(testPath, 'atlas');
            console.log('[DEBUG] Atlas search result (.atlas):', atlasPath);
            // 还没有的话再试试 txt 格式
            if (!atlasPath) {
                atlasPath = Opener.getRelatedFile(testPath, 'txt');
                console.log('[DEBUG] Atlas search result (.txt):', atlasPath);
            }
            // 还没有的话再试试 atlas.txt 格式
            if (!atlasPath) {
                atlasPath = Opener.getRelatedFile(testPath, 'atlas.txt');
                console.log('[DEBUG] Atlas search result (.atlas.txt):', atlasPath);
            }
            // 找不到图集啊
            if (!atlasPath) {
                console.log('[DEBUG] No atlas file found');
                print('warn', translate('noAtlas'));
                return null;
            }
        }
        // 纹理资源 - 优先从atlas文件中读取texture文件名
        let textureFiles = [];
        console.log('[DEBUG] collectAssets - texturePath:', texturePath, 'atlasPath:', atlasPath);
        if (!texturePath) {
            // 尝试从atlas文件中解析texture文件名
            const texturesFromAtlas = Opener.getTexturesFromAtlas(atlasPath);
            console.log('[DEBUG] texturesFromAtlas:', texturesFromAtlas);
            if (texturesFromAtlas && texturesFromAtlas.length > 0) {
                // 查找所有存在的texture文件
                const dirPath = Path.dirname(atlasPath);
                console.log('[DEBUG] Looking for textures in directory:', dirPath);
                for (let textureName of texturesFromAtlas) {
                    const fullTexturePath = Path.join(dirPath, textureName);
                    console.log('[DEBUG] Checking texture path:', fullTexturePath);
                    if (Fs.existsSync(fullTexturePath)) {
                        textureFiles.push(fullTexturePath);
                        console.log('[DEBUG] Found existing texture:', fullTexturePath);
                    } else {
                        console.log('[DEBUG] Texture file not found:', fullTexturePath);
                    }
                }
                // 设置第一个找到的作为主texture
                if (textureFiles.length > 0) {
                    texturePath = textureFiles[0];
                    console.log('[DEBUG] Set main texture to:', texturePath);
                }
            }
            // 如果atlas中没找到，则使用原来的暴力查找方法
            if (!texturePath) {
                console.log('[DEBUG] Falling back to getRelatedFile method');
                texturePath = Opener.getRelatedFile(testPath, 'png');
                if (texturePath) {
                    textureFiles = [texturePath];
                    console.log('[DEBUG] Found texture via getRelatedFile:', texturePath);
                }
            }
            // 找不到纹理啊
            if (!texturePath) {
                console.log('[DEBUG] No texture found, returning null');
                print('warn', translate('noTexture'));
                return null;
            }
        } else {
            textureFiles = [texturePath];
            console.log('[DEBUG] Using provided texture path:', texturePath);
        }
        // 文件类型（json 或 skel）
        const skeletonType = Path.extname(skeletonPath);
        // 打包资源信息
        const assets = {
            // 目录路径
            dir: undefined,
            // 骨骼数据（JSON）
            json: (skeletonType === '.json') ? skeletonPath : undefined,
            // 骨骼数据（二进制）
            skel: (skeletonType === '.skel') ? skeletonPath : undefined,
            // 纹理 (主纹理，向后兼容)
            png: texturePath,
            // 所有纹理文件
            textures: textureFiles,
            // 图集
            atlas: atlasPath,
        };
        return assets;
    },

    /**
     * 查找相关联的文件路径
     * @param {string} filePath 文件路径
     * @param {string} relatedExt 关联文件的扩展名
     * @returns {string}
     */
    getRelatedFile(filePath, relatedExt) {
        const dirPath = Path.join(Path.dirname(filePath), Path.sep),
            basename = Path.basename(filePath, Path.extname(filePath)).replace(/(-pro|-ess|-pma)/, ''),
            basePath = Path.join(dirPath, basename),
            testList = [
                `${basePath}.${relatedExt}`,
                `${basePath}-pma.${relatedExt}`,
                `${basePath}-pro.${relatedExt}`,
                `${basePath}-ess.${relatedExt}`
            ];
        console.log('[DEBUG] getRelatedFile - looking for', relatedExt, 'files in:', dirPath);
        console.log('[DEBUG] basename:', basename, 'testList:', testList);
        for (let i = 0; i < testList.length; i++) {
            console.log('[DEBUG] Checking file existence:', testList[i]);
            if (Fs.existsSync(testList[i])) {
                console.log('[DEBUG] Found file:', testList[i]);
                return testList[i];
            }
        }
        console.log('[DEBUG] No related file found for extension:', relatedExt);
        return null;
    },

    /**
     * 从atlas文件中解析texture文件名
     * @param {string} atlasPath atlas文件路径
     * @returns {string[]} texture文件名数组
     */
    getTexturesFromAtlas(atlasPath) {
        console.log('[DEBUG] getTexturesFromAtlas called with:', atlasPath);
        if (!atlasPath || !Fs.existsSync(atlasPath)) {
            console.log('[DEBUG] Atlas file not found or path is null');
            return [];
        }
        
        try {
            const atlasContent = Fs.readFileSync(atlasPath, 'utf8');
            const lines = atlasContent.split('\n');
            const textureFiles = [];
            
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();
                // 跳过空行和注释
                if (!line || line.startsWith('#')) {
                    continue;
                }
                
                // 检查是否是texture文件名（通常以.png结尾且不包含冒号）
                if (line.endsWith('.png') && !line.includes(':')) {
                    textureFiles.push(line);
                    console.log('[DEBUG] Found texture file:', line);
                }
                // 也支持其他图片格式
                else if ((line.endsWith('.jpg') || line.endsWith('.jpeg') || line.endsWith('.webp')) && !line.includes(':')) {
                    textureFiles.push(line);
                    console.log('[DEBUG] Found texture file:', line);
                }
            }
            
            console.log('[DEBUG] Total texture files found:', textureFiles);
            return textureFiles;
        } catch (error) {
            console.error('Error reading atlas file:', error);
            return [];
        }
    },

    /**
     * 更新视图
     * @param {{ dir: string, json: string, atlas: string, png: string } | null} assets 
     */
    updateView(assets) {
        const webContents = PanelManager.getViewPanelWebContents();
        if (webContents) {
            MainEvent.send(webContents, 'assets-selected', assets);
        }
    },

};

module.exports = Opener;
