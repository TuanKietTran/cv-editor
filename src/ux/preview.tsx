import React from "react";
import { unified } from "unified";
import remarkParse from "remark-parse";
import rehypeReact from "rehype-react";
import remarkGfm from "remark-gfm";
import { defaultSchema } from "hast-util-sanitize";
import RemarkCode from "./remark/remark-code";
import remark2Rehype from 'remark-rehype'
import * as prod from "react/jsx-runtime";
import "./preview.css";
import "github-markdown-css/github-markdown.css";

interface Props {
  doc: string;
}

const schema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    code: [...(defaultSchema.attributes?.code || []), "className"],
  },
};

export default function Preview(props: Props) {
  const md = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remark2Rehype)
    .use(rehypeReact, {
      Fragment: prod.Fragment,
      jsx: prod.jsx,
      jsxs: prod.jsxs,
      createElement: React.createElement,
      sanitize: schema,
      remarkReactComponents: {
        code: RemarkCode,
      },
    })
    .processSync(props.doc).result;
  return <div className="preview markdown-body">{md}</div>;
}
