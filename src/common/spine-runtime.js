/**
 * Spine 运行时
 */
const SpineRuntime = {

    /**
     * 缓存
     */
    cache: {
        '3.5': null,
        '3.6': null,
        '3.7': null,
        '3.8': null,
        '4.0': null,
        '4.2': null,
    },

    /**
     * 获取指定版本的 Spine 运行时
     * @param {string} version 版本
     */
    get(version) {
        const cache = SpineRuntime.cache;
        // 如果版本号不在缓存中，尝试映射到最接近的版本
        if (!(version in cache)) {
            const major = parseFloat(version);
            if (major >= 4.2) {
                version = '4.2';
            } else if (major >= 4.0) {
                version = '4.0';
            } else if (major >= 3.8) {
                version = '3.8';
            } else if (major >= 3.7) {
                version = '3.7';
            } else if (major >= 3.6) {
                version = '3.6';
            } else {
                version = '3.5';
            }
        }
        if (cache[version] == null) {
            const libPath = `../../lib/spine-runtimes/${version}/spine-webgl`;
            cache[version] = require(libPath);
            // 注入 webgl 属性（4.2+ 版本的 runtime 将 webgl 导放在了根部）
            if (!cache[version].webgl) {
                cache[version].webgl = cache[version];
            }
            // 注入 phiên bản
            cache[version].version = version;
        }
        return cache[version];
    },

};

module.exports = SpineRuntime;
