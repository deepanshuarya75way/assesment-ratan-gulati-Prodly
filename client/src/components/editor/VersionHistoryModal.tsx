import { useEffect, useMemo, useState } from 'react'
import { format, formatDistanceToNow } from 'date-fns'
import { AlertTriangle, History, RotateCcw, Sparkles, PenLine, GitCompare, X } from 'lucide-react'
import { useWorkspaceStore } from '@/lib/store'
import { sanitizeHtml } from '@/lib/sanitize'
import { toast } from '@/lib/toast'
import { diffText, htmlToText, diffCounts } from '@/lib/versionDiff'
import Modal from '@/components/tasks/Modal'

interface Version {
  id: string
  title: string
  content: string
  reason: 'edit' | 'ai' | 'restore'
  authorName: string | null
  createdAt: string
}

const REASON_META = {
  edit:    { label: 'Edited',          icon: PenLine,   color: '#a1a1aa' },
  ai:      { label: 'Before AI change', icon: Sparkles, color: '#a5b4fc' },
  restore: { label: 'Before restore',  icon: RotateCcw, color: '#fcd34d' },
} as const

/** Lists saved versions of a document with a preview, and restores one. */
export default function VersionHistoryModal({ docId, onClose }: { docId: string; onClose: () => void }) {
  const { documents, replaceDocumentContent } = useWorkspaceStore()
  const doc = documents.find((d) => d.id === docId)

  const [versions, setVersions] = useState<Version[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [restoring, setRestoring] = useState(false)
  const [compareIds, setCompareIds] = useState<string[] | null>(null)
  const [showDiff, setShowDiff] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/db/documents/${docId}/versions`)
      .then(async (res) => {
        if (!res.ok) throw new Error('Could not load the version history.')
        return res.json() as Promise<Version[]>
      })
      .then((list) => {
        if (cancelled) return
        setVersions(list)
        setSelectedId(list[0]?.id ?? null)
      })
      .catch((err) => { if (!cancelled) setError(err.message) })
    return () => { cancelled = true }
  }, [docId])

  const selected = versions?.find((v) => v.id === selectedId) ?? null
  const preview = useMemo(() => (selected ? sanitizeHtml(selected.content) : ''), [selected])

  const toggleCompare = (id: string) => 
    setCompareIds((ids) => {
      const list = ids ?? []
      if (list.includes(id)) return list.filter((x) => x !== id)
      return list.length === 2 ? [list[1], id] : [...list, id]
    })
  
  const exitCompare = () => { setCompareIds(null); setShowDiff(false)}

  const comparison = useMemo(() => {
    if(!showDiff || !versions || compareIds?.length !== 2) return null
    const [older, newer] = compareIds.map((id) => versions.find((v) => v.id === id)!).sort((x , y) => x.createdAt.localeCompare(y.createdAt))
    const segs = diffText(htmlToText(older.content), htmlToText(newer.content))
    return { older, newer, segs, counts: diffCounts(segs) }
  }, [showDiff, compareIds, versions])

  const restore = async () => {
    if (!selected) return  
    setRestoring(true)
    try {
      const res = await fetch(`/api/db/documents/${docId}/versions/${selected.id}/restore`, { method: 'POST' })
      if (!res.ok) throw new Error()
      const updated = await res.json()
      replaceDocumentContent(docId, updated.content)
      toast.success(`Restored the version from ${format(new Date(selected.createdAt), 'MMM d, h:mm a')}`)
      onClose()
    } catch {
      toast.error('Could not restore that version. Please try again.')
      setRestoring(false)
    }
  }

  if (!doc) return null

  return (
    <Modal
      title={<span className="flex items-center gap-2"><History size={14} style={{ color: '#818cf8' }} />Version history</span>}
      subtitle={doc.title}
      onClose={onClose}
      width={920}
      footer={
        <>
          <span className="text-[11px]" style={{ color: '#9d9da6' }}>
            Restoring keeps the current content as a version, so you can always go back.
          </span>
          {versions && versions.length >= 2 && (compareIds === null)}
            <button onClick={() => setCompareIds([])} className="ml-auto flex items-center gap-1.5 py-1.5 text-xs" style={{ color: "#c7d2fe"}}>
              <GitCompare size={12} />Compare versions
            </button>
              <>
                <button onClick={exitCompare} className='ml-auto px-3 py-1.5 rounded-md text-xs' style={{color: '#a1a1aa'}}>Cancel compare</button>
                <button onClick={() => setShowDiff(true)} disabled={(compareIds ?? []).length !==2} className='flex items-center gap-1.5 py-1.5 text-xs' style={{ background: '#27272a', color: '#e4e4e7'}}>
                  <GitCompare size={12} />Compare({(compareIds ?? []).length}/2)
                </button>
              </>
          <button onClick={onClose} className="ml-auto px-3 py-1.5 rounded-md text-xs" style={{ color: '#a1a1aa' }}>Close</button>
          <button
            onClick={restore}
            disabled={!selected || restoring}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-xs font-medium disabled:opacity-40"
            style={{ background: '#6366f1', color: '#fff' }}
          >
            <RotateCcw size={12} />
            Restore this version
          </button>
        </>
      }
    >
      {error ? (
        <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
          <AlertTriangle size={22} style={{ color: '#f59e0b' }} />
          <p className="text-sm" style={{ color: '#e4e4e7' }}>{error}</p>
        </div>
      ) : versions === null ? (
        <div className="p-5 space-y-2">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-12 w-full" />)}</div>
      ) : versions.length === 0 ? (
        <div className="px-6 py-14 text-center">
          <p className="text-sm" style={{ color: '#e4e4e7' }}>No saved versions yet</p>
          <p className="text-xs mt-1.5 max-w-sm mx-auto leading-relaxed" style={{ color: '#9d9da6' }}>
            A version is saved before every AI change, and every 10 minutes or so while you edit.
          </p>
        </div>
      ) : (
        <div className="flex" style={{ height: 'min(560px, calc(100vh - 220px))' }}>
          <ul className="w-64 flex-shrink-0 overflow-y-auto border-r py-2" style={{ borderColor: '#27272a' }}>
            {versions.map((v) => {
              const meta = REASON_META[v.reason] ?? REASON_META.edit
              const Icon = meta.icon
              const active = v.id === selectedId
              return (
                <li key={v.id} className='flex items-start'> { compareIds !== null && (
                  <input 
                    type="checkbox"
                    checked={compareIds?.includes(v.id)}
                    onChange={() => toggleCompare(v.id)} className='mt-3 ml-3 accent-indigo-500'
                    ></input>
                  )}
                  <button
                    onClick={() => setSelectedId(v.id)}
                    className="w-full text-left px-4 py-2.5 transition-colors"
                    style={{ background: active ? 'rgba(99,102,241,0.12)' : 'transparent', borderLeft: `2px solid ${active ? '#6366f1' : 'transparent'}` }}
                  >
                    <span className="block text-xs font-medium" style={{ color: active ? '#e0e7ff' : '#d4d4d8' }}>
                      {format(new Date(v.createdAt), 'MMM d, h:mm a')}
                    </span>
                    <span className="flex items-center gap-1 text-[11px] mt-0.5" style={{ color: meta.color }}>
                      <Icon size={10} />
                      {meta.label}
                    </span>
                    <span className="block text-[11px] mt-0.5" style={{ color: '#8a8a93' }}>
                      {v.authorName ? `${v.authorName} · ` : ''}{formatDistanceToNow(new Date(v.createdAt), { addSuffix: true })}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
          <div className="flex-1 overflow-y-auto px-8 py-6">
            {comparison ?
              <div className='flex items-start justify-between gap-4 mb-4'>
                <p className='text-[11px]'>
                  <span>+{comparison.counts.added} words added</span> 
                  <span>.</span>
                  <span>-{comparison.counts.removed} words removed</span>
                </p>
                <button onClick={() => setShowDiff(false)} className='flex items-center gap-1 text-[11px] px-2 py-1 rounded' style={{color: #a1a1aa}}><X size={12}></X>Close comparison
                </button>
                </div>
                <div></div>
                {
                  constructor(parameters) {
                    
                  }
                }
            ) }
            {selected && (
              // Stored HTML is sanitized before previewing
              <div className="editor-prose pointer-events-none select-text" dangerouslySetInnerHTML={{ __html: preview }} />
            )}
          </div>
        </div>
      )}
    </Modal>
  )
}
