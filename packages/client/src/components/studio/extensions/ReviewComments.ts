/**
 * TipTap extension for rendering review annotations as inline decorations.
 * Uses Decoration.inline() so it doesn't modify the document content.
 */

import { Extension } from "@tiptap/core"
import { Plugin, PluginKey } from "@tiptap/pm/state"
import { Decoration, DecorationSet } from "@tiptap/pm/view"
import type { ReviewAnnotation } from "@/types/chat"

export const reviewCommentsPluginKey = new PluginKey("reviewComments")

function buildDecorations(doc: Parameters<typeof DecorationSet.create>[0], annotations: ReviewAnnotation[]): DecorationSet {
  const decorations: Decoration[] = []
  const text = doc.textContent

  for (const ann of annotations) {
    if (!ann.quote) continue

    // Find the quote in the document text
    const idx = text.indexOf(ann.quote)
    if (idx === -1) continue

    // ProseMirror positions are offset by 1 (doc node wraps)
    const from = idx + 1
    const to = from + ann.quote.length

    // Clamp to valid range
    if (from < 0 || to > doc.content.size) continue

    const severityClass = {
      suggestion: "review-suggestion",
      warning: "review-warning",
      issue: "review-issue",
    }[ann.severity] || "review-suggestion"

    decorations.push(
      Decoration.inline(from, to, {
        class: `review-highlight ${severityClass}`,
        "data-annotation-id": ann.id,
      })
    )
  }

  return DecorationSet.create(doc, decorations)
}

export const ReviewCommentsExtension = Extension.create({
  name: "reviewComments",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: reviewCommentsPluginKey,
        state: {
          init(_, { doc }) {
            return {
              annotations: [] as ReviewAnnotation[],
              decorations: DecorationSet.empty,
            }
          },
          apply(tr, state) {
            const newAnnotations = tr.getMeta(reviewCommentsPluginKey)
            if (newAnnotations !== undefined) {
              return {
                annotations: newAnnotations as ReviewAnnotation[],
                decorations: buildDecorations(tr.doc, newAnnotations as ReviewAnnotation[]),
              }
            }
            if (tr.docChanged) {
              return {
                annotations: state.annotations,
                decorations: buildDecorations(tr.doc, state.annotations),
              }
            }
            return state
          },
        },
        props: {
          decorations(state) {
            return this.getState(state)?.decorations ?? DecorationSet.empty
          },
        },
      }),
    ]
  },
})
