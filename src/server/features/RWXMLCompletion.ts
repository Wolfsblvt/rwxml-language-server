import { TextDocument, Position, Range } from 'vscode-languageserver-textdocument';
import { XMLDocument, Node } from '../parser/XMLParser';
import { CompletionList, CompletionItem } from 'vscode-languageserver';
import { createScanner } from '../parser/XMLScanner';
import { TokenType, ScannerState, Scanner } from '../htmlLanguageTypes';
import { TypeInfo, isTypeNode } from '../RW/TypeInfo'

export class RWXMLCompletion {
	doComplete(document: TextDocument, position: Position, XMLDocument: XMLDocument): CompletionList {
		const result: CompletionList = {
			isIncomplete: false,
			items: []
		}

		function scanNextForEndPos(nextToken: TokenType): number {
			if (offset === scanner.getTokenEnd()) {
				token = scanner.scan()
				if(token === nextToken && scanner.getTokenOffset() === offset) {
					return scanner.getTokenEnd()
				}
			}
			return offset
		}

		function getReplaceRange(replaceStart: number, replaceEnd: number = offset): Range {
			if (replaceStart > offset) {
				replaceStart = offset;
			}
			return { start: document.positionAt(replaceStart), end: document.positionAt(replaceEnd) }
		}

		function collectDefNodeValueSuggestions(contentOffset: number, tagNameEnd?: number ): CompletionList {
			const range = getReplaceRange(contentOffset, tagNameEnd)
			const result: CompletionList = {
				isIncomplete: false,
				items: []
			}
			const node = XMLDocument.findNodeAt(contentOffset)
			if(isTypeNode(node)) {
				const typeInfo = node.typeInfo
				if(typeInfo.leafNodeCompletions) {
					result.items.push(...typeInfo.leafNodeCompletions)
				}
			}
			return result
		}

		function collectOpenDefNameTagSuggestions(afterOpenBracket: number, tagNameEnd?: number): CompletionList {
			const range = getReplaceRange(afterOpenBracket, tagNameEnd)
			// fill
			const result: CompletionList = {
				isIncomplete: false,
				items: []
			}
			const node = XMLDocument.findNodeBefore(afterOpenBracket)
			const parentNode = node.closed ? node.parent : XMLDocument.findNodeBefore(node.start)
			if(isTypeNode(parentNode)) {
				const typeInfo = parentNode.typeInfo
				if(typeInfo.childNodes) {
					const nodes = [...typeInfo.childNodes.keys()].map<CompletionItem>(name => ({ label: name }))
					result.items.push(...nodes)
				}
				if(typeInfo.suggestedAttributes) {
					result.items.push(...typeInfo.suggestedAttributes)
				}
			}
			return result
		}

		const text = document.getText()
		const offset = document.offsetAt(position) // line + offset 을 text offset으로 변경

		const node = XMLDocument.findNodeAt(offset)
		const node2 = XMLDocument.findNodeBefore(offset)

		const scanner = createScanner(text, node.start)
		let currentTag = ''
		let currentAttributeName: string;

		let token = scanner.scan()

		while (token !== TokenType.EOS && scanner.getTokenOffset() <= offset) {
			switch (token) {
				case TokenType.StartTagOpen:
					if(scanner.getTokenEnd() === offset) { // <
						const endPos = scanNextForEndPos(TokenType.StartTag)
						return collectOpenDefNameTagSuggestions(offset, endPos)
					}
					break
				case TokenType.StartTag:
					if(scanner.getTokenOffset() <= offset && offset <= scanner.getTokenEnd()) { // 현재 offset이 token 의 중간일경우
						return collectOpenDefNameTagSuggestions(scanner.getTokenOffset(), scanner.getTokenEnd())
					}
					currentTag = scanner.getTokenText()
					break
				case TokenType.DelimiterAssign: // ????
					break
				case TokenType.AttributeValue:
					break
				case TokenType.Whitespace:
					switch (scanner.getScannerState()) {
						case ScannerState.WithinTag:
						case ScannerState.AfterAttributeName:
							break
					}
					break
				case TokenType.EndTagOpen:
					if (offset <= scanner.getTokenEnd()) {

					}
					break
				case TokenType.EndTag:
					break
				case TokenType.StartTagClose:
					break
				case TokenType.Content:
					if(scanner.getTokenOffset() <= offset && offset <= scanner.getTokenEnd()) {
						return collectDefNodeValueSuggestions(scanner.getTokenOffset(), scanner.getTokenEnd())
					}
					break
				default:
					break
			}
			token = scanner.scan()
		}

		return result
	}
}