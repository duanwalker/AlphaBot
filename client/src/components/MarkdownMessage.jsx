import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import 'highlight.js/styles/github-dark.css';

const components = {
  p: ({ children }) => (
    <p style={{ margin: '6px 0', lineHeight: 1.65, color: 'var(--text-main)' }}>
      {children}
    </p>
  ),

  strong: ({ children }) => (
    <strong style={{ color: 'var(--accent)', fontWeight: 600 }}>
      {children}
    </strong>
  ),

  h1: ({ children }) => (
    <h1 style={{ fontSize: 18, fontWeight: 700, margin: '16px 0 8px', color: 'var(--text-main)' }}>
      {children}
    </h1>
  ),

  h2: ({ children }) => (
    <h2 style={{
      fontSize: 15,
      fontWeight: 600,
      margin: '14px 0 6px',
      color: 'var(--text-main)',
      paddingBottom: 4,
      borderBottom: '1px solid rgba(255,255,255,0.08)',
    }}>
      {children}
    </h2>
  ),

  h3: ({ children }) => (
    <h3 style={{ fontSize: 13, fontWeight: 600, margin: '10px 0 4px', color: 'var(--accent)' }}>
      {children}
    </h3>
  ),

  ul: ({ children }) => (
    <ul style={{ margin: '8px 0', paddingLeft: 20, listStyleType: 'disc' }}>
      {children}
    </ul>
  ),

  ol: ({ children }) => (
    <ol style={{ margin: '8px 0', paddingLeft: 20 }}>
      {children}
    </ol>
  ),

  li: ({ children }) => (
    <li style={{ margin: '4px 0', lineHeight: 1.6, color: 'var(--text-main)' }}>
      {children}
    </li>
  ),

  table: ({ children }) => (
    <table style={{
      width: '100%',
      borderCollapse: 'collapse',
      margin: '12px 0',
      fontSize: 13,
    }}>
      {children}
    </table>
  ),

  thead: ({ children }) => (
    <thead style={{
      background: 'rgba(99,102,241,0.15)',
      borderBottom: '1px solid rgba(99,102,241,0.4)',
    }}>
      {children}
    </thead>
  ),

  th: ({ children }) => (
    <th style={{
      padding: '8px 12px',
      textAlign: 'left',
      fontWeight: 600,
      color: 'var(--accent)',
      whiteSpace: 'nowrap',
    }}>
      {children}
    </th>
  ),

  td: ({ children }) => (
    <td style={{
      padding: '7px 12px',
      borderBottom: '1px solid rgba(255,255,255,0.06)',
    }}>
      {children}
    </td>
  ),

  tr: ({ children, ...props }) => (
    <tr
      style={{ transition: 'background 0.1s' }}
      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; }}
      onMouseLeave={e => { e.currentTarget.style.background = ''; }}
      {...props}
    >
      {children}
    </tr>
  ),

  code: ({ inline, children, ...props }) => {
    if (inline) {
      return (
        <code style={{
          background: 'rgba(99,102,241,0.15)',
          padding: '2px 5px',
          borderRadius: 4,
          fontFamily: 'monospace',
          fontSize: 12,
          color: '#a5b4fc',
        }} {...props}>
          {children}
        </code>
      );
    }
    return (
      <code style={{ fontFamily: 'monospace', fontSize: 12 }} {...props}>
        {children}
      </code>
    );
  },

  pre: ({ children }) => (
    <pre style={{
      background: 'rgba(0,0,0,0.4)',
      borderLeft: '3px solid var(--accent)',
      borderRadius: 6,
      padding: '12px 14px',
      margin: '10px 0',
      overflow: 'auto',
      fontSize: 12,
    }}>
      {children}
    </pre>
  ),

  blockquote: ({ children }) => (
    <blockquote style={{
      borderLeft: '3px solid rgba(99,102,241,0.6)',
      margin: '10px 0',
      padding: '8px 14px',
      background: 'rgba(99,102,241,0.08)',
      borderRadius: '0 6px 6px 0',
      color: 'var(--text-muted)',
      fontStyle: 'italic',
    }}>
      {children}
    </blockquote>
  ),

  hr: () => (
    <hr style={{
      border: 'none',
      borderTop: '1px solid rgba(255,255,255,0.08)',
      margin: '14px 0',
    }} />
  ),

  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      style={{ color: 'var(--accent)', textDecoration: 'underline', textUnderlineOffset: 2 }}
    >
      {children}
    </a>
  ),
};

export default function MarkdownMessage({ text }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeHighlight]}
      components={components}
    >
      {text}
    </ReactMarkdown>
  );
}
