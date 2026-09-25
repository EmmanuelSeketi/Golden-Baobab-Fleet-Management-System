'use client'

import { useEffect } from 'react'
import { useLang } from '@/lib/i18n'
import { ZH } from '@/lib/i18n-dict'

// Tags whose text content must never be translated.
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'CODE', 'PRE'])

/**
 * App-wide client-side localizer. When the language is Chinese it swaps the
 * text of any DOM text node whose trimmed content exactly matches a curated
 * English -> Chinese phrase in the dictionary. Because matching is exact and
 * dictionary-driven, values coming from the database (operator names, machine
 * codes, project names, numbers) are never touched. Toggling back to English
 * restores the original text captured on each node.
 */
export function Localizer() {
  const { lang } = useLang()

  useEffect(() => {
    const root = document.body
    if (!root) return

    // Remembers the original English text for each node we translate so we can
    // restore it when the user switches back to English.
    const originals = new WeakMap<Text, string>()

    function shouldSkip(node: Text): boolean {
      const parent = node.parentElement
      if (!parent) return true
      if (SKIP_TAGS.has(parent.tagName)) return true
      if (parent.closest('[data-no-translate]')) return true
      return false
    }

    function translateNode(node: Text) {
      const raw = node.nodeValue
      if (raw == null) return
      const trimmed = raw.trim()
      if (!trimmed) return
      if (shouldSkip(node)) return

      if (lang === 'zh') {
        const zh = ZH[trimmed]
        if (zh && zh !== trimmed) {
          if (!originals.has(node)) originals.set(node, raw)
          const next = raw.replace(trimmed, zh)
          if (node.nodeValue !== next) node.nodeValue = next
        }
      } else {
        const orig = originals.get(node)
        if (orig != null && node.nodeValue !== orig) {
          node.nodeValue = orig
        }
      }
    }

    function walk(el: Node) {
      const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
      const nodes: Text[] = []
      let n = tw.nextNode()
      while (n) {
        nodes.push(n as Text)
        n = tw.nextNode()
      }
      nodes.forEach(translateNode)
    }

    const observer = new MutationObserver((mutations) => {
      // Disconnect while we mutate so our own text changes don't re-trigger us.
      observer.disconnect()
      for (const m of mutations) {
        if (m.type === 'characterData' && m.target.nodeType === Node.TEXT_NODE) {
          translateNode(m.target as Text)
        }
        m.addedNodes.forEach((an) => {
          if (an.nodeType === Node.TEXT_NODE) translateNode(an as Text)
          else if (an.nodeType === Node.ELEMENT_NODE) walk(an)
        })
      }
      observer.observe(root, { childList: true, subtree: true, characterData: true })
    })

    observer.disconnect()
    walk(root)
    observer.observe(root, { childList: true, subtree: true, characterData: true })

    return () => observer.disconnect()
  }, [lang])

  return null
}
