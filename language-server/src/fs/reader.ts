import { inject, injectable } from 'tsyringe'
import { Connection } from 'vscode-languageserver'
import { TextRequest } from '../events'
import { File } from './file'
import * as winston from 'winston'
import { ConnectionToken } from '../connection'
import defaultLogger, { className, logFormat } from '../log'

@injectable()
export class TextReader {
  private log = winston.createLogger({
    format: winston.format.combine(className(TextReader), logFormat),
    transports: [defaultLogger()],
  })

  constructor(@inject(ConnectionToken) private readonly connection: Connection) {}

  async read(file: File): Promise<string> {
    this.log.silly(`read file: ${file.uri.toString()}`)

    const { data, error } = await this.connection.sendRequest(TextRequest, {
      uri: file.uri.toString(),
    })

    if (error) {
      this.log.error(`request failed, error: ${error}`)
      throw error
    }

    return data
  }
}
