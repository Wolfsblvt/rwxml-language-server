import { createScanner, Scanner } from './XMLScanner'
import { XMLDocument } from './XMLDocument'
import { XMLNode } from './XMLNode'
import { TokenType } from './TokenType'
import { Range } from '../types'
import { Writable } from '../utils/types'

export class XMLParser {
  private scanner: Scanner
  private xmlDocument!: Writable<XMLDocument>
  private curr!: Writable<XMLNode>
  private endTagStart = -1
  private endTagName?: string
  private pendingAttribute: string | null = null
  private token: TokenType

  private parsed = false

  constructor(private rawXML: string) {
    this.scanner = createScanner(this.rawXML, undefined, undefined, true)
    this.token = TokenType.Unknown
  }

  parse() {
    if (!this.parsed) {
      this.xmlDocument = this.createXMLDocument()
      this.curr = this.xmlDocument

      while (this.token != TokenType.EOS) {
        this.scan()
        this.token = this.scanner.scan()
      }
    }

    return this.xmlDocument
  }

  private scan() {
    switch (this.token) {
      case TokenType.XMLDeclaration: {
        this.xmlDocument.rawXMLDefinition = this.scanner.getTokenText()
        break
      }
      case TokenType.StartTagOpen: {
        // create child and assign some values
        const child = new XMLNode() as Writable<XMLNode>
        child.document = this.xmlDocument
        child.parent = this.curr

        Object.assign<Range, Range>(child.elementRange, {
          start: this.scanner.getTokenOffset(),
          end: this.xmlDocument.rawXML.length,
        })
        child.document = this.xmlDocument
        this.curr.children.push(child)
        this.curr = child
        break
      }
      case TokenType.StartTag: {
        this.curr.tagNameRange.start = this.scanner.getTokenOffset()
        this.curr.tagNameRange.end = this.scanner.getTokenEnd()
        this.curr.name = this.scanner.getTokenText()
        break
      }
      case TokenType.StartTagClose: {
        if (this.curr.parent) {
          this.curr.elementRange.end = this.scanner.getTokenEnd() // might be later set to end tag position
          if (this.scanner.getTokenLength() > 0) {
            this.curr.startTagRange.end = this.scanner.getTokenEnd()
          }
        }
        break
      }
      case TokenType.StartTagSelfClose: {
        if (this.curr.parent) {
          this.curr.validNode = true
          const tokenEndIndex = this.scanner.getTokenEnd()
          this.curr.elementRange.end = tokenEndIndex
          this.curr.startTagRange.end = tokenEndIndex
          this.curr.selfClosed = true
          this.curr = this.curr.parent
        }
        break
      }
      case TokenType.EndTagOpen: {
        this.endTagStart = this.scanner.getTokenOffset()
        this.endTagName = undefined
        break
      }
      case TokenType.EndTag: {
        this.endTagName = this.scanner.getTokenText()
        break
      }
      case TokenType.EndTagClose: {
        if (this.endTagName) {
          let node = this.curr

          // see if we can find a matching
          while (!node.equalTag(this.endTagName) && node.parent) {
            node = node.parent
          }

          if (node.parent !== undefined) {
            while (this.curr !== node) {
              this.curr.elementRange.end = this.endTagStart
              this.curr.validNode = false
              // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
              this.curr = this.curr.parent!
            }

            this.curr.validNode = true
            this.curr.endTagRange.start = this.endTagStart
            this.curr.elementRange.end = this.scanner.getTokenEnd()
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            this.curr = this.curr.parent!
          } else {
            // ignore closing tag </tag>
          }
        }
        break
      }
      case TokenType.AttributeName: {
        this.pendingAttribute = this.scanner.getTokenText()
        // Support valueless attributes such as 'checked'
        this.curr.attributes[this.pendingAttribute] = null
        break
      }
      case TokenType.AttributeValue: {
        let value = this.scanner.getTokenText()
        if (value.length >= 2) {
          // remove encapsulating text '' or ""
          value = value.substring(1, value.length - 1)
        }

        const attributes = this.curr.attributes
        if (this.pendingAttribute !== null) {
          attributes[this.pendingAttribute] = value
          this.pendingAttribute = null
        }
        break
      }
      case TokenType.Content: {
        this.curr.contentRange.start = this.scanner.getTokenOffset()
        this.curr.contentRange.end = this.scanner.getTokenEnd()
        this.curr.content = this.scanner.getTokenText()
        break
      }
    }
  }

  private createXMLDocument() {
    const document = new XMLNode() as XMLDocument
    Object.assign<XMLDocument, Partial<XMLDocument>>(document, { rawXML: this.rawXML, document })

    return document
  }
}