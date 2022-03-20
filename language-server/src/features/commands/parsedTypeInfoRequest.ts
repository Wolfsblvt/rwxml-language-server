import { Connection } from 'vscode-languageserver'
import { Logger } from 'winston'
import { ParsedTypeInfoRequest, ParsedTypeInfoRequestResponse } from '../../events'
import { LoadFolder } from '../../mod/loadfolders'
import { ProjectManager } from '../../projectManager'
import { Provider } from '../provider'
import * as winston from 'winston'
import * as tsyringe from 'tsyringe'
import { LogToken } from '../../log'

@tsyringe.injectable()
export class ParsedTypeInfoRequestHandler extends Provider {
  private logFormat = winston.format.printf(
    (info) => `[${info.level}] [${ParsedTypeInfoRequestHandler.name}] ${info.message}`
  )
  private readonly log: winston.Logger

  constructor(
    loadFolder: LoadFolder,
    projectManager: ProjectManager,
    @tsyringe.inject(LogToken) baseLogger: winston.Logger
  ) {
    super(loadFolder, projectManager)
    this.log = winston.createLogger({ transports: baseLogger.transports, format: this.logFormat })
  }

  listen(connection: Connection): void {
    connection.onRequest(ParsedTypeInfoRequest, this.wrapExceptionStackTraces(this.onRequest.bind(this)))
  }

  protected getLogger(): Logger {
    return this.log
  }

  private async onRequest({
    version,
  }: ParsedTypeInfoRequest): Promise<ParsedTypeInfoRequestResponse | null | undefined> {
    const project = this.projectManager.getProject(version)

    try {
      const typeInfoMap = await project.getTypeInfo()

      return { version, data: typeInfoMap.rawData }
    } catch (err) {
      return { version, data: null, error: err }
    }
  }
}