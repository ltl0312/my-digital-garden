/**
 * Markdown 解析前的「语义保真」预处理。
 *
 * 为什么需要：GFM / remark 的两处规范行为会把**正确书写的正文**渲染成字面量，
 * 用户看到的就是「反引号原样显示出来」：
 *
 *  ① 表格单元格里的行内代码含竖线
 *     `| postgres | `pg_isready -U $USER` |` 之外，像
 *     `| redis | `redis-cli -a $$PW ping | grep -q PONG` | 这种更常见 ——
 *     表格切分发生在行内解析之前，代码跨度里的 `|` 不保护单元格边界，
 *     于是「cell 被从竖线处切断」，两侧各留一个未闭合的反引号 → 页面显示 `redis-cli -a $$PW ping`。
 *     GFM 规定的写法是 `\|`（表格内会还原成 `|`，包括在代码跨度内）。
 *     这里替作者补上：**只改表格行、只改行内代码跨度内部**，正文不动。
 *
 *  ② 正文里的 `$` 被 remark-math 当成行内公式定界符
 *     例：``（`.env` / `${VAR}` / `environment`）不会自动进容器；`env_file` 是 …``
 *     同一段里出现两个 `$` → 中间整段被吃成 <math>，其中的反引号随之原样输出。
 *     判定规则：只有「看起来像公式」的 $...$ 才保留（无中文、无反引号、无首尾空白、
 *     或含 LaTeX 反斜杠命令）；其余两侧 `$` 换成私用区占位符，渲染完再还原成 `$`。
 *     代码跨度内的 `$` 一律占位（代码里的 `${VAR}` / `$$` 永远不是公式）。
 *
 * 占位符用 U+E000（私用区，正文不会出现），渲染后由 restoreMathPlaceholders 还原。
 */
export const DOLLAR_PLACEHOLDER = '\uE000'

const FENCE_RE = /^\s{0,3}(?:```|~~~)/
const TABLE_ROW_RE = /^\s*\|/
// 行内代码跨度：n 个反引号开、同一数量闭合（``a`b`` 也成立）
const CODE_SPAN_RE = /(`+)([\s\S]*?)\1/

/**
 * 内容「像公式」的判据：无首尾空白、无反引号，且满足其一
 *  - 含 LaTeX 信号（\ 命令，或 `_ ^ { } =` 这类排版符号）→ 即使混了中文也算
 *    （真实用例：`$[-X]_{补} = 2^n - X$`，下标是中文）
 *  - 不含中文（纯 ASCII 公式）
 * 反例（要挡掉的）：`${VAR}`、`$99/年)`、`$uri $`
 */
function looksLikeMath(body: string): boolean {
  if (!body || /^\s|\s$/.test(body)) return false
  if (body.includes('`')) return false
  if (/[\\_^{}=]/.test(body)) return true
  return !/[\u4e00-\u9fff]/.test(body)
}

/**
 * 正文片段里的 $ 逐个判定：能配成「像公式」的一对就保留，否则换成占位符。
 *
 * 两个坑都要堵：
 *  ① 成对的 `$...$` 内容不像公式（`${VAR}`、`$99/年)`）→ 挡掉，否则整段变 <math>；
 *  ② **跨代码跨度**的假配对：`` （${VAR}），… `env_file` … 用 .env + ${VAR}。``
 *     两个 `$` 各自落在不同正文片段里，单看片段都不成对，但 remark 是整行解析的，
 *     它俩会配成一对，把中间的代码跨度整段吞进 <math>（反引号随即原样输出）。
 *     所以「落单的 $」在这里直接占位 —— 合法的行内公式一定在同一片段内闭合。
 */
function guardInlineMath(text: string): string {
  if (!text.includes('$')) return text
  let out = ''
  let i = 0
  while (i < text.length) {
    const open = text.indexOf('$', i)
    if (open < 0) {
      out += text.slice(i)
      break
    }
    // $$ 是块级/展示公式的定界符，原样放过
    if (text[open + 1] === '$' || text[open - 1] === '$') {
      out += text.slice(i, open + 1)
      i = open + 1
      continue
    }
    const close = text.indexOf('$', open + 1)
    if (close < 0) {
      out += text.slice(i, open) + DOLLAR_PLACEHOLDER
      i = open + 1
      continue
    }
    const body = text.slice(open + 1, close)
    if (!body.includes('$') && looksLikeMath(body)) {
      out += text.slice(i, close + 1)
    } else {
      out += text.slice(i, open) + DOLLAR_PLACEHOLDER + body + DOLLAR_PLACEHOLDER
    }
    i = close + 1
  }
  return out
}

/** 单行内：区分代码跨度与正文，分别做保护 */
function sanitizeLine(line: string): string {
  const isTableRow = TABLE_ROW_RE.test(line)
  let out = ''
  let rest = line
  for (;;) {
    const m = CODE_SPAN_RE.exec(rest)
    if (!m) {
      out += guardInlineMath(rest)
      return out
    }
    out += guardInlineMath(rest.slice(0, m.index))
    let body = m[2]
    // 代码里的 $ 永远不是公式（${VAR} / $$POSTGRES_USER / $HOME）
    if (body.includes('$')) body = body.replace(/\$/g, DOLLAR_PLACEHOLDER)
    // 表格行内代码里的竖线会切断单元格：转义成 \|（GFM 在表格内会还原为 |）
    if (isTableRow && body.includes('|')) body = body.replace(/(?<!\\)\|/g, '\\|')
    out += `${m[1]}${body}${m[1]}`
    rest = rest.slice(m.index + m[0].length)
  }
}

/**
 * 对整篇 markdown 做预处理。围栏代码块（``` / ~~~）内一律跳过：
 * 那里面的 `$`、`|`、反引号都是要照原样展示的内容。
 */
export function sanitizeMarkdown(markdown: string): string {
  if (!markdown) return markdown
  const lines = markdown.split('\n')
  let inFence = false
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (FENCE_RE.test(line)) {
      inFence = !inFence
      continue
    }
    if (inFence) continue
    if (!line.includes('$') && !line.includes('`')) continue
    lines[i] = sanitizeLine(line)
  }
  return lines.join('\n')
}

/** 渲染后把占位符还原成 $ */
export function restoreMathPlaceholders(html: string): string {
  return html.includes(DOLLAR_PLACEHOLDER) ? html.split(DOLLAR_PLACEHOLDER).join('$') : html
}
