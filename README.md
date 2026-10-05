# hydro-exmdtex

为 Hydro 增加两类洛谷风格、框架原生不支持的 markdown 语法：

| 语法 | 写法 | 效果 |
| --- | --- | --- |
| QQ 表情 | `/kk` `/kel` `/wx` …（152 个代码） | 行内小表情图片 |
| 洛谷折叠框 | `:::info[标题]` … `:::` | 可折叠的彩色提示框（Callout） |

**生效范围**：所有服务端 markdown 渲染位置 —— 讨论区、工单、犇犇、个人主页犇犇、题面、比赛公告与澄清、个人简介、训练/作业描述等，即凡是使用 Hydro `|markdown` 过滤器的地方。

---

## 安装

```bash
# 1. 上传插件（在本地仓库根目录执行）
scp -r hydro-exmdtex ubuntu@106.52.239.50:/root/.hydro/addons/

# 2. 注册插件
ssh ubuntu@106.52.239.50
hydrooj addon add /root/.hydro/addons/hydro-exmdtex

# 3. 重启（会同时重建前端 bundle，注入折叠框样式）
pm2 restart hydrooj
```

自检：浏览器访问 `https://<你的域名>/exmdtex/status`，返回：

```json
{ "mounted": true, "mountError": "", "faceBase": "/exmdtex/face/",
  "faceCodes": 152, "faceImages": 149, "emoji": true, "callout": true }
```

`mounted: true` 表示 markdown 扩展挂载成功。若为 `false`，`mountError` 会说明原因。

---

## 一、QQ 表情

在任意内容里写 `/代码` 即可，例如：

```markdown
太强了/kk 讲得太清楚了/kel 感谢/qq

好/kk/kel/qq     ← 可以连写
```

大小写不敏感（`/qqmua` 与 `/QQmua` 等价），最长匹配优先（`/kzht` 不会被当成 `/k`）。

### 全部代码（152 个）

```
/QQmua /aini /aiq /am /azgc /baiy /bangbangt /baojin /bb /bkx /bl /bp /bq /bs /bt /bu /bz
/ch /chi /cj /cp /dan /dao /db /dg /dk /dl /dy /dz /ee /fad /fan /fd /fendou /fj /fn /fw
/gg /gy /gz /hanx /haob /hb /hc /hd /hec /hn /hp /hq /hsh /ht /huaix /hx /jd /jh /jiaybs
/jie /jk /jw /jy /ka /kb /kel /kf /kg /kk /kl /kt /kuk /kun /kzht /lb /lengh /lh /ll /lm
/lq /lw /meigui /mg /mm /ng /ou /pch /pj /pp /px /qd /qiang /qiao /qidao /qq /qt /ruo /sa
/se /sh /shd /shl /shuai /shui /sr /taiyang /tiao /tl /tnl /tp /ts /tsh /tuu /tx /ty /wbk
/wl /wn /wq /ws /wx /wzm /xg /xhx /xia /xig /xin /xjj /xk /xs /xu /xw /xy /xyx /yao /yb
/yhh /yiw /yl /youl /youtj /yt /yun /yx /zhd /zhem /zhh /zhm /zhq /zj /zk /zq /zt /zuotj
/zyj
```

常用对照：`/wx` 微笑 · `/pz` 撇嘴 · `/se` 色 · `/fd` 发呆 · `/dy` 得意 · `/ll` 流泪 · `/hx` 害羞 · `/dk` 大哭 · `/cy` 呲牙 · `/jy` 惊讶 · `/ng` 难过 · `/kel` 可怜 · `/kk` 快哭了 · `/qq` 亲亲 · `/shui` 睡 · `/bz` 闭嘴 · `/tuu` 吐 · `/huaix` 坏笑 · `/zhem` 折磨 · `/kl` 骷髅 · `/mg` 玫瑰 · `/ty` 太阳 · `/xg` 西瓜

图片以 base64 打包在 `faces-data.json`（单文件 1.6MB / 149 张）里，通过 `/exmdtex/face/<文件名>` 由插件本地提供，**不依赖任何外部 CDN**（国内网络可直连），部署时也不需要同步上百个小文件。

### 不会误伤的边界

| 输入 | 结果 | 原因 |
| --- | --- | --- |
| `https://example.com/kk` | 保持链接 | `/` 前是字母，视为 URL |
| `文件在 /user/kk 目录` | 保持原样 | `/` 前是 `/`，视为路径 |
| `共 1/kk 个` | 保持原样 | `/` 前是数字 |
| `\/kk` | 显示字面量 `/kk` | 反斜杠转义 |
| `` `/kk` `` 、代码块里的 `/kk` | 保持原样 | 代码不参与解析 |
| `AC/kk` | 保持原样 | 与 URL 保护同规则；写成 `AC /kk` 即可 |

---

## 二、洛谷折叠框（Callout）

```markdown
:::info[提示]
默认折叠，点击标题展开。
:::

:::success[通过]{open}
带 {open} 参数 = 默认展开。
:::

:::warning[注意]
注意边界情况。
:::

:::error[错误]
这样写会 WA。
:::
```

- 四种类型：`info`（蓝）/ `success`（绿）/ `warning`（黄）/ `error`（红）
- `{open}` 让折叠框默认展开；不写则默认折叠
- 标题可省略，省略时使用默认标题（提示/成功/警告/错误）
- 标题支持 **LaTeX 公式**、加粗、行内代码、表情等行内语法
- 正文支持完整 markdown：列表、代码块、表格、公式、引用、表情、嵌套折叠框
- 嵌套：外层冒号比内层多，例如

```markdown
::::warning[外层]
:::info[内层]
内容
:::
::::
```

- 没写结束标记时会自动闭合到文档结尾

---

## 设置项

`控制面板 → 系统设置 → exmdtex`

| 键 | 说明 |
| --- | --- |
| `faceBase` | 表情图片基础路径，默认 `/exmdtex/face/`。OJ 部署在子目录时才需要改 |
| `enableQQFace` | 是否启用 QQ 表情语法 |
| `enableCallout` | 是否启用折叠框语法 |
| `extraFaces` | 自定义表情映射，每行一条 `代码=文件名`、`代码=完整图片地址` 或 `代码=data:image/gif;base64,…` |

设置修改后**立即生效**，不需要重启（插件持有的是同一个配置对象）。

---

## 已知限制

1. **编辑器实时预览不渲染**：Hydro 编辑器的预览由前端 `md-editor-rt` 用另一套客户端 markdown-it 渲染，插件无法注入；**提交后的内容会正常渲染**。犇犇输入框同理。
2. 需要重启 Hydro 才会生效（addon 加载 + 前端 bundle 重建）。
3. 少数代码在原素材站缺图，已从代码表中剔除（`doge` `dx` `fade` `jiaybb` `oh` `pt` `shxi` `tyt` `cengyiceng` `dgg` `bobo`），输入这些不会渲染也不会报错。

---

## 实现原理

Hydro 服务端的 markdown 由 `@hydrooj/ui-default/backendlib/markdown` 的单例渲染，该模块导出了 `plugin()`：

```js
function plugin(func, ...args) { md.use(func, ...args); }
```

`index.ts` 通过两条路径拿到这个单例（`global.addons['ui-default']` 的绝对路径 → 兜底 `require('@hydrooj/ui-default/backendlib/markdown')`），
把 `markdown-plugin.js` 注册进去。由于模板里所有 `|markdown` 过滤器都走这一个单例，注册一次即全站生效，**无需修改框架代码**。

两个语法各自的实现要点：

- **表情**：做成「切分 text token 的核心规则」而不是行内规则。
  markdown-it 的行内 `text` 规则以 `isTerminatorChar` 为界吞字符，而 `/` **不是**终止符，
  所以 `太强了/kk` 会被整体吞成一个 text token，行内规则根本没机会在 `/` 处被调用。
  核心规则在 inline 解析之后遍历 text token 并切分，才能正确处理任意位置的 `/kk`。
  生成的是自定义 token（不是 `html_block`/`html_inline`），因此 Hydro 的 XSS 过滤器不会剥离 `class`。
- **折叠框**：仿 `markdown-it-container` 实现块级规则（冒号计数 + 嵌套 + 自动闭合），
  标题作为独立的 `inline` token 交给核心 inline 规则解析，从而天然支持 LaTeX、加粗、表情。

表情素材取自洛谷常用 QQ 表情代码表（经 `qqemoji.pages.dev` 镜像），已全部本地化打包。

---

## 文件结构

| 文件 | 说明 |
| --- | --- |
| `index.ts` | 插件入口：挂载 markdown 扩展、表情图片路由、系统设置 |
| `markdown-plugin.js` | markdown-it 插件本体（表情 + 折叠框），纯 JS 便于离线测试 |
| `faces.json` | 表情代码 -> 文件名映射（152 条，可直接手改） |
| `faces-data.json` | 表情图片 base64 资源包（149 张 / 1.6MB） |
| `frontend/exmdtex.page.ts` | 前端入口，仅用于引入样式 |
| `frontend/exmdtex.css` | 表情与折叠框样式（含暗色主题） |

---

## 开发 / 测试

`.research/`（工作区根目录下）保留了一套离线测试环境：
直接加载 Hydro 真实的 `backendlib/markdown` + 本插件，`harness/test.js` 覆盖 59 条用例
（表情位置、URL/路径/转义/代码块保护、折叠框四种类型、`{open}`、嵌套、标题公式、标签闭合、原生语法回归）。

```bash
cd .research/harness
export NODE_PATH=~/.workbuddy/binaries/node/workspace/node_modules
node build.js && node test.js        # 行为测试
node validate.js                     # index.ts / 插件 / JSON 语法校验
node preview.js                      # 重新生成 exmdtex-preview.html

cd ..                               # 表情资源
node check_faces.js                  # 自检资源包完整性
node check_faces.js --fix            # 缺图时重新抓取
```
