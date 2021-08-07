import { XMLNode } from '../parser/XMLNode'
import { TypeInfoMap } from './typeInfoMap'
import { TypeInfo } from './typeInfo'
import { Injectable } from './injectable'
import { XMLDocument } from '../parser/XMLDocument'
import { Def } from './def'

export default class TypeInfoInjector {
  // inject defType to xmlNode
  static injectDefType(xmlNode: XMLNode, typeInfoMap: TypeInfoMap): boolean {
    if (!xmlNode.validNode) {
      return false
    }

    const elementName = xmlNode.name
    const defTypeInfo = typeInfoMap.getTypeInfoByName(elementName)

    if (defTypeInfo) {
      const def = TypeInfoInjector.injectType(xmlNode, defTypeInfo, typeInfoMap) as Def
      Def
      return true
    } else {
      return false
    }
  }

  // recursively inject all typeInfo to xmlNode
  static injectType(xmlNode: XMLNode, typeInfo: TypeInfo, typeInfoMap: TypeInfoMap): Injectable {
    const injectable = Injectable.toInjectable(xmlNode, typeInfo)

    for (const childNode of xmlNode.children) {
      if (childNode.validNode) {
        const correspondingTypeInfo = injectable.typeInfo.fields.get(childNode.name ?? '')

        if (correspondingTypeInfo) {
          TypeInfoInjector.injectType(childNode, correspondingTypeInfo.typeInfo, typeInfoMap)
        }
      }
    }

    return injectable
  }

  static inject(xmlDocument: XMLDocument, typeInfoMap: TypeInfoMap) {
    const res = {
      xmlDocument,
      defs: [] as Def[],
    }

    const root = xmlDocument.firstChild()

    if (root && root.name === 'Defs') {
      for (const xmlNode of root.children) {
        const success = this.injectDefType(xmlNode, typeInfoMap)

        if (success) {
          res.defs.push(xmlNode as Def)
        }
      }
    }

    return res
  }
}
