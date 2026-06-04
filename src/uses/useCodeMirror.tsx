import { useEffect, useState, useRef } from 'react'
import { EditorState } from '@codemirror/state'
import { EditorView, keymap, highlightActiveLine, lineNumbers, highlightActiveLineGutter } from '@codemirror/view'
import { defaultKeymap, historyKeymap, history } from '@codemirror/commands'
import { bracketMatching, indentOnInput } from '@codemirror/language'
import { tags } from '@lezer/highlight'
import { defaultHighlightStyle, HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { css } from '@codemirror/lang-css'
import { languages } from '@codemirror/language-data'
import { oneDark } from '@codemirror/theme-one-dark'
import type React from 'react'

export const transparentTheme = EditorView.theme({
  '&': {
    backgroundColor: 'transparent !important',
    height: '100%'
  }
})

const mdHeadingSyntax = HighlightStyle.define([
  { tag: tags.heading1, fontSize: '1.6em', fontWeight: 'bold' },
  { tag: tags.heading2, fontSize: '1.4em', fontWeight: 'bold' },
  { tag: tags.heading3, fontSize: '1.2em', fontWeight: 'bold' },
])

interface Props {
  initialDoc: string
  onChange?: (state: EditorState) => void
  language?: 'markdown' | 'css'
}

const useCodeMirror = <T extends Element>(
  props: Props
): [React.MutableRefObject<T | null>, EditorView?] => {
  const refContainer = useRef<T>(null)
  const [editorView, setEditorView] = useState<EditorView>()
  const { onChange, language = 'markdown' } = props

  useEffect(() => {
    if (!refContainer.current) return

    const langExtensions =
      language === 'css'
        ? [css()]
        : [
            markdown({ base: markdownLanguage, codeLanguages: languages, addKeymap: true }),
            syntaxHighlighting(mdHeadingSyntax),
          ]

    const startState = EditorState.create({
      doc: props.initialDoc,
      extensions: [
        keymap.of([...defaultKeymap, ...historyKeymap]),
        lineNumbers(),
        highlightActiveLineGutter(),
        history(),
        indentOnInput(),
        bracketMatching(),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        highlightActiveLine(),
        ...langExtensions,
        oneDark,
        transparentTheme,
        EditorView.lineWrapping,
        EditorView.updateListener.of(update => {
          if (update.docChanged) onChange && onChange(update.state)
        }),
      ],
    })

    const view = new EditorView({ state: startState, parent: refContainer.current })
    setEditorView(view)

    return () => view.destroy()
  }, [refContainer])

  return [refContainer, editorView]
}

export default useCodeMirror
