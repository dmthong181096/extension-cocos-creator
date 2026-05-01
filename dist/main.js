"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.methods = void 0;
exports.load = load;
exports.unload = unload;
// @ts-ignore
const package_json_1 = __importDefault(require("../package.json"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs-extra"));
let scanResult = null;
exports.methods = {
    openPanel() {
        Editor.Panel.open(package_json_1.default.name);
    },
    async scanAssets(folderPath) {
        console.log('[remove-unused-asset] Scanning folder:', folderPath);
        const allAssets = [];
        const usedUUIDs = new Set();
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
        }
        catch (error) {
            console.error('[remove-unused-asset] Scan failed:', error);
            throw error;
        }
    },
    async deleteAssets(uuids) {
        console.log('[remove-unused-asset] Deleting assets:', uuids.length);
        const result = { success: 0, failed: 0, errors: [] };
        for (const uuid of uuids) {
            try {
                await Editor.Message.request('asset-db', 'delete-asset', uuid);
                result.success++;
            }
            catch (error) {
                result.failed++;
                result.errors.push(`Failed to delete ${uuid}: ${error}`);
                console.error('[remove-unused-asset] Delete failed:', uuid, error);
            }
        }
        return result;
    }
};
async function findAllAssets(folderPath, assets) {
    const files = await fs.readdir(folderPath);
    for (const file of files) {
        const fullPath = path.join(folderPath, file);
        const stat = await fs.stat(fullPath);
        if (stat.isDirectory()) {
            await findAllAssets(fullPath, assets);
        }
        else if (!file.endsWith('.meta')) {
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
async function getAssetInfoByPath(filePath) {
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
    }
    catch (error) {
        console.error('[remove-unused-asset] Failed to get asset info:', filePath, error);
    }
    return null;
}
async function findAllUsedUUIDs(usedUUIDs) {
    const projectPath = Editor.Project.path;
    const assetsPath = path.join(projectPath, 'assets');
    await findUUIDsInPath(assetsPath, usedUUIDs);
}
async function findUUIDsInPath(folderPath, usedUUIDs) {
    const files = await fs.readdir(folderPath);
    for (const file of files) {
        const fullPath = path.join(folderPath, file);
        const stat = await fs.stat(fullPath);
        if (stat.isDirectory()) {
            await findUUIDsInPath(fullPath, usedUUIDs);
        }
        else if (file.endsWith('.scene') || file.endsWith('.prefab') || file.endsWith('.anim') || file.endsWith('.material')) {
            await findUUIDsInFile(fullPath, usedUUIDs);
        }
    }
}
async function findUUIDsInFile(filePath, usedUUIDs) {
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
    }
    catch (error) {
        console.error('[remove-unused-asset] Failed to read file:', filePath, error);
    }
}
function load() { }
function unload() { }
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpbi5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uL3NvdXJjZS9tYWluLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQW1LQSxvQkFBeUI7QUFFekIsd0JBQTJCO0FBckszQixhQUFhO0FBQ2IsbUVBQTBDO0FBQzFDLDJDQUE2QjtBQUM3Qiw2Q0FBK0I7QUFnQi9CLElBQUksVUFBVSxHQUFzQixJQUFJLENBQUM7QUFFNUIsUUFBQSxPQUFPLEdBQTRDO0lBQzVELFNBQVM7UUFDTCxNQUFNLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxzQkFBVyxDQUFDLElBQUksQ0FBQyxDQUFDO0lBQ3hDLENBQUM7SUFFRCxLQUFLLENBQUMsVUFBVSxDQUFDLFVBQWtCO1FBQy9CLE9BQU8sQ0FBQyxHQUFHLENBQUMsd0NBQXdDLEVBQUUsVUFBVSxDQUFDLENBQUM7UUFFbEUsTUFBTSxTQUFTLEdBQWdCLEVBQUUsQ0FBQztRQUNsQyxNQUFNLFNBQVMsR0FBRyxJQUFJLEdBQUcsRUFBVSxDQUFDO1FBRXBDLElBQUksQ0FBQztZQUNELE1BQU0sYUFBYSxDQUFDLFVBQVUsRUFBRSxTQUFTLENBQUMsQ0FBQztZQUMzQyxNQUFNLGdCQUFnQixDQUFDLFNBQVMsQ0FBQyxDQUFDO1lBRWxDLE1BQU0sWUFBWSxHQUFHLFNBQVMsQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7WUFFM0UsVUFBVSxHQUFHO2dCQUNULFNBQVM7Z0JBQ1QsWUFBWTtnQkFDWixTQUFTO2FBQ1osQ0FBQztZQUVGLE9BQU8sQ0FBQyxHQUFHLENBQUMsc0NBQXNDLENBQUMsQ0FBQztZQUNwRCxPQUFPLENBQUMsR0FBRyxDQUFDLHFCQUFxQixTQUFTLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQztZQUNyRCxPQUFP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UyxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUM1QixDQUFDO0lBQ0wsQ0FBQztJQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7UUFDYixPQUFPLENBQUMsS0FBSyxDQUFDLDRDQUE0QyxFQUFFLFFBQVEsRUFBRSxLQUFLLENBQUMsQ0FBQztJQUNqRixDQUFDO0FBQ0wsQ0FBQztBQUVELFNBQWdCLElBQUksS0FBSSxDQUFDO0FBRXpCLFNBQWdCLE1BQU0sS0FBSSxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiLy8gQHRzLWlnbm9yZVxuaW1wb3J0IHBhY2thZ2VKU09OIGZyb20gJy4uL3BhY2thZ2UuanNvbic7XG5pbXBvcnQgKiBhcyBwYXRoIGZyb20gJ3BhdGgnO1xuaW1wb3J0ICogYXMgZnMgZnJvbSAnZnMtZXh0cmEnO1xuXG5pbnRlcmZhY2UgQXNzZXRJbmZvIHtcbiAgICB1dWlkOiBzdHJpbmc7XG4gICAgcGF0aDogc3RyaW5nO1xuICAgIG5hbWU6IHN0cmluZztcbiAgICB0eXBlOiBzdHJpbmc7XG4gICAgc2l6ZTogbnVtYmVyO1xufVxuXG5pbnRlcmZhY2UgU2NhblJlc3VsdCB7XG4gICAgYWxsQXNzZXRzOiBBc3NldEluZm9bXTtcbiAgICB1bnVzZWRBc3NldHM6IEFzc2V0SW5mb1tdO1xuICAgIHVzZWRVVUlEczogU2V0PHN0cmluZz47XG59XG5cbmxldCBzY2FuUmVzdWx0OiBTY2FuUmVzdWx0IHwgbnVsbCA9IG51bGw7XG5cbmV4cG9ydCBjb25zdCBtZXRob2RzOiB7IFtrZXk6IHN0cmluZ106ICguLi5hbnk6IGFueSkgPT4gYW55IH0gPSB7XG4gICAgb3BlblBhbmVsKCkge1xuICAgICAgICBFZGl0b3IuUGFuZWwub3BlbihwYWNrYWdlSlNPTi5uYW1lKTtcbiAgICB9LFxuXG4gICAgYXN5bmMgc2NhbkFzc2V0cyhmb2xkZXJQYXRoOiBzdHJpbmcpOiBQcm9taXNlPFNjYW5SZXN1bHQ+IHtcbiAgICAgICAgY29uc29sZS5sb2coJ1tyZW1vdmUtdW51c2VkLWFzc2V0XSBTY2FubmluZyBmb2xkZXI6JywgZm9sZGVyUGF0aCk7XG4gICAgICAgIFxuICAgICAgICBjb25zdCBhbGxBc3NldHM6IEFzc2V0SW5mb1tdID0gW107XG4gICAgICAgIGNvbnN0IHVzZWRVVUlEcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBhd2FpdCBmaW5kQWxsQXNzZXRzKGZvbGRlclBhdGgsIGFsbEFzc2V0cyk7XG4gICAgICAgICAgICBhd2FpdCBmaW5kQWxsVXNlZFVVSURzKHVzZWRVVUlEcyk7XG5cbiAgICAgICAgICAgIGNvbnN0IHVudXNlZEFzc2V0cyA9IGFsbEFzc2V0cy5maWx0ZXIoYXNzZXQgPT4gIXVzZWRVVUlEcy5oYXMoYXNzZXQudXVpZCkpO1xuXG4gICAgICAgICAgICBzY2FuUmVzdWx0ID0ge1xuICAgICAgICAgICAgICAgIGFsbEFzc2V0cyxcbiAgICAgICAgICAgICAgICB1bnVzZWRBc3NldHMsXG4gICAgICAgICAgICAgICAgdXNlZFVVSURzXG4gICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICBjb25zb2xlLmxvZygnW3JlbW92ZS11bnVzZWQtYXNzZXRdIFNjYW4gY29tcGxldGU6Jyk7XG4gICAgICAgICAgICBjb25zb2xlLmxvZyhgICAtIFRvdGFsIGFzc2V0czogJHthbGxBc3NldHMubGVuZ3RofWApO1xuICAgICAgICAgICAgY29uc29sZS5sb2coYCAgLSBVbnVzZWQgYXNzZXRzOiAke3VudXNlZEFzc2V0cy5sZW5ndGh9YCk7XG5cbiAgICAgICAgICAgIHJldHVybiBzY2FuUmVzdWx0O1xuICAgICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICAgICAgY29uc29sZS5lcnJvcignW3JlbW92ZS11bnVzZWQtYXNzZXRdIFNjYW4gZmFpbGVkOicsIGVycm9yKTtcbiAgICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICB9XG4gICAgfSxcblxuICAgIGFzeW5jIGRlbGV0ZUFzc2V0cyh1dWlkczogc3RyaW5nW10pOiBQcm9taXNlPHsgc3VjY2VzczogbnVtYmVyOyBmYWlsZWQ6IG51bWJlcjsgZXJyb3JzOiBzdHJpbmdbXSB9PiB7XG4gICAgICAgIGNvbnNvbGUubG9nKCdbcmVtb3ZlLXVudXNlZC1hc3NldF0gRGVsZXRpbmcgYXNzZXRzOicsIHV1aWRzLmxlbmd0aCk7XG4gICAgICAgIFxuICAgICAgICBjb25zdCByZXN1bHQgPSB7IHN1Y2Nlc3M6IDAsIGZhaWxlZDogMCwgZXJyb3JzOiBbXSBhcyBzdHJpbmdbXSB9O1xuXG4gICAgICAgIGZvciAoY29uc3QgdXVpZCBvZiB1dWlkcykge1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdhc3NldC1kYicsICdkZWxldGUtYXNzZXQnLCB1dWlkKTtcbiAgICAgICAgICAgICAgICByZXN1bHQuc3VjY2VzcysrO1xuICAgICAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgICAgICAgICByZXN1bHQuZmFpbGVkKys7XG4gICAgICAgICAgICAgICAgcmVzdWx0LmVycm9ycy5wdXNoKGBGYWlsZWQgdG8gZGVsZXRlICR7dXVpZH06ICR7ZXJyb3J9YCk7XG4gICAgICAgICAgICAgICAgY29uc29sZS5lcnJvcignW3JlbW92ZS11bnVzZWQtYXNzZXRdIERlbGV0ZSBmYWlsZWQ6JywgdXVpZCwgZXJyb3IpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICB9XG59O1xuXG5hc3luYyBmdW5jdGlvbiBmaW5kQWxsQXNzZXRzKGZvbGRlclBhdGg6IHN0cmluZywgYXNzZXRzOiBBc3NldEluZm9bXSk6IFByb21pc2U8dm9pZD4ge1xuICAgIGNvbnN0IGZpbGVzID0gYXdhaXQgZnMucmVhZGRpcihmb2xkZXJQYXRoKTtcbiAgICBcbiAgICBmb3IgKGNvbnN0IGZpbGUgb2YgZmlsZXMpIHtcbiAgICAgICAgY29uc3QgZnVsbFBhdGggPSBwYXRoLmpvaW4oZm9sZGVyUGF0aCwgZmlsZSk7XG4gICAgICAgIGNvbnN0IHN0YXQgPSBhd2FpdCBmcy5zdGF0KGZ1bGxQYXRoKTtcblxuICAgICAgICBpZiAoc3RhdC5pc0RpcmVjdG9yeSgpKSB7XG4gICAgICAgICAgICBhd2FpdCBmaW5kQWxsQXNzZXRzKGZ1bGxQYXRoLCBhc3NldHMpO1xuICAgICAgICB9IGVsc2UgaWYgKCFmaWxlLmVuZHNXaXRoKCcubWV0YScpKSB7XG4gICAgICAgICAgICBjb25zdCBtZXRhUGF0aCA9IGZ1bGxQYXRoICsgJy5tZXRhJztcbiAgICAgICAgICAgIGlmIChhd2FpdCBmcy5wYXRoRXhpc3RzKG1ldGFQYXRoKSkge1xuICAgICAgICAgICAgICAgIGNvbnN0IG1ldGFDb250ZW50ID0gYXdhaXQgZnMucmVhZEpzb24obWV0YVBhdGgpO1xuICAgICAgICAgICAgICAgIGNvbnN0IGFzc2V0SW5mbyA9IGF3YWl0IGdldEFzc2V0SW5mb0J5UGF0aChmdWxsUGF0aCk7XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgaWYgKGFzc2V0SW5mbykge1xuICAgICAgICAgICAgICAgICAgICBhc3NldHMucHVzaChhc3NldEluZm8pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cbn1cblxuYXN5bmMgZnVuY3Rpb24gZ2V0QXNzZXRJbmZvQnlQYXRoKGZpbGVQYXRoOiBzdHJpbmcpOiBQcm9taXNlPEFzc2V0SW5mbyB8IG51bGw+IHtcbiAgICB0cnkge1xuICAgICAgICBjb25zdCBwcm9qZWN0UGF0aCA9IEVkaXRvci5Qcm9qZWN0LnBhdGg7XG4gICAgICAgIGNvbnN0IHJlbGF0aXZlUGF0aCA9IHBhdGgucmVsYXRpdmUocHJvamVjdFBhdGgsIGZpbGVQYXRoKS5yZXBsYWNlKC9cXFxcL2csICcvJyk7XG4gICAgICAgIGNvbnN0IGRiUGF0aCA9ICdkYjovLycgKyByZWxhdGl2ZVBhdGg7XG4gICAgICAgIFxuICAgICAgICBjb25zdCBhc3NldEluZm8gPSBhd2FpdCBFZGl0b3IuTWVzc2FnZS5yZXF1ZXN0KCdhc3NldC1kYicsICdxdWVyeS1hc3NldC1pbmZvJywgZGJQYXRoKTtcbiAgICAgICAgXG4gICAgICAgIGlmIChhc3NldEluZm8pIHtcbiAgICAgICAgICAgIGNvbnN0IHN0YXQgPSBhd2FpdCBmcy5zdGF0KGZpbGVQYXRoKTtcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgdXVpZDogYXNzZXRJbmZvLnV1aWQsXG4gICAgICAgICAgICAgICAgcGF0aDogZGJQYXRoLFxuICAgICAgICAgICAgICAgIG5hbWU6IHBhdGguYmFzZW5hbWUoZmlsZVBhdGgpLFxuICAgICAgICAgICAgICAgIHR5cGU6IGFzc2V0SW5mby50eXBlIHx8ICd1bmtub3duJyxcbiAgICAgICAgICAgICAgICBzaXplOiBzdGF0LnNpemVcbiAgICAgICAgICAgIH07XG4gICAgICAgIH1cbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBjb25zb2xlLmVycm9yKCdbcmVtb3ZlLXVudXNlZC1hc3NldF0gRmFpbGVkIHRvIGdldCBhc3NldCBpbmZvOicsIGZpbGVQYXRoLCBlcnJvcik7XG4gICAgfVxuICAgIHJldHVybiBudWxsO1xufVxuXG5hc3luYyBmdW5jdGlvbiBmaW5kQWxsVXNlZFVVSURzKHVzZWRVVUlEczogU2V0PHN0cmluZz4pOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBjb25zdCBwcm9qZWN0UGF0aCA9IEVkaXRvci5Qcm9qZWN0LnBhdGg7XG4gICAgY29uc3QgYXNzZXRzUGF0aCA9IHBhdGguam9pbihwcm9qZWN0UGF0aCwgJ2Fzc2V0cycpO1xuICAgIFxuICAgIGF3YWl0IGZpbmRVVUlEc0luUGF0aChhc3NldHNQYXRoLCB1c2VkVVVJRHMpO1xufVxuXG5hc3luYyBmdW5jdGlvbiBmaW5kVVVJRHNJblBhdGgoZm9sZGVyUGF0aDogc3RyaW5nLCB1c2VkVVVJRHM6IFNldDxzdHJpbmc+KTogUHJvbWlzZTx2b2lkPiB7XG4gICAgY29uc3QgZmlsZXMgPSBhd2FpdCBmcy5yZWFkZGlyKGZvbGRlclBhdGgpO1xuICAgIFxuICAgIGZvciAoY29uc3QgZmlsZSBvZiBmaWxlcykge1xuICAgICAgICBjb25zdCBmdWxsUGF0aCA9IHBhdGguam9pbihmb2xkZXJQYXRoLCBmaWxlKTtcbiAgICAgICAgY29uc3Qgc3RhdCA9IGF3YWl0IGZzLnN0YXQoZnVsbFBhdGgpO1xuXG4gICAgICAgIGlmIChzdGF0LmlzRGlyZWN0b3J5KCkpIHtcbiAgICAgICAgICAgIGF3YWl0IGZpbmRVVUlEc0luUGF0aChmdWxsUGF0aCwgdXNlZFVVSURzKTtcbiAgICAgICAgfSBlbHNlIGlmIChmaWxlLmVuZHNXaXRoKCcuc2NlbmUnKSB8fCBmaWxlLmVuZHNXaXRoKCcucHJlZmFiJykgfHwgZmlsZS5lbmRzV2l0aCgnLmFuaW0nKSB8fCBmaWxlLmVuZHNXaXRoKCcubWF0ZXJpYWwnKSkge1xuICAgICAgICAgICAgYXdhaXQgZmluZFVVSURzSW5GaWxlKGZ1bGxQYXRoLCB1c2VkVVVJRHMpO1xuICAgICAgICB9XG4gICAgfVxufVxuXG5hc3luYyBmdW5jdGlvbiBmaW5kVVVJRHNJbkZpbGUoZmlsZVBhdGg6IHN0cmluZywgdXNlZFVVSURzOiBTZXQ8c3RyaW5nPik6IFByb21pc2U8dm9pZD4ge1xuICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IGNvbnRlbnQgPSBhd2FpdCBmcy5yZWFkRmlsZShmaWxlUGF0aCwgJ3V0Zi04Jyk7XG4gICAgICAgIGNvbnN0IHV1aWRSZWdleCA9IC9cIl9fdXVpZF9fXCJcXHMqOlxccypcIihbYS1mMC05XFwtXSspXCIvZztcbiAgICAgICAgbGV0IG1hdGNoO1xuICAgICAgICBcbiAgICAgICAgd2hpbGUgKChtYXRjaCA9IHV1aWRSZWdleC5leGVjKGNvbnRlbnQpKSAhPT0gbnVsbCkge1xuICAgICAgICAgICAgdXNlZFVVSURzLmFkZChtYXRjaFsxXSk7XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIGNvbnN0IHV1aWRSZWdleDIgPSAvXFxiKFthLWYwLTldezh9LVthLWYwLTldezR9LVthLWYwLTldezR9LVthLWYwLTldezR9LVthLWYwLTldezEyfSlcXGIvZztcbiAgICAgICAgd2hpbGUgKChtYXRjaCA9IHV1aWRSZWdleDIuZXhlYyhjb250ZW50KSkgIT09IG51bGwpIHtcbiAgICAgICAgICAgIHVzZWRVVUlEcy5hZGQobWF0Y2hbMV0pO1xuICAgICAgICB9XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgY29uc29sZS5lcnJvcignW3JlbW92ZS11bnVzZWQtYXNzZXRdIEZhaWxlZCB0byByZWFkIGZpbGU6JywgZmlsZVBhdGgsIGVycm9yKTtcbiAgICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBsb2FkKCkge31cblxuZXhwb3J0IGZ1bmN0aW9uIHVubG9hZCgpIHt9XG4iXX0=