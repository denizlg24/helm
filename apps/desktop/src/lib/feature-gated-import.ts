import { type FeatureId, isFeatureEnabled } from "./features"

type ModuleLoader<TModule> = () => Promise<TModule>

export type FeatureImportMap<TModuleByFeature extends Record<string, unknown>> =
  {
    [Feature in keyof TModuleByFeature & string]: ModuleLoader<
      TModuleByFeature[Feature]
    >
  }

export async function featureGatedImport<TModule>(
  feature: FeatureId,
  loader: ModuleLoader<TModule>
): Promise<TModule | null> {
  if (!isFeatureEnabled(feature)) {
    return null
  }
  return loader()
}

export function createFeatureGatedImporter<
  TModuleByFeature extends Record<string, unknown>,
>(loaders: FeatureImportMap<TModuleByFeature>) {
  return async <Feature extends keyof TModuleByFeature & string>(
    feature: Feature
  ): Promise<TModuleByFeature[Feature] | null> => {
    if (!isFeatureEnabled(feature)) {
      return null
    }
    return loaders[feature]()
  }
}

function isEntry<T>(
  entry: readonly [string, T] | null
): entry is readonly [string, T] {
  return entry !== null
}

export async function featureGatedImports<
  TModuleByFeature extends Record<string, unknown>,
>(
  loaders: FeatureImportMap<TModuleByFeature>
): Promise<Partial<TModuleByFeature>> {
  const entries = await Promise.all(
    Object.entries(loaders).map(async ([feature, loader]) => {
      if (!isFeatureEnabled(feature)) {
        return null
      }
      const loaded = await loader()
      return [feature, loaded] as const
    })
  )

  return Object.fromEntries(
    entries.filter(isEntry)
  ) as Partial<TModuleByFeature>
}
