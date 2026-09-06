import { z } from 'zod'

export const SearchIndexInspectionSchema = z.object({
  checkedAt: z.iso.datetime(),
  publicPages: z.number().int().nonnegative(),
  indexedPages: z.number().int().nonnegative(),
  missingPages: z.number().int().nonnegative(),
  stalePages: z.number().int().nonnegative(),
  excludedEntries: z.number().int().nonnegative(),
  configuredDictionary: z.string(),
  indexedDictionary: z.string().nullable(),
  schemaVersion: z.number().int().nullable(),
  expectedSchemaVersion: z.number().int()
})
export type SearchIndexInspection = z.infer<typeof SearchIndexInspectionSchema>
export const SearchIndexStatusSchema = z.object({
  engine: z.string(),
  inspection: SearchIndexInspectionSchema.nullable()
})
export type SearchIndexStatus = z.infer<typeof SearchIndexStatusSchema>
