'use client'

import { useEffect } from 'react'
import { useLang } from '@/lib/i18n'
import { ZH } from '@/lib/i18n-dict'

// Tags whose text content must never be translated.
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'CODE', 'PRE'])
const TRANSLATABLE_ATTRIBUTES = ['placeholder', 'aria-label', 'title'] as const
const originalText = new WeakMap<Text, string>()
const originalAttributes = new WeakMap<Element, Map<(typeof TRANSLATABLE_ATTRIBUTES)[number], string>>()

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
        const saved = originalText.get(node)
        const savedTranslation = saved ? ZH[saved.trim()] : undefined
        if (saved == null || (raw !== saved && trimmed !== savedTranslation)) {
          originalText.set(node, raw)
        }
        const source = originalText.get(node) ?? raw
        const sourceTrimmed = source.trim()
        const zh = ZH[sourceTrimmed]
        if (zh && zh !== sourceTrimmed) {
          const next = source.replace(sourceTrimmed, zh)
          if (node.nodeValue !== next) node.nodeValue = next
        }
      } else {
        const orig = originalText.get(node)
        if (orig != null && raw !== orig) {
          if (trimmed === ZH[orig.trim()]) node.nodeValue = orig
          else originalText.set(node, raw)
        }
      }
    }

    function shouldSkipElement(element: Element): boolean {
      return SKIP_TAGS.has(element.tagName) || element.closest('[data-no-translate]') !== null
    }

    function translateAttribute(element: Element, attribute: (typeof TRANSLATABLE_ATTRIBUTES)[number]) {
      if (shouldSkipElement(element)) return
      const raw = element.getAttribute(attribute)
      if (raw == null || !raw.trim()) return

      let originals = originalAttributes.get(element)
      if (!originals) {
        originals = new Map()
        originalAttributes.set(element, originals)
      }

      if (lang === 'zh') {
        const saved = originals.get(attribute)
        const savedTranslation = saved ? ZH[saved.trim()] : undefined
        if (saved == null || (raw !== saved && raw.trim() !== savedTranslation)) {
          originals.set(attribute, raw)
        }
        const source = originals.get(attribute) ?? raw
        const sourceTrimmed = source.trim()
        const zh = ZH[sourceTrimmed]
        if (zh && zh !== sourceTrimmed) element.setAttribute(attribute, source.replace(sourceTrimmed, zh))
      } else {
        const original = originals.get(attribute)
        if (original != null && raw !== original) {
          if (raw.trim() === ZH[original.trim()]) element.setAttribute(attribute, original)
          else originals.set(attribute, raw)
        }
      }
    }

    function walk(el: Node) {
      if (el.nodeType === Node.ELEMENT_NODE) {
        const element = el as Element
        TRANSLATABLE_ATTRIBUTES.forEach((attribute) => translateAttribute(element, attribute))
        element.querySelectorAll('*').forEach((child) => {
          TRANSLATABLE_ATTRIBUTES.forEach((attribute) => translateAttribute(child, attribute))
        })
      }
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
        } else if (m.type === 'attributes' && m.target.nodeType === Node.ELEMENT_NODE) {
          const attribute = m.attributeName
          if (TRANSLATABLE_ATTRIBUTES.includes(attribute as (typeof TRANSLATABLE_ATTRIBUTES)[number])) {
            translateAttribute(m.target as Element, attribute as (typeof TRANSLATABLE_ATTRIBUTES)[number])
          }
        }
        m.addedNodes.forEach((an) => {
          if (an.nodeType === Node.TEXT_NODE) translateNode(an as Text)
          else if (an.nodeType === Node.ELEMENT_NODE) walk(an)
        })
      }
      observer.observe(root, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: [...TRANSLATABLE_ATTRIBUTES] })
    })

    observer.disconnect()
    walk(root)
    observer.observe(root, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: [...TRANSLATABLE_ATTRIBUTES] })

    return () => observer.disconnect()
  }, [lang])

  return null
}
