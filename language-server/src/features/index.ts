import _ from 'lodash'
import * as lsp from 'vscode-languageserver'
import { URI } from 'vscode-uri'
import { XMLDocumentDecoItemRequest, XMLDocumentDecoItemResponse } from '../events'
import { LoadFolder } from '../mod/loadfolders'
import { ProjectManager } from '../projectManager'
import { RimWorldVersionArray } from '../typeInfoMapManager'
import { CodeCompletion } from './codeCompletions'
import { CodeLens } from './codeLens'
import { Decorate } from './decorate'
import { Definition } from './definition'
import { Reference } from './reference'
import { Rename } from './rename'

export class LanguageFeature {
  private readonly decorate = new Decorate()
  private readonly definition = new Definition()
  private readonly codeCompletion = new CodeCompletion()
  private readonly codeLens = new CodeLens()
  private readonly reference = new Reference()
  private readonly rename = new Rename(this.reference, this.definition)

  constructor(private readonly loadFolder: LoadFolder, private readonly projectManager: ProjectManager) {}

  listen(connection: lsp.Connection) {
    connection.onRequest(XMLDocumentDecoItemRequest, this.wrapExceptionStackTraces(this.onDecorate.bind(this)))
    connection.onDefinition(this.wrapExceptionStackTraces(this.onDefinition.bind(this)))
    connection.onCompletion(this.wrapExceptionStackTraces(this.onCompletion.bind(this)))
    connection.onCodeLens(this.wrapExceptionStackTraces(this.onCodeLens.bind(this)))
    connection.onReferences(this.wrapExceptionStackTraces(this.onReference.bind(this)))
    connection.onRenameRequest(this.wrapExceptionStackTraces(this.onRenameRequest.bind(this)))
  }

  private async onCompletion({ position, textDocument }: lsp.CompletionParams) {
    const uri = URI.parse(textDocument.uri)
    const versions = this.loadFolder.isBelongsTo(uri)
    const result: lsp.CompletionList = { isIncomplete: true, items: [] }

    for (const version of versions) {
      const project = await this.projectManager.getProject(version)
      const { isIncomplete, items } = this.codeCompletion.codeCompletion(project, uri, position)
      result.isIncomplete ||= isIncomplete
      result.items.push(...items)
    }

    return result
  }

  private async onDefinition({ position, textDocument }: lsp.DefinitionParams) {
    const uri = URI.parse(textDocument.uri)
    const versions = this.loadFolder.isBelongsTo(uri)
    const result: lsp.LocationLink[] = []

    for (const version of versions) {
      const project = await this.projectManager.getProject(version)
      const { definitionLinks, errors } = this.definition.onDefinition(project, uri, position)

      this.handleError(errors)
      result.push(...definitionLinks)
    }

    return result
  }

  private async onDecorate({ uri: uriStr }: XMLDocumentDecoItemRequest) {
    const uri = URI.parse(uriStr)
    const versions = this.loadFolder.isBelongsTo(uri)
    const result: XMLDocumentDecoItemResponse = { uri: uriStr, items: [] }

    for (const version of versions) {
      const project = await this.projectManager.getProject(version)
      const { decoItems, errors } = this.decorate.onDecorate(project, uri)

      this.handleError(errors)
      result.items.push(...decoItems)
    }

    return result
  }

  private async onCodeLens({ textDocument: { uri: uriStr } }: lsp.CodeLensParams) {
    const uri = URI.parse(uriStr)
    const versions = this.loadFolder.isBelongsTo(uri)
    const result: lsp.CodeLens[] = []

    for (const version of versions) {
      const project = await this.projectManager.getProject(version)
      const res = this.codeLens.onCodeLens(project, uri)
      result.push(...res)
    }

    return result
  }

  private async onReference({ position, textDocument }: lsp.ReferenceParams) {
    const uri = URI.parse(textDocument.uri)
    const result: lsp.Location[] = []

    for (const version of RimWorldVersionArray) {
      const project = await this.projectManager.getProject(version)
      const res = this.reference.onReference(project, uri, position)
      result.push(...res)
    }

    return result
  }

  private async onRenameRequest({ textDocument, newName, position }: lsp.RenameParams): Promise<lsp.WorkspaceEdit> {
    const uri = URI.parse(textDocument.uri)

    const edit: lsp.WorkspaceEdit = { changes: {} }

    for (const version of RimWorldVersionArray) {
      const project = await this.projectManager.getProject(version)
      const res = this.rename.rename(project, uri, newName, position)
      edit.changes = _.merge(edit.changes, res)
    }

    return edit
  }

  private handleError(errors: any[], message?: string) {
    if (errors.length > 0) {
      if (message) {
        console.error(message)
      }
      console.error(errors)
    }
  }

  /**
   * a wrapper for lsp request. prints stacktrace if error exists.
   */
  private wrapExceptionStackTraces<P, R>(func: (arg: P) => Promise<R>): (arg: P) => Promise<R | undefined> {
    return async (arg: P) => {
      try {
        return await func(arg)
      } catch (e: unknown) {
        log.error(e)
        throw e
      }
    }
  }
}
