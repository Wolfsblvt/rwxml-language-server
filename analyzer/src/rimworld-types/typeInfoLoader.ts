import { TypeInfo } from './typeInfo'
import { TypeInfoMap } from './typeInfoMap'
import { AsEnumerable } from 'linq-es2015'
import { RawTypeInfo } from './rawTypeInfo'
import { FieldInfo } from './fieldInfo'
import { Writable } from '../utils/types'

export class TypeInfoLoader {
  static load(rawTypeInfos: RawTypeInfo[]): TypeInfoMap {
    const errors: Error[] = []
    const rawData = JSON.parse(JSON.stringify(rawTypeInfos))

    const rawTypeInfoMap = AsEnumerable(rawTypeInfos).ToMap(
      (k) => k.fullName,
      (k) => k
    )
    const typeInfoMap: Map<string, TypeInfo> = new Map()

    for (const [fullname, rawTypeInfo] of rawTypeInfoMap) {
      if (fullname) {
        typeInfoMap.set(
          fullname,
          new TypeInfo(
            rawTypeInfo.metadata ?? {},
            rawTypeInfo.fullName ?? '',
            rawTypeInfo.namespaceName ?? '',
            rawTypeInfo.className ?? '',
            rawTypeInfo.attributes ?? {},
            rawTypeInfo.fields ?? {},
            rawTypeInfo.genericArguments ?? [],
            rawTypeInfo.baseClass,
            rawTypeInfo.methods ?? [],
            rawTypeInfo.isGeneric ?? false,
            rawTypeInfo.isArray ?? false,
            rawTypeInfo.isEnum ?? false,
            rawTypeInfo.enums ?? [],
            rawTypeInfo.interfaces ?? []
          )
        )
      }
    }

    // link
    for (const [fullName] of rawTypeInfoMap) {
      if (fullName) {
        const typeInfo = typeInfoMap.get(fullName) as Writable<TypeInfo>

        // link attributes
        for (const [name, fullName] of Object.entries(typeInfo.attributes)) {
          const t = typeInfoMap.get(<string>(<unknown>fullName))
          if (t) {
            typeInfo.attributes.name = t
          } else {
            errors.push(new Error(`while linking attribute "${name}", attribute type ${fullName} is not found.`))
          }
        }

        // link fields
        for (const field of Object.values<Writable<FieldInfo>>(typeInfo.fields)) {
          const fieldType = typeInfoMap.get(<string>(<unknown>field.fieldType))
          const declaringType = typeInfoMap.get(<string>(<unknown>field.declaringType))

          if (fieldType && declaringType) {
            field.fieldType = fieldType
            field.declaringType = declaringType
          } else {
            errors.push(
              new Error(
                `while linking field "${field.name}", fieldType "${field.fieldType}" or declaringType "${field.declaringType}" is undefined or null.`
              )
            )
          }
        }

        // link genericArguments
        for (let i = 0; i < typeInfo.genericArguments.length; i++) {
          const genericArgumentTypeName = typeInfo.genericArguments[i] as unknown as string
          const genericArgumentType = typeInfoMap.get(genericArgumentTypeName)

          if (genericArgumentType) {
            typeInfo.genericArguments[i] = genericArgumentType
          } else {
            errors.push(
              new Error(
                `while linking "${typeInfo.fullName}"'s genArgs, type "${genericArgumentTypeName}" is not found.`
              )
            )
          }
        }

        // link baseClass
        if (typeInfo.baseClass) {
          const baseClassTypeinfoName = typeInfo.baseClass as unknown as string
          const baseClassTypeInfo = typeInfoMap.get(baseClassTypeinfoName)

          if (baseClassTypeinfoName) {
            typeInfo.baseClass = baseClassTypeInfo
          } else {
            errors.push(
              new Error(
                `while linking "${typeInfo.fullName}"'s base class, type "${baseClassTypeinfoName}" is not found.`
              )
            )
          }
        }

        // link interfaces
        for (let i = 0; i < typeInfo.interfaces.length; i++) {
          const typeName = typeInfo.interfaces[i] as unknown as string
          const type = typeInfoMap.get(typeName)

          if (type) {
            typeInfo.interfaces[i] = type
          } else {
            errors.push(
              new Error(`while linking "${typeInfo.fullName}"'s interfaces, type "${typeName}" is not found.`)
            )
          }
        }
      }
    }

    const ret = new TypeInfoMap()
    ret.addTypeInfos(...typeInfoMap.values())

    ret.rawData = rawData
    return ret
  }
}
