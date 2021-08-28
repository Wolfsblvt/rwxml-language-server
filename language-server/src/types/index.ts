export type UrlEncodedString = string
export type Writable<T> = { -readonly [P in keyof T]: T[P] }
export * from './decoItem'
