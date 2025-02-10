import { EditorState } from "@codemirror/state";
import { useCallback, useEffect } from "react";
import "./editor.css"
import useCodeMirror from "@/uses/useCodeMirror";

type Props = {
  initialDoc: string;
  onChange: (doc: string) => void;
}

export default function Editor(props: Props) {
  const { onChange, initialDoc } = props
  const handleChange = useCallback(
    (state: EditorState) => onChange(state.doc.toString()),
    [onChange]
  )
  const [refContainer, editorView] = useCodeMirror<HTMLDivElement>({
    initialDoc: initialDoc,
    onChange: handleChange
  })

  useEffect(() => {
    if (editorView) {
      // Do nothing for now
    }
  }, [editorView])

  return <div className='editor-wrapper' ref={refContainer}></div>
}