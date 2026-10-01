'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/**
 * Question text is rendered as Markdown with raw HTML disabled (react-markdown does not render
 * HTML unless a rehype-raw plugin is added), so author-supplied content cannot inject scripts.
 */
export function Markdown({ children }: { children: string }) {
  return (
    <div className="prose-q text-sm">
      <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml urlTransform={(url) => (/^(https?:|mailto:|#)/i.test(url) ? url : '')}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
