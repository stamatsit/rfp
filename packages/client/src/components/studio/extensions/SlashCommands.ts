import { Extension } from "@tiptap/core"
import { type Editor } from "@tiptap/react"
import Suggestion, { type SuggestionOptions } from "@tiptap/suggestion"
import { PluginKey } from "@tiptap/pm/state"

export interface SlashCommandItem {
  id: string
  label: string
  description: string
  icon: string
  category: "blocks" | "insert" | "ai"
  action: (editor: Editor) => void
}

export type SlashCommandCallback = (id: string) => void

const slashCommandPluginKey = new PluginKey("slashCommands")

export function createSlashCommandItems(callbacks?: {
  onOpenPhotos?: () => void
  onOpenTemplates?: () => void
  onOpenQALibrary?: () => void
  onImportFile?: () => void
}): SlashCommandItem[] {
  return [
    {
      id: "heading1",
      label: "Heading 1",
      description: "Large section heading",
      icon: "H1",
      category: "blocks",
      action: (editor) => editor.chain().focus().toggleHeading({ level: 1 }).run(),
    },
    {
      id: "heading2",
      label: "Heading 2",
      description: "Medium section heading",
      icon: "H2",
      category: "blocks",
      action: (editor) => editor.chain().focus().toggleHeading({ level: 2 }).run(),
    },
    {
      id: "heading3",
      label: "Heading 3",
      description: "Small section heading",
      icon: "H3",
      category: "blocks",
      action: (editor) => editor.chain().focus().toggleHeading({ level: 3 }).run(),
    },
    {
      id: "bullet-list",
      label: "Bullet List",
      description: "Unordered list",
      icon: "•",
      category: "blocks",
      action: (editor) => editor.chain().focus().toggleBulletList().run(),
    },
    {
      id: "ordered-list",
      label: "Numbered List",
      description: "Ordered list",
      icon: "1.",
      category: "blocks",
      action: (editor) => editor.chain().focus().toggleOrderedList().run(),
    },
    {
      id: "table",
      label: "Table",
      description: "Insert a table",
      icon: "⊞",
      category: "blocks",
      action: (editor) => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
    },
    {
      id: "blockquote",
      label: "Blockquote",
      description: "Indented quote block",
      icon: "❝",
      category: "blocks",
      action: (editor) => editor.chain().focus().toggleBlockquote().run(),
    },
    {
      id: "divider",
      label: "Divider",
      description: "Horizontal rule",
      icon: "—",
      category: "blocks",
      action: (editor) => editor.chain().focus().setHorizontalRule().run(),
    },
    // Insert items (trigger modals via callbacks)
    ...(callbacks?.onOpenPhotos ? [{
      id: "image",
      label: "Image",
      description: "Insert a photo",
      icon: "🖼",
      category: "insert" as const,
      action: () => callbacks.onOpenPhotos!(),
    }] : []),
    ...(callbacks?.onImportFile ? [{
      id: "import",
      label: "Import File",
      description: "Import PDF, Word, or text",
      icon: "📄",
      category: "insert" as const,
      action: () => callbacks.onImportFile!(),
    }] : []),
    ...(callbacks?.onOpenTemplates ? [{
      id: "template",
      label: "Template",
      description: "Use a template",
      icon: "📋",
      category: "insert" as const,
      action: () => callbacks.onOpenTemplates!(),
    }] : []),
    ...(callbacks?.onOpenQALibrary ? [{
      id: "qa-library",
      label: "Q&A Library",
      description: "Insert from Q&A",
      icon: "📖",
      category: "insert" as const,
      action: () => callbacks.onOpenQALibrary!(),
    }] : []),
  ]
}

export const SlashCommands = Extension.create({
  name: "slashCommands",

  addOptions() {
    return {
      suggestion: {
        char: "/",
        startOfLine: false,
        pluginKey: slashCommandPluginKey,
        command: ({ editor, range, props }: { editor: Editor; range: { from: number; to: number }; props: SlashCommandItem }) => {
          // Delete the slash + typed characters first
          editor.chain().focus().deleteRange(range).run()
          // Execute the command action
          props.action(editor)
        },
      } as Partial<SuggestionOptions>,
    }
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        ...this.options.suggestion,
      }),
    ]
  },
})
