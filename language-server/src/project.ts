import { EventEmitter } from 'events'
import { Def, DefDatabase, Document, Injectable, NameDatabase, parse, TypeInfoMap } from '@rwxml/analyzer'
import { URI } from 'vscode-uri'
import { DefManager } from './defManager'
import { DependencyFile } from './fs'
import { TextDocumentManager } from './textDocumentManager'
import { About } from './mod'
import { RimWorldVersion } from './typeInfoMapManager'
import { ResourceStore } from './resourceStore'
import { container } from 'tsyringe'
import * as winston from 'winston'

interface TypeInfoMapProvider {
  get(version: string): Promise<TypeInfoMap>
}

interface Events {
  defChanged(defs: (Injectable | Def)[]): void
}

export class Project {
  private logFormat = winston.format.printf((info) => `[${this.version}] ${info.message}`)
  private log = winston.createLogger({ transports: log, format: this.logFormat })

  private xmls: Map<string, Document> = new Map()
  public readonly about = container.resolve(About)
  public defManager = new DefManager(new DefDatabase(), new NameDatabase(), new TypeInfoMap())

  public readonly event: EventEmitter<Events> = new EventEmitter()

  constructor(public readonly version: RimWorldVersion, public readonly resourceStore: ResourceStore) {}

  /**
   * @deprecated use resourceStore directly
   * @param uri
   * @returns
   */
  isDependencyFile(uri: string | URI): boolean {
    if (uri instanceof URI) {
      uri = uri.toString()
    }

    // does this file belongs to this project?
    const file = this.resourceStore.files.get(uri)
    if (!file) {
      return false
    }

    if (DependencyFile.is(file)) {
      this.resourceStore.depFiles.getValue(file.ownerPackageId).has(file.uri.toString())
    }

    return false
  }

  getXMLDocumentByUri(uri: string | URI) {
    if (uri instanceof URI) {
      uri = uri.toString()
    }

    this.xmls.get(uri)
  }

  getTextDocumentByUri(uri: string | URI) {
    if (uri instanceof URI) {
      uri = uri.toString()
    }

    // NOTE: does this create perf issue?
    const textDocumentManager = container.resolve(TextDocumentManager)

    return textDocumentManager.get(uri)
  }

  private async reset() {
    // TODO: implement TypeInfoMapProvider
    const typeInfoMapProvider = container.resolve<TypeInfoMapProvider>('TypeInfoMapProvider')
    const typeInfoMap = await typeInfoMapProvider.get(this.version)

    this.xmls = new Map()
    this.defManager = new DefManager(new DefDatabase(), new NameDatabase(), typeInfoMap)

    this.evaluateProject()
  }

  /**
   * evaluteProject performs parsing on all document on resourceStore
   */
  private evaluateProject() {
    for (const [uri, raw] of this.resourceStore.xmls) {
      this.parseXML(uri, raw)
    }
  }

  /**
   * parse XML and register/update/delete defs to project
   * @param uri uri of the file of the xml
   * @param raw xml string, must be parsable
   */
  private parseXML(uri: string, raw: string) {
    const document = parse(raw, uri)

    this.xmls.set(uri, document)

    const dirtyDefs = this.defManager.update(document)
    this.event.emit('defChanged', dirtyDefs)
  }
}
