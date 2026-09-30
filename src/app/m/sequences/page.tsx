import SequencesPage from '@/app/dashboard/sequences/page'
import { MobileActionEditorShell } from '@/components/mobile/action-editor-shell'

// Use the complete editor (including AI mode) rather than a second legacy-only form.
export default function MobileSequencesPage() {
  return <MobileActionEditorShell><SequencesPage /></MobileActionEditorShell>
}
