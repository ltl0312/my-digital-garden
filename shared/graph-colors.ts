// 图谱节点自定义颜色的**共享校验规则**（服务端与前端同源，只此一份）。
//
// 为什么要有白名单：颜色值最终会被 d3 直接写进 SVG `fill` / canvas `fillStyle`。
// 存进 DB 的值经 `/api/graph/colors` 回灌到浏览器，若不加限制，手改请求就能把
// 任意字符串塞进 DOM 属性。只放行能直接当颜色用的字面量。

/** 能直接喂给 canvas `fillStyle` / SVG `fill` 的颜色字面量 */
export const CSS_COLOR_RE = /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\)|hsla?\([\d\s.,%]+\)|var\(--[\w-]+\))$/i

/** 值是否为安全的颜色字面量（自动 trim） */
export const isSafeColor = (v: unknown): v is string => typeof v === 'string' && CSS_COLOR_RE.test(v.trim())

/** 归一化：安全则返回 trim 后的值，否则 null */
export const normalizeColor = (v: unknown): string | null => {
  if (!isSafeColor(v)) return null
  return (v as string).trim()
}

/**
 * 单个用户最多能存多少条自定义色。
 * 图谱上限约 600 个节点，留足冗余；同时防止有人 PUT 一个几十万键的对象把库撑爆。
 */
export const MAX_NODE_COLORS = 5000

/** slug 长度上限（vault 相对路径，正常远小于此） */
export const MAX_COLOR_SLUG_LENGTH = 512
