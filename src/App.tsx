import { SetStateAction, useCallback, useState } from "react";
import "./App.css";
import Editor from "./ux/editor";
import Preview from "./ux/preview";

function App() {
  const [doc, setDoc] = useState<string>('# Hello, World!\n')

  const handleDocChange = useCallback((newDoc: SetStateAction<string>) => {
    setDoc(newDoc);
  }, [])
  
  return <div className="app">
    <Editor initialDoc={doc} onChange={handleDocChange} />
    <Preview doc={doc} />
  </div>
}

export default App;
