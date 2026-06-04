import { EditorState } from "@codemirror/state";
import { useCallback } from "react";
import "./editor.css"
import useCodeMirror from "@/uses/useCodeMirror";

type Props = {
  initialDoc: string;
  onChange: (doc: string) => void;
  language?: 'markdown' | 'css';
}

export default function Editor({ initialDoc, onChange, language = 'markdown' }: Props) {
  const handleChange = useCallback(
    (state: EditorState) => onChange(state.doc.toString()),
    [onChange]
  )
  const [refContainer] = useCodeMirror<HTMLDivElement>({
    initialDoc,
    onChange: handleChange,
    language,
  })

  return <div className='editor-wrapper' ref={refContainer}></div>
}