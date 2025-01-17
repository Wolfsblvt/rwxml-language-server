import * as tsyringe from 'tsyringe'
import { LanguageClient } from 'vscode-languageclient'
import { TypeInfoRequest, TypeInfoRequestResponse } from '../events'
import { extractTypeInfos } from '../typeInfo'
import { Provider } from './provider'
import * as vscode from 'vscode'
import { createProgress } from '../utils/progress'
import * as mod from '../mod'
import { serializeError } from 'serialize-error'
import winston from 'winston'
import defaultLogger, { className, logFormat } from '../log'
import jsonStr from '../utils/json'

@tsyringe.injectable()
export class TypeInfoProvider implements Provider {
  private log = winston.createLogger({
    format: winston.format.combine(className(TypeInfoProvider), logFormat),
    transports: [defaultLogger()],
  })

  constructor(@tsyringe.inject(mod.PathStore.token) private readonly pathStore: mod.PathStore) {}

  async listen(client: LanguageClient): Promise<void> {
    await client.onReady()
    client.onRequest(TypeInfoRequest, this.onTypeInfoRequest.bind(this))
  }

  private requestCounter = 0
  private clearProgress: (() => void) | null = null

  async onTypeInfoRequest({ uris }: TypeInfoRequest): Promise<TypeInfoRequestResponse> {
    const res: TypeInfoRequestResponse = {}
    const dllPaths = uris.map((uri) => vscode.Uri.parse(uri).fsPath) // single .dll file or directory

    const managedDirectory = this.pathStore.RimWorldManagedDirectory
    this.log.debug('managed directory: ', managedDirectory)
    dllPaths.push(managedDirectory)

    if (!this.clearProgress) {
      const { resolve } = await createProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'RWXML: reading DLLs...',
      })
      this.clearProgress = resolve
    }

    this.requestCounter += 1

    try {
      this.log.silly(`extracting typeinfos from: ${jsonStr(dllPaths)}`)
      const typeInfos = await extractTypeInfos(...dllPaths)

      res.data = typeInfos
    } catch (err) {
      res.error = err as Error
      this.log.error(`failed to extract data. error: ${serializeError(err)}`)
    }

    this.requestCounter -= 1
    console.assert(
      this.requestCounter >= 0,
      'TypeInfoProvider.requestCount must be greater or equal 0, value: %d',
      this.requestCounter
    )

    if (this.requestCounter === 0) {
      console.assert(this.clearProgress !== null)
      this.clearProgress()
      this.clearProgress = null
    }

    return res
  }
}
