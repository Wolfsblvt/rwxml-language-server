import { Def, Document, Element, Injectable, Node, Text } from '@rwxml/analyzer'
import { AsEnumerable } from 'linq-es2015'
import _ from 'lodash'
import { Range } from '@rwxml/analyzer'
import { MultiDictionary } from 'typescript-collections'
import { CompletionItem, CompletionItemKind, TextEdit, Command, CompletionList } from 'vscode-languageserver'
import { getMatchingText } from '../../data-structures/trie-ext'
import { Project } from '../../project'
import { isPointingOpenTagName, makeTagNode } from '../utils/node'
import { RangeConverter } from '../../utils/rangeConverter'
import { injectable } from 'tsyringe'
import { CodeCompletionContributor } from './contributor'

@injectable()
export class OpenTagCompletion implements CodeCompletionContributor {
  private defs: MultiDictionary<string, string> = new MultiDictionary()

  constructor(private readonly rangeConverter: RangeConverter) {}

  getCompletion(project: Project, node: Node, offset: number): CompletionList | null {
    if (!this.shouldSuggestTagNames(node, offset)) {
      return null
    }

    const textEditRange = this.getTextEditRange(node, offset, this.rangeConverter)
    if (!textEditRange) {
      return null
    }

    // Element (<Defs> node), Def, Injectable or nothing
    const parent: Def | Injectable | Element | null = node.parent as unknown as Def | Injectable | null
    if (!(parent instanceof Def || parent instanceof Injectable || parent instanceof Element)) {
      return null
    }

    const nodeName = node instanceof Element ? node.name : '' // node name is '' when type is Text

    if (parent instanceof Element && parent.name === 'Defs') {
      // completes defType
      const tags = this.getDefNames(project)
      const completions = getMatchingText(tags, nodeName)

      return this.toCompletionList(node, offset, this.rangeConverter, node.document, completions)
    } else if (parent instanceof Def || parent instanceof Injectable) {
      if (parent.typeInfo.isList() || parent.typeInfo.isDictionary() || parent.typeInfo.isEnumFlag()) {
        return this.toCompletionList(node, offset, this.rangeConverter, node.document, ['li'])
      } else {
        const childNodes = AsEnumerable(parent.ChildElementNodes)
          .Where((e) => e instanceof Injectable)
          .Select((e) => e.name)
          .ToArray()

        const candidates = _.difference(parent.typeInfo.getFieldNames(), childNodes)
        const completions = getMatchingText(candidates, nodeName)

        return this.toCompletionList(node, offset, this.rangeConverter, node.document, completions)
      }
    }

    return null
  }

  private shouldSuggestTagNames(node: Node, offset: number): node is Element | Text {
    // if (node instanceof Element && node.openTagNameRange.include(offset)) {
    //   // <ta|... Key="Value"...>
    //   return true
    // } else if (node instanceof Text) {
    //   if (
    //     node.nodeRange.include(offset) && // is inside text range?
    //     isDefOrInjectable(node.parent) &&
    //     !node.parent.leafNode
    //   ) {
    //     return true
    //   }
    // }

    if (node instanceof Element || node instanceof Text) {
      return isPointingOpenTagName(node, offset)
    }

    return false
  }

  private getTextEditRange(node: Element | Text, offset: number, converter: RangeConverter) {
    const range = node instanceof Element ? node.openTagNameRange.clone() : new Range(offset, offset)

    const textEditRange = converter.toLanguageServerRange(range, node.document.uri)
    return textEditRange
  }

  private getDefNames(project: Project) {
    let cached = this.defs.getValue(project.version)

    if (cached.length === 0) {
      const values = AsEnumerable(project.defManager.typeInfoMap.getAllNodes())
        .Where((t) => !!t.getDefType())
        .Select((t) => t.getDefType() as string)
        .ToArray()

      for (const value of values) {
        this.defs.setValue(project.version, value)
      }

      cached = this.defs.getValue(project.version)
    }

    return cached
  }

  private toCompletionList(
    node: Text | Element,
    offset: number,
    converter: RangeConverter,
    document: Document,
    labels: string[]
  ): CompletionList {
    return {
      isIncomplete: false,
      items: AsEnumerable(labels)
        .Select((label) => this.makeCompletionItem(node, label, offset, converter, document))
        .Where((item) => item !== null)
        .ToArray() as CompletionItem[],
    }
  }

  private makeCompletionItem(
    node: Text | Element,
    label: string,
    offset: number,
    converter: RangeConverter,
    document: Document
  ): CompletionItem | null {
    const editRange = this.getTextEditRange(node, offset, converter)

    const additionalTextEdits: TextEdit[] = []

    // 텍스트가 삽입되면, <foo>...</foo>| <- 이부분에 커서가 위치한다.
    const tagNode = makeTagNode(label)
    const cursorCommand = Command.create('cursorMove', 'cursorMove', {
      to: 'left',
      value: label.length + 3, // < + / + (label.length) + >
      by: 'character',
    })

    // textEdit will be ignored if range starts before cursor position
    if (node instanceof Element) {
      // delete <
      const range = converter.toLanguageServerRange(
        new Range(node.openTagRange.start, node.openTagRange.start + 1),
        document.uri
      )
      if (range) {
        additionalTextEdits.push(TextEdit.del(range))
      }
    } else if (node instanceof Text) {
      // delete <
      if (document.getCharAt(offset - 1) === '<') {
        const range = converter.toLanguageServerRange(new Range(offset - 1, offset), document.uri)
        if (range) {
          additionalTextEdits.push(TextEdit.del(range))
        }
      }
    }

    if (editRange) {
      return {
        label,
        kind: CompletionItemKind.Field,
        textEdit: TextEdit.replace(editRange, tagNode),
        additionalTextEdits,
        command: cursorCommand,
      }
    } else {
      return null
    }
  }
}
