export type DiffSeg = { type: 'same' | 'added' | 'removed'; text: string } 

export function htmlToText(html: string): string {
  const withBreaks = html.replace(/<\/(p|h[1-6]|li|blockquote|pre)>|<br\s*\/?>/gi, '\n')
  const text = new DOMParser().parseFromString(withBreaks, 'text/html').body.textContent ?? ''
  return text.replace(/\n{3,}/g, '\n\n').trim()
}

export function diffText(before: string, after: string): DiffSeg[] {
  const a = before.split(/(\s+)/)
  const b = after.split(/(\s+)/)
  const n = a.length
  const m = b.length
  const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1))
  for (let i = n - 1; i >= 0; i--)
    for(let j = m - 1; j >= 0; j--)
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])

  const segs: DiffSeg[] = []
  const push = (type: DiffSeg['type'], text: string) => {
    const last = segs[segs.length - 1]
    if (last?.type === type) last.text += text 
    else segs.push({type, text})
  }
  let i = 0
  let j = 0
  while(i < n && j < m) {
    if (a[i] === b[j]) { push('same', a[i]); i++; j++}
    else if (dp[i+1][j] >= dp[i][j + 1]) push('removed', a[i++])
    else push('added', b[j++])
  }
  while(i<n) push('removed', a[i++])
  while(j<m) push('added', b[j++])
  return segs
}

export function diffCounts(segs: DiffSeg[]) {
  const words = (s: string) => s.split(/\s+/).filter(Boolean).length
  return {
    added: segs.filter((s) => s.type === 'added').reduce((t, s) => t + words(s.text), 0),
    removed: segs.filter((s) => s.type === 'removed').reduce((t,s) => t + words(s.text), 0),
  }
}