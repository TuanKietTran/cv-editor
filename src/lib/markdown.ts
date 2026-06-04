import MarkdownIt from 'markdown-it'
import markdownItAttrs from 'markdown-it-attrs'

function fencedDivs(md: MarkdownIt): void {
  md.block.ruler.before('fence', 'fenced_div', (state: any, startLine: number, endLine: number, silent: boolean): boolean => {
    const start = state.bMarks[startLine] + state.tShift[startLine]
    const end   = state.eMarks[startLine]
    const line  = state.src.slice(start, end)
    const m = /^:::(\w[\w-]*)/.exec(line)
    if (!m) return false
    if (silent) return true
    const name = m[1]
    let depth = 1, closeLine = -1
    for (let i = startLine + 1; i < endLine; i++) {
      const ls = state.bMarks[i] + state.tShift[i]
      const le = state.eMarks[i]
      const l  = state.src.slice(ls, le).trim()
      if (/^:::\w/.test(l)) depth++
      else if (l === ':::' && --depth === 0) { closeLine = i; break }
    }
    if (closeLine < 0) return false
    const savedLineMax = state.lineMax
    state.lineMax = closeLine
    const open = state.push('html_block', '', 0)
    open.content = `<div class="${name}">\n`
    open.map     = [startLine, closeLine + 1]
    state.md.block.tokenize(state, startLine + 1, closeLine)
    const close = state.push('html_block', '', 0)
    close.content = '</div>\n'
    state.lineMax = savedLineMax
    state.line    = closeLine + 1
    return true
  }, { alt: ['paragraph', 'reference', 'blockquote', 'list'] })
}

const md = new MarkdownIt({ html: true, linkify: true, typographer: true })
  .use(markdownItAttrs)
  .use(fencedDivs)

export function render(src: string): string {
  return md.render(src)
}
