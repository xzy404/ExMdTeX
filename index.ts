/**
 * hydro-exmdtex —— Hydro 的 ExMdTeX 扩展
 *
 * 提供两类在洛谷上常见、而 Hydro 原生不支持的语法：
 *
 *   1. QQ 表情：`/kk` `/kel` `/wx` …（共 152 个代码，含 `/kk` `/kel` 等洛谷写法）
 *      -> <img class="exmdtex-face" src="/exmdtex/face/kk.gif">
 *
 *   2. 洛谷折叠框（Callout）：
 *      :::info[标题]            :::success[标题]{open}
 *      内容…                    内容…
 *      :::                      :::
 *      类型：info / success / warning / error；`{open}` 表示默认展开；
 *      支持嵌套（外层冒号比内层多）；标题支持 LaTeX 公式。
 *
 * 生效范围：所有服务端 markdown 渲染位置 —— 讨论区、工单、犇犇、个人主页犇犇、
 * 题面、比赛公告、个人简介等（即所有使用 Hydro `|markdown` 过滤器的地方）。
 *
 * 实现方式：Hydro 服务端所有 markdown 都由 @hydrooj/ui-default 的
 * `backendlib/markdown` 单例渲染，该模块导出了 `plugin()` 用于注册
 * markdown-it 插件。本插件把 ExMdTeX 插件注册到这个单例上，因此不需要
 * 修改框架代码、也不需要反编译前端 bundle。
 *
 * 表情图片以 base64 打包在 faces-data.json 里（单文件，149 张 / 1.6MB），
 * 由 /exmdtex/face/:name 本地提供，不依赖任何外部 CDN（国内网络可直接访问），
 * 部署时也不用同步上百个小文件。
 *
 * 安装：
 *   scp -r hydro-exmdtex ubuntu@<host>:/root/.hydro/addons/
 *   hydrooj addon add /root/.hydro/addons/hydro-exmdtex
 *   pm2 restart hydrooj
 *
 * 自检：访问 /exmdtex/status 可确认扩展是否挂载成功。
 */
import path from 'path';
import {
    Context, Handler, NotFoundError, Schema, SystemModel,
} from 'hydrooj';

/* eslint-disable @typescript-eslint/no-var-requires */
const exmdtexPlugin = require('./markdown-plugin');
const BUNDLED_FACES: Record<string, string> = require('./faces.json');
const FACE_DATA: Record<string, string> = require('./faces-data.json');

const DEFAULT_FACE_BASE = '/exmdtex/face/';
const FACE_NAME = /^[a-z0-9_]{1,32}$/;

/**
 * 传给 markdown 插件的配置对象。
 * 插件内部持有同一个引用，所以修改设置后无需重新注册即可生效。
 */
const config = {
    faceBase: DEFAULT_FACE_BASE,
    faces: { ...BUNDLED_FACES } as Record<string, string>,
    emoji: true,
    callout: true,
};

let mounted = false;
let mountError = '';

/** 定位 Hydro 服务端的 markdown 单例（带两条兜底路径） */
function resolveUiMarkdown() {
    const errors: string[] = [];
    const candidates: string[] = [];
    const addons = (global as any).addons || {};
    if (addons['ui-default']) {
        candidates.push(path.join(addons['ui-default'], 'backendlib', 'markdown.js'));
    }
    candidates.push('@hydrooj/ui-default/backendlib/markdown');
    for (const candidate of candidates) {
        try {
            const mod = require(candidate);
            if (typeof mod?.plugin === 'function') return mod;
            if (mod?.md && typeof mod.md.use === 'function') return mod;
            errors.push(`${candidate}: 模块结构不符合预期`);
        } catch (e) {
            errors.push(`${candidate}: ${(e as Error).message}`);
        }
    }
    mountError = errors.join(' | ');
    return null;
}

/** /exmdtex/face/:name —— 内置表情图片（首次访问时解码并缓存），长缓存 */
class ExmdtexFaceHandler extends Handler {
    noCheckPermView = true;

    static cache = new Map<string, Buffer>();

    async get() {
        let name = String(this.args.name || '');
        if (!name) {
            // 路由参数未注入 args 时退回解析路径
            const raw = String((this.request as any).path || '');
            name = decodeURIComponent(raw.split('/').pop() || '');
        }
        name = name.replace(/\.gif$/i, '').toLowerCase();
        if (!FACE_NAME.test(name)) throw new NotFoundError('表情不存在');

        let buf = ExmdtexFaceHandler.cache.get(name);
        if (!buf) {
            const base64 = FACE_DATA[name];
            if (!base64) throw new NotFoundError('表情不存在');
            buf = Buffer.from(base64, 'base64');
            ExmdtexFaceHandler.cache.set(name, buf);
        }
        this.response.type = 'image/gif';
        this.response.addHeader('Cache-Control', 'public, max-age=31536000, immutable');
        this.response.body = buf;
    }
}

/** /exmdtex/status —— 部署自检 */
class ExmdtexStatusHandler extends Handler {
    noCheckPermView = true;

    async get() {
        this.response.addHeader('Cache-Control', 'no-cache');
        this.response.body = {
            mounted,
            mountError,
            faceBase: config.faceBase,
            faceCodes: Object.keys(config.faces).length,
            faceImages: Object.keys(FACE_DATA).length,
            emoji: config.emoji,
            callout: config.callout,
        };
    }
}

/** 把系统设置里的值同步到运行期配置 */
function syncConfig() {
    try {
        const base = String(SystemModel.get('exmdtex.faceBase') || DEFAULT_FACE_BASE);
        config.faceBase = base.endsWith('/') ? base : `${base}/`;
        config.emoji = SystemModel.get('exmdtex.enableQQFace') !== false;
        config.callout = SystemModel.get('exmdtex.enableCallout') !== false;

        const faces: Record<string, string> = { ...BUNDLED_FACES };
        const extra = String(SystemModel.get('exmdtex.extraFaces') || '');
        for (const line of extra.split('\n')) {
            const m = /^\s*\/?([A-Za-z0-9_]{1,32})\s*[=:：]\s*(\S+)\s*$/.exec(line);
            if (m) faces[m[1].toLowerCase()] = m[2];
        }
        config.faces = faces;
    } catch (e) {
        // 设置尚未加载完成时忽略，保留默认值
    }
}

export async function apply(ctx: Context) {
    const mod = resolveUiMarkdown();
    if (mod) {
        try {
            if (typeof mod.plugin === 'function') mod.plugin(exmdtexPlugin, config);
            else mod.md.use(exmdtexPlugin, config);
            mounted = true;
            console.log(`[exmdtex] markdown 扩展已挂载，表情代码 ${Object.keys(config.faces).length} 个`);
        } catch (e) {
            mountError = (e as Error).message;
            console.error('[exmdtex] 注册 markdown 插件失败:', e);
        }
    } else {
        console.error('[exmdtex] 未找到 @hydrooj/ui-default 的 markdown 渲染模块，ExMdTeX 语法不会生效:', mountError);
    }

    ctx.Route('exmdtex_face', '/exmdtex/face/:name', ExmdtexFaceHandler);
    ctx.Route('exmdtex_status', '/exmdtex/status', ExmdtexStatusHandler);

    ctx.inject(['setting'], (c) => {
        c.setting.SystemSetting(Schema.object({
            exmdtex: Schema.object({
                faceBase: Schema.string().default(DEFAULT_FACE_BASE)
                    .description('表情图片基础路径（OJ 部署在子目录时才需要改）'),
                enableQQFace: Schema.boolean().default(true)
                    .description('启用 QQ 表情语法（/kk /kel …）'),
                enableCallout: Schema.boolean().default(true)
                    .description('启用洛谷折叠框语法（:::info[标题] … :::）'),
                extraFaces: Schema.string().role('textarea').default('')
                    .description('自定义表情映射，每行一条：代码=文件名或完整图片地址'),
            }),
        }));
        const sync = () => syncConfig();
        ctx.on('system/setting', sync);
        ctx.on('system/setting-loaded', sync);
        sync();
    });
}
