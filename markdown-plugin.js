'use strict';

/**
 * ExMdTeX —— Hydro 的 markdown 扩展插件（markdown-it 插件，纯 CommonJS）
 *
 * 提供两类语法：
 *   1. QQ 表情：`/kk` `/kel` `/wx` …             -> <img class="exmdtex-face">
 *   2. 洛谷折叠框：`:::info[标题]{open}` … `:::`  -> <details>/<summary>
 *
 * 该文件被 addon 的 index.ts 通过 require() 直接加载，也被单元测试直接加载，
 * 因此刻意使用纯 JS（不经过 TS 编译，行为可离线验证）。
 *
 * 设计要点：
 *   - 表情使用 markdown-it 自定义行内 token，不经过 Hydro 的 XSS 过滤器
 *     （xssProtector 只处理 html_block / html_inline token），因此 class 不会被剥离；
 *   - 折叠框的标题作为独立的 inline token 交给核心 inline 规则解析，
 *     从而支持 LaTeX 公式、加粗、表情等行内语法；
 *   - 同时挂载到 Hydro 服务端共享的 markdown-it 单例上，
 *     所以讨论区 / 工单 / 犇犇 / 个人主页 / 题面等所有 `|markdown` 渲染位置全部生效。
 */

const CALLOUT_TYPES = ['info', 'success', 'warning', 'error'];

const DEFAULT_TITLES = {
    info: '提示',
    success: '成功',
    warning: '警告',
    error: '错误',
};

const CALLOUT_ICONS = {
    info: 'i',
    success: '✓',
    warning: '!',
    error: '✕',
};

/** 表情代码允许的字符与最大长度 */
const CODE_CHAR = /[A-Za-z0-9_]/;
const MAX_CODE_LEN = 16;

/**
 * 表情代码前面的字符若属于这些字符，则不解析：
 * 避免破坏 URL（https://a.com/kk）、路径（/user/kk）以及转义写法（\/kk）。
 */
function isBlockedPrevCode(code) {
    if (code === undefined) return false;
    // 0-9
    if (code >= 0x30 && code <= 0x39) return true;
    // A-Z a-z
    if (code >= 0x41 && code <= 0x5A) return true;
    if (code >= 0x61 && code <= 0x7A) return true;
    // _ / \
    return code === 0x5F || code === 0x2F || code === 0x5C;
}

/** 表情文件 -> 真实 URL：完整链接 / data URI / 绝对路径直接使用，否则拼到 faceBase 后面 */
function faceUrl(cfg, file) {
    if (/^(https?:)?\/\//i.test(file) || /^data:/i.test(file) || file.charAt(0) === '/') return file;
    return cfg.faceBase + file + '.gif';
}

module.exports = function exmdtexPlugin(md, options) {
    const cfg = options || {};
    if (!cfg.faces) cfg.faces = {};
    if (!cfg.faceBase) cfg.faceBase = '/exmdtex/face/';
    if (cfg.emoji === undefined) cfg.emoji = true;
    if (cfg.callout === undefined) cfg.callout = true;

    const escapeHtml = md.utils.escapeHtml;

    /* ------------------------------------------------------------------ *
     * 1. QQ 表情：/kk /kel ...
     * ------------------------------------------------------------------ */

    // faces 表统一按小写建索引，实现大小写不敏感匹配（如 /QQmua）
    let indexSrc = null;
    let indexMap = Object.create(null);
    function faceMap() {
        if (indexSrc === cfg.faces) return indexMap;
        const map = Object.create(null);
        for (const key in cfg.faces) {
            if (Object.prototype.hasOwnProperty.call(cfg.faces, key)) {
                map[String(key).toLowerCase()] = cfg.faces[key];
            }
        }
        indexSrc = cfg.faces;
        indexMap = map;
        return map;
    }

    /**
     * 切分单个文本片段，把其中的 /xx 换成表情 token。
     *
     * 注意：这里必须做成「处理 text token 的核心规则」而不是行内规则。
     * markdown-it 的 text 规则以 isTerminatorChar 为界吞字符，而 '/' 不是终止符，
     * 所以 "太强了/kk" 会被整体吞成一个文本 token，行内规则根本没有机会在 '/' 处被调用。
     */
    function splitFaces(text, Token) {
        const map = faceMap();
        const len = text.length;
        const out = [];
        let start = 0;
        let i = 0;
        let prevMatchEnd = -1;
        while (i < len) {
            if (text.charCodeAt(i) !== 0x2F /* / */) { i++; continue; }
            // 紧跟在表情后面（如 /kk/kel）不受边界限制，允许连写
            if (prevMatchEnd !== i && i > 0 && isBlockedPrevCode(text.charCodeAt(i - 1))) { i++; continue; }

            let codeLen = 0;
            while (codeLen < MAX_CODE_LEN && i + 1 + codeLen < len
                && CODE_CHAR.test(text[i + 1 + codeLen])) codeLen++;
            if (!codeLen) { i++; continue; }

            // 最长匹配：/kzht 优先于 /kt、/kk 优先于 /k
            let hit = null;
            for (let l = codeLen; l >= 1; l--) {
                const name = text.substr(i + 1, l).toLowerCase();
                if (map[name]) {
                    hit = { name, file: map[name], len: l };
                    break;
                }
            }
            if (!hit) { i++; continue; }

            if (i > start) {
                const before = new Token('text', '', 0);
                before.content = text.slice(start, i);
                out.push(before);
            }
            const label = '/' + hit.name;
            const img = new Token('exmdtex_qqface', '', 0);
            img.attrs = [
                ['class', 'exmdtex-face'],
                ['src', faceUrl(cfg, hit.file)],
                ['alt', label],
                ['title', label],
            ];
            out.push(img);
            i += 1 + hit.len;
            prevMatchEnd = i;
            start = i;
        }
        if (!out.length) return null;
        if (start < len) {
            const rest = new Token('text', '', 0);
            rest.content = text.slice(start);
            out.push(rest);
        }
        return out;
    }

    function replaceFaces(state) {
        if (!cfg.emoji) return;
        for (let i = 0; i < state.tokens.length; i++) {
            const token = state.tokens[i];
            if (token.type !== 'inline' || !token.children || !token.children.length) continue;
            const children = token.children;
            // StateCore 通常带有 Token 构造器，兜底从已有 token 上取
            const Token = state.Token || children[0].constructor;
            for (let j = 0; j < children.length; j++) {
                const child = children[j];
                if (child.type !== 'text') continue;
                if (child.content.indexOf('/') < 0) continue;
                const parts = splitFaces(child.content, Token);
                if (!parts) continue;
                children.splice(j, 1, ...parts);
                j += parts.length - 1;
            }
        }
    }

    function renderFace(tokens, idx) {
        const attrs = tokens[idx].attrs || [];
        let out = '<img';
        for (let i = 0; i < attrs.length; i++) {
            out += ` ${attrs[i][0]}="${escapeHtml(attrs[i][1])}"`;
        }
        return `${out}>`;
    }

    // 必须在核心 inline 规则之后（children 已就绪）、linkify 之前
    md.core.ruler.after('inline', 'exmdtex_qqface', replaceFaces);
    md.renderer.rules.exmdtex_qqface = renderFace;

    /* ------------------------------------------------------------------ *
     * 2. 洛谷折叠框：:::info[标题]{open} ... :::
     * ------------------------------------------------------------------ */

    /** 解析 `info[标题]{open}` 形式的参数；返回 null 表示不是折叠框 */
    function parseParams(params) {
        const m = /^\s*([A-Za-z][A-Za-z0-9]*)\s*(?:\[([\s\S]*)\])?\s*(?:\{([\s\S]*)\})?\s*$/.exec(params);
        if (!m) return null;
        const type = m[1].toLowerCase();
        if (CALLOUT_TYPES.indexOf(type) < 0) return null;
        return {
            type,
            title: m[2] === undefined ? DEFAULT_TITLES[type] : m[2],
            open: /\bopen\b/.test(m[3] || ''),
        };
    }

    function callout(state, startLine, endLine, silent) {
        if (!cfg.callout) return false;

        const lineStart = state.bMarks[startLine] + state.tShift[startLine];
        const lineEnd = state.eMarks[startLine];
        if (state.src.charCodeAt(lineStart) !== 0x3A /* : */) return false;
        if (state.sCount[startLine] - state.blkIndent >= 4) return false;

        let pos = lineStart;
        while (pos < lineEnd && state.src.charCodeAt(pos) === 0x3A) pos++;
        const markerCount = pos - lineStart;
        if (markerCount < 3) return false;

        const markup = state.src.slice(lineStart, pos);
        const parsed = parseParams(state.src.slice(pos, lineEnd));
        if (!parsed) return false;
        if (silent) return true;

        // 寻找结束行：冒号数量不少于开始行，且后面只有空白
        let nextLine = startLine;
        let closed = false;
        for (;;) {
            nextLine++;
            if (nextLine >= endLine) break;
            const s = state.bMarks[nextLine] + state.tShift[nextLine];
            const e = state.eMarks[nextLine];
            if (s < e && state.sCount[nextLine] < state.blkIndent) break;
            if (state.src.charCodeAt(s) !== 0x3A) continue;
            if (state.sCount[nextLine] - state.blkIndent >= 4) continue;
            let p = s;
            while (p < e && state.src.charCodeAt(p) === 0x3A) p++;
            if (p - s < markerCount) continue;
            if (state.src.slice(p, e).trim() !== '') continue;
            closed = true;
            break;
        }
        if (!closed) nextLine = endLine;

        const oldParent = state.parentType;
        const oldLineMax = state.lineMax;
        state.parentType = 'exmdtex_callout';
        // 阻止懒续行越过结束标记
        state.lineMax = nextLine;

        const tokenOpen = state.push('exmdtex_callout_open', 'details', 1);
        tokenOpen.block = true;
        tokenOpen.markup = markup;
        tokenOpen.info = parsed.type;
        tokenOpen.meta = { open: parsed.open };
        tokenOpen.map = [startLine, nextLine];

        // 标题：交给核心 inline 规则解析，支持 LaTeX / 加粗 / 表情
        const tokenTitle = state.push('inline', '', 0);
        tokenTitle.content = parsed.title;
        tokenTitle.map = [startLine, startLine + 1];
        tokenTitle.children = [];

        const tokenSplit = state.push('exmdtex_callout_split', '', 0);
        tokenSplit.block = true;
        tokenSplit.info = parsed.type;

        state.md.block.tokenize(state, startLine + 1, nextLine);

        const tokenClose = state.push('exmdtex_callout_close', 'details', -1);
        tokenClose.block = true;
        tokenClose.markup = state.src.slice(state.bMarks[nextLine] || 0, state.eMarks[nextLine] || 0);

        state.parentType = oldParent;
        state.lineMax = oldLineMax;
        state.line = nextLine + (closed ? 1 : 0);
        return true;
    }

    function renderCalloutOpen(tokens, idx) {
        const t = tokens[idx];
        const type = CALLOUT_TYPES.indexOf(t.info) >= 0 ? t.info : 'info';
        return `<details class="exmdtex-callout exmdtex-callout--${type}"${t.meta && t.meta.open ? ' open' : ''}>`
            + '<summary class="exmdtex-callout__header">'
            + `<span class="exmdtex-callout__icon exmdtex-callout__icon--${type}">${CALLOUT_ICONS[type]}</span>`
            + '<span class="exmdtex-callout__title">';
    }

    function renderCalloutSplit() {
        return '</span><span class="exmdtex-callout__arrow"></span></summary>'
            + '<div class="exmdtex-callout__body">';
    }

    function renderCalloutClose() {
        return '</div></details>';
    }

    md.block.ruler.before('fence', 'exmdtex_callout', callout, {
        alt: ['paragraph', 'reference', 'blockquote', 'list'],
    });
    md.renderer.rules.exmdtex_callout_open = renderCalloutOpen;
    md.renderer.rules.exmdtex_callout_split = renderCalloutSplit;
    md.renderer.rules.exmdtex_callout_close = renderCalloutClose;

    return md;
};

module.exports.CALLOUT_TYPES = CALLOUT_TYPES;
module.exports.DEFAULT_TITLES = DEFAULT_TITLES;
