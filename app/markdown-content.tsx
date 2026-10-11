"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";

const components: Components = {
  // Render p as <p> (default), not as fragment
  p: ({ children }) => <p className="md-p">{children}</p>,
  // Headings
  h1: ({ children }) => <h1 className="md-h1">{children}</h1>,
  h2: ({ children }) => <h2 className="md-h2">{children}</h2>,
  h3: ({ children }) => <h3 className="md-h3">{children}</h3>,
  // Lists
  ul: ({ children }) => <ul className="md-ul">{children}</ul>,
  ol: ({ children }) => <ol className="md-ol">{children}</ol>,
  li: ({ children }) => <li className="md-li">{children}</li>,
  // Code
  code: ({ className, children, ...rest }) => {
    const isInline = !className;
    if (isInline) return <code className="md-code-inline">{children}</code>;
    return (
      <pre className="md-pre">
        <code className={className} {...rest}>
          {children}
        </code>
      </pre>
    );
  },
  // Tables
  table: ({ children }) => (
    <div className="md-table-wrapper">
      <table className="md-table">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="md-thead">{children}</thead>,
  tbody: ({ children }) => <tbody className="md-tbody">{children}</tbody>,
  tr: ({ children }) => <tr className="md-tr">{children}</tr>,
  th: ({ children }) => <th className="md-th">{children}</th>,
  td: ({ children }) => <td className="md-td">{children}</td>,
  // Blockquote
  blockquote: ({ children }) => <blockquote className="md-blockquote">{children}</blockquote>,
  // Horizontal rule
  hr: () => <hr className="md-hr" />,
  // Strong / emphasis
  strong: ({ children }) => <strong>{children}</strong>,
  em: ({ children }) => <em>{children}</em>,
};

export default function MarkdownContent({ content }: { content: string }) {
  return (
    <ReactMarkdown components={components} remarkPlugins={[remarkGfm]}>
      {content}
    </ReactMarkdown>
  );
}
