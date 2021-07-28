import { TypeIdentifier } from './declaredType'
import { Metadata } from './metadata'

export interface RawTypeInfo {
  fullName: TypeIdentifier
  metadata: Metadata
  childNodes: Record<string, TypeIdentifier>
}