import Image from "@tiptap/extension-image"
import { ReactNodeViewRenderer } from "@tiptap/react"
import { ResizableImageView } from "./ResizableImageView"

export const ResizableImage = Image.extend({
  name: "resizableImage",

  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        parseHTML: (el) => el.getAttribute("width") || el.style.width || null,
        renderHTML: (attrs) => (attrs.width ? { width: attrs.width } : {}),
      },
      height: {
        default: null,
        parseHTML: (el) => el.getAttribute("height") || el.style.height || null,
        renderHTML: (attrs) => (attrs.height ? { height: attrs.height } : {}),
      },
    }
  },

  addNodeView() {
    return ReactNodeViewRenderer(ResizableImageView)
  },

  draggable: true,
})
