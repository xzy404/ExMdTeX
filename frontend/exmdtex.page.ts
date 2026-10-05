/**
 * ExMdTeX 前端入口 —— 只负责注入样式。
 *
 * 解析全部在服务端 markdown-it 完成，这里不需要引入任何依赖；
 * esbuild 会把 exmdtex.css 并入 entry.css，由 Hydro 的 _hydroLoad 注入 <style>。
 * 样式加载失败时折叠框仍可正常展开（<details> 原生行为），只是没有配色。
 */
import './exmdtex.css';
