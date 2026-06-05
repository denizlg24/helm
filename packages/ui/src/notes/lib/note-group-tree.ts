export interface GroupLike {
  id: string
  name: string
  parentId?: string | null
}

export function buildGroupById<TGroup extends GroupLike>(groups: TGroup[]) {
  return new Map(groups.map((group) => [group.id, group] as const))
}

export function buildChildrenByParent<TGroup extends GroupLike>(
  groups: TGroup[]
) {
  const childrenByParent = new Map<string | null, TGroup[]>()

  for (const group of groups) {
    const parentId = group.parentId ?? null
    const current = childrenByParent.get(parentId) ?? []
    current.push(group)
    childrenByParent.set(parentId, current)
  }

  for (const children of childrenByParent.values()) {
    children.sort((left, right) => left.name.localeCompare(right.name))
  }

  return childrenByParent
}

export function collectAncestorIds(
  groupId: string,
  byId: Map<string, GroupLike>
): string[] {
  const ancestors: string[] = []
  const visited = new Set<string>()
  let currentId: string | null | undefined = groupId

  while (currentId && !visited.has(currentId)) {
    visited.add(currentId)
    ancestors.push(currentId)
    currentId = byId.get(currentId)?.parentId ?? null
  }

  return ancestors
}

export function buildPathLabelMap<TGroup extends GroupLike>(groups: TGroup[]) {
  const byId = buildGroupById(groups)
  const pathLabelById = new Map<string, string>()

  const resolve = (groupId: string): string => {
    const cached = pathLabelById.get(groupId)
    if (cached) return cached

    const visited = new Set<string>()
    const parts: string[] = []
    let currentId: string | null | undefined = groupId

    while (currentId && !visited.has(currentId)) {
      visited.add(currentId)
      const current = byId.get(currentId)
      if (!current) break
      parts.push(current.name)
      currentId = current.parentId ?? null
    }

    const label = parts.reverse().join(" / ")
    pathLabelById.set(groupId, label)
    return label
  }

  for (const group of groups) {
    resolve(group.id)
  }

  return pathLabelById
}

export function buildDescendantIdMap<TGroup extends GroupLike>(
  groups: TGroup[]
) {
  const childrenByParent = buildChildrenByParent(groups)
  const descendantIdsByGroup = new Map<string, Set<string>>()
  const visiting = new Set<string>()

  const collect = (groupId: string): Set<string> => {
    const cached = descendantIdsByGroup.get(groupId)
    if (cached) return cached

    if (visiting.has(groupId)) {
      const placeholder = new Set<string>([groupId])
      descendantIdsByGroup.set(groupId, placeholder)
      return placeholder
    }

    visiting.add(groupId)

    const next = new Set<string>([groupId])
    for (const child of childrenByParent.get(groupId) ?? []) {
      for (const descendantId of collect(child.id)) {
        next.add(descendantId)
      }
    }

    descendantIdsByGroup.set(groupId, next)
    visiting.delete(groupId)
    return next
  }

  for (const group of groups) {
    collect(group.id)
  }

  return descendantIdsByGroup
}
