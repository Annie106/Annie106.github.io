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
 *   lyric    可选，歌词。播放页右侧那块就是它。三种写法都认：
 *            1) 数组：lyric: [{ time: 12.5, text: '第一句' }, { time: 18.2, text: '第二句' }]
 *               time 单位是**秒**（可以带小数），从左到右必须递增。
 *            2) LRC 原文（直接粘现成的）：
 *               lyric: '[00:12.50]第一句\n[00:18.20]第二句'
 *               [ti:] / [ar:] / [al:] / [by:] 这些标签会被自动忽略；
 *               一行里带多个时间戳（[00:10.00][00:30.00]副歌）会展开成两行。
 *            3) 纯文本：一行一句，只滚动不跟随播放进度。
 *            不写 / 空字符串 / 空数组 → 播放页显示「该歌曲未配置歌词」。
 *            有时间的歌词会跟着播放高亮 + 自动居中，点一句跳过去。
 *   lyricFile 可选，**直接指向一个 .lrc 文件**（有现成歌词文件时推荐这个）：
 *            lyricFile: 'music/lyrics/marriage.lrc'
 *            - 相对路径按站点根解析；第一次放到这一首才去读，同一次访问只读一遍。
 *            - 编码不用管：先按 UTF-8 解，解出乱码会自动再按 GBK 试一次。
 *            - 读取期间歌词区显示「歌词加载中…」，读不到显示「歌词加载失败」。
 *            - 和 lyric 同时写时以 lyric 为准。
 *            - ⚠️ 是 fetch 读同源文件，所以**本地要起服务器**（双击 HTML 打不开）；
 *              线上是 GitHub Pages，正常。
 *            - 文件名建议用英文 / 拼音：中文名也能用，但复制链接时会被转义成一长串。
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
        lyricFile: 'music/lyrics/marriage.lrc', 
        accent: '#b45f74'
    },
    {
        id: 'hug_you',
        title: '好想抱住你',
        artist: '程佳佳',
        album: '好想抱住你',
        src: 'https://1837491863.cdn.123clouddisk.com/1837491863/51963332',
        cover: 'images/music_img/IMG_hug_you_0.jpg',
        duration: 222,
        lyricFile: 'music/lyrics/hug_you.lrc',
        accent: '#b45f74'
    },
    {
        id: 'wind blows',
        title: '风吹雨落',
        artist: '刀酱',
        album: '风吹雨落',
        src: 'https://1837491863.cdn.123clouddisk.com/1837491863/52025030',
        cover: 'images/music_img/IMG_wind blows_0.jpg',
        duration: 159,
        lyricFile: 'music/lyrics/wind blows.lrc',
        accent: '#b45f74'
    },
    {
        id: 'Summer Flower',
        title: '夏花 ',
        artist: '一颗狼星',
        album: '夏花 ',
        src: 'https://1837491863.cdn.123clouddisk.com/1837491863/51888061',
        cover: 'images/music_img/IMG_Summer Flower_0.jpg',
        duration: 181,
        lyricFile: 'music/lyrics/Summer Flower.lrc',
        accent: '#b45f74'
    },
    {
        id: 'The Seventh Wish',
        title: '第七个愿',
        artist: '梶',
        album: '第七个愿 ',
        src: 'https://1837491863.cdn.123clouddisk.com/1837491863/51972400',
        cover: 'images/music_img/IMG_The Seventh Wish_0.jpg',
        duration: 163,
        lyricFile: 'music/lyrics/The Seventh Wish.lrc',
        accent: '#b45f74'
    },
    {
        id: 'Una Mattina',
        title: 'Una Mattina',
        artist: 'Papa Tin',
        album: 'Una Mattina',
        src: 'https://1837491863.cdn.123clouddisk.com/1837491863/52053384',
        cover: 'images/music_img/IMG_Una Mattina_0.jpg',
        duration: 177,
        lyricFile: 'music/lyrics/Una Mattina.lrc',
        accent: '#b45f74'
    },
    {
        id: 'shallow-summer',
        title: '浅夏淡过花开时',
        artist: '莫小娘',
        album: '只能选择长大',
        src: 'https://1837491863.cdn.123clouddisk.com/1837491863/51888068',
        cover: 'images/music_img/IMG_shallow-summer_0.jpg',
        duration: 236,
        lyricFile: 'music/lyrics/shallow-summer.lrc',
        accent: '#b45f74'
    },
    {
        id: 'libra-collapse',
        title: '天秤座·崩塌时论',
        artist: '沐可儿',
        album: '天秤座·崩塌时论',
        src: 'https://1837491863.cdn.123clouddisk.com/1837491863/52004231',
        cover: 'images/music_img/IMG_libra-collapse_0.jpg',
        duration: 155,
        lyricFile: 'music/lyrics/libra-collapse.lrc',
        accent: '#b45f74'
    },
    {
        id: 'moon-not-shine',
        title: '我恨明月不照我',
        artist: '阿YueYue',
        album: '我恨明月不照我',
        src: 'https://1837491863.cdn.123clouddisk.com/1837491863/52004232',
        cover: 'images/music_img/IMG_moon-not-shine_0.jpg',
        duration: 252,
        lyricFile: 'music/lyrics/moon-not-shine.lrc',
        accent: '#b45f74'
    },
    {
        id: 'ask-wind',
        title: '问风',
        artist: '金渔',
        album: '问风',
        src: 'https://1837491863.cdn.123clouddisk.com/1837491863/52053393',
        cover: 'images/music_img/IMG_ask-wind_0.jpg',
        duration: 214,
        lyricFile: 'music/lyrics/ask-wind.lrc',
        accent: '#b45f74'
    },
    {
        id: 'fireworks-star',
        title: '烟花碰不到星星',
        artist: '6SP',
        album: '烟花碰不到星星',
        src: 'https://1837491863.cdn.123clouddisk.com/1837491863/52082021',
        cover: 'images/music_img/IMG_fireworks-star_0.jpg',
        duration: 180,
        lyricFile: 'music/lyrics/fireworks-star.lrc',
        accent: '#b45f74'
    },
    {
        id: 'timid',
        title: '露怯',
        artist: '苏效音',
        album: '露怯',
        src: 'https://1837491863.cdn.123clouddisk.com/1837491863/52112978',
        cover: 'images/music_img/IMG_timid_0.jpg',
        duration: 155,
        lyricFile: 'music/lyrics/timid.lrc',
        accent: '#b45f74'
    },
    {
        id: 'childhood-run',
        title: '童年的罚跑',
        artist: '李小眼 / LKF34',
        album: '惊蛰',
        src: 'https://1837491863.cdn.123clouddisk.com/1837491863/52143543',
        cover: 'images/music_img/IMG_childhood-run_0.jpg',
        duration: 187,
        lyricFile: 'music/lyrics/childhood-run.lrc',
        accent: '#b45f74'
    },
    {
        id: 'pulse',
        title: '脉搏',
        artist: '傅梦彤 / 高明飞',
        album: '脉搏',
        src: 'https://1837491863.cdn.123clouddisk.com/1837491863/52168273',
        cover: 'images/music_img/IMG_pulse.jpg',
        duration: 158,
        lyricFile: 'music/lyrics/pulse.lrc',
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
