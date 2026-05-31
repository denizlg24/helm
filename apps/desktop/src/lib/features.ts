import { customBuild } from "../generated/custom-build"

export type FeatureId = string

export const enabledFeatures = customBuild.enabledFeatures
export const enabledFeatureSet = new Set<FeatureId>(enabledFeatures)
export const isFullFeatureBuild = enabledFeatures.length === 0

export function isFeatureEnabled(feature: FeatureId): boolean {
  return isFullFeatureBuild || enabledFeatureSet.has(feature)
}

export function areFeaturesEnabled(features: readonly FeatureId[]): boolean {
  return features.every(isFeatureEnabled)
}

export function isAnyFeatureEnabled(features: readonly FeatureId[]): boolean {
  return features.some((f) => isFeatureEnabled(f))
}

export function filterEnabledFeatures<T extends { id: FeatureId }>(
  features: readonly T[]
): T[] {
  return features.filter((feature) => isFeatureEnabled(feature.id))
}

export function assertFeatureEnabled(feature: FeatureId): void {
  if (!isFeatureEnabled(feature)) {
    throw new Error(`Feature is not included in this desktop build: ${feature}`)
  }
}

export function featureBuildInfo() {
  return {
    appName: customBuild.appName,
    buildId: customBuild.buildId,
    enabledFeatures,
    isFullFeatureBuild,
    theme: customBuild.theme,
  }
}
