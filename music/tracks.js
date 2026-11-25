/* ==================== 音乐模块 · 曲目配置 ====================
 *
 * 这是整个音乐模块**唯一**需要改的文件。加歌 = 复制一段对象，改字段。
 *
 * 字段：
 *   id       必填，唯一。用于收藏 / 分享，也方便以后做深链。
 *   title    必填，卡片、列表、系统锁屏都会显示。
 *   artist   歌手 / 来源，可留空。
 *   album    专辑名，可留空（列表副标题会拼在歌手后面）。
 *   src      必填，**能直接播放的音频直链**：
 *            - 必须直接返回音频（Content-Type: audio/*），
 *              不是网盘分享页、不是 .html 落地页。
 *            - 服务器最好支持 Range 请求（Accept-Ranges: bytes），
 *              否则进度条拖不动 —— 拖到一半会从头开始缓冲。
 *            - 写完整 http(s) 地址；也可以写相对路径，按**站点根**解析
 *              （`music/audio/x.mp3` 在首页、文章页、/music/ 都指向同一个文件）。
 *   cover    可选，封面图。写了就替代黑胶唱片（圆形裁切），不写就画唱片。
 *   duration 可选，秒。填了不用等播放就能显示时长；不填显示 --:--。
 *   accent   可选，唱片中心标的颜色（只有没配封面时才看得见）。
 *
 * ⚠️ 首页卡片的首帧文案（第一首的标题 / 歌手）同时写死在 index.html 里，
 *    这样 tracks.js 还没执行时卡片也不是一片空白。改第一首记得两处一起改。
 *
 * 直链的可用性由对方服务器决定：防盗链、限流、临时签名过期都会让播放失败。
 * 播放器把这类失败统一说成「今日播放额度已用完」，额度规则本身不出现在页面上。
 * 具体限流由文件所在的服务端执行，前端只能如实提示，不能真的替它计数。
 * ======================================================== */
window.ANNIE_MUSIC_TRACKS = [
    {
        id: 'marriage',
        title: '婚',
        artist: '沐可儿',
        album: '婚',
        src: 'https://1837491863.cdn.123clouddisk.com/1837491863/52072187',
        cover: 'images/music_img/IMG_marriage_0.jpg',
        duration: 184,
        accent: '#b45f74'
    },
    {
        id: 'hug_you',
        title: '好想抱住你',
        artist: '程佳佳',
        album: '好想抱住你',
        src: 'https://1837491863.cdn.123clouddisk.com/1837491863/51963332#',
        cover: 'images/music_img/IMG_hug_you_0.jpg',
        duration: 222,
        accent: '#b45f74'
    },
    {
        id: 'caught',
        title: '淋一场雨',
        artist: 'LBI利比（时柏尘）',
        album: '淋一场雨',
        src: 'https://1837491863.cdn.123clouddisk.com/1837491863/51880812#',
        cover: 'images/music_img/IMG_caught_0.jpg',
        duration: 201,
        accent: '#b45f74'
    },
    {
        id: 'mid-autumn-2020',
        title: '2020中秋节-活动BGM',
        artist: '第五人格',
        src: 'https://1837491863.cdn.123clouddisk.com/1837491863/46339020',
        duration: 118,
        accent: '#a9803f'
    }
];
