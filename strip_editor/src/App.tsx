import { EditorShell } from './components/EditorShell'
import { FilePicker } from './components/FilePicker'
import { useEditorStore } from './store/useEditorStore'

export default function App(): React.ReactElement {
  const filePath = useEditorStore((s) => s.filePath)
  return filePath ? <EditorShell /> : <FilePicker />
}
