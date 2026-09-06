import MarkdownIt from 'markdown-it'
const markdown = new MarkdownIt({ html: false, breaks: false, linkify: true })
/** Shared by the actual page footer and its administrative preview. */
export const renderFooterMarkdown = (content: string): string => markdown.renderInline(content)
