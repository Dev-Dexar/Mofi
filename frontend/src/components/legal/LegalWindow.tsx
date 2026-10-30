import CenterWindow from '@/components/ui/CenterWindow'
import type { LegalDoc } from './legal'

/** Terms and privacy, in the same window as everything else (a plain fade and scale: one element, nothing to copy or redraw per frame).
 *  `source` (the link that was clicked) is no longer needed; callers may still pass it. */
export default function LegalWindow({ doc, onClosed }: { doc: LegalDoc; source?: HTMLElement; onClosed: () => void }) {
  return (
    <CenterWindow title={doc.title} onClosed={onClosed}>
      {doc.body ?? (
        <div>
          <h3 className="text-2xl font-black tracking-tight text-text sm:text-3xl">{doc.title}</h3>
          <p className="mt-3 text-sm leading-relaxed text-muted">This document is being finalised and will be published here before launch.</p>
        </div>
      )}
    </CenterWindow>
  )
}
