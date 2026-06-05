"use client"

import type { Note, NoteEdge, NoteGroup } from "@workspace/types"
import { useMemo } from "react"
import { classColor } from "../lib/bookmark-color"
import {
  KnowledgeGraph,
  type KnowledgeGraphLinkData,
  type KnowledgeGraphNodeData,
} from "./knowledge-graph"

function themeScheme(): "dark" | "light" {
  if (typeof document === "undefined") return "dark"
  return document.documentElement.classList.contains("dark") ? "dark" : "light"
}

interface Props {
  notes: Note[]
  groups: NoteGroup[]
  edges: NoteEdge[]
  onSelectNote: (note: Note) => void
  onSelectGroup: (group: NoteGroup) => void
}

const ITEM_VAL_BASE = 0.75
const ITEM_VAL_PER_CONNECTION = 0.28

export function NoteGraph({
  notes,
  groups,
  edges,
  onSelectNote,
  onSelectGroup,
}: Props) {
  const scheme = themeScheme()
  const data = useMemo(() => {
    const visibleItemIds = new Set(notes.map((note) => note.id))
    const directMemberCount = new Map<string, number>()

    for (const note of notes) {
      for (const groupId of note.groupIds) {
        directMemberCount.set(
          groupId,
          (directMemberCount.get(groupId) ?? 0) + 1
        )
      }
    }

    const childrenByParent = new Map<string, NoteGroup[]>()
    for (const group of groups) {
      const parentId = group.parentId ?? null
      if (!parentId) continue
      const list = childrenByParent.get(parentId) ?? []
      list.push(group)
      childrenByParent.set(parentId, list)
    }

    const subtreeMemberCount = new Map<string, number>()
    const computeSubtree = (groupId: string): number => {
      const cached = subtreeMemberCount.get(groupId)
      if (cached !== undefined) return cached
      let total = directMemberCount.get(groupId) ?? 0
      for (const child of childrenByParent.get(groupId) ?? []) {
        total += computeSubtree(child.id)
      }
      subtreeMemberCount.set(groupId, total)
      return total
    }
    for (const group of groups) {
      computeSubtree(group.id)
    }

    const seenPairs = new Set<string>()
    const undirectedEdges: NoteEdge[] = []
    for (const edge of edges) {
      if (
        !visibleItemIds.has(edge.fromNoteId) ||
        !visibleItemIds.has(edge.toNoteId)
      )
        continue
      if (edge.fromNoteId === edge.toNoteId) continue
      const key =
        edge.fromNoteId < edge.toNoteId
          ? `${edge.fromNoteId}|${edge.toNoteId}`
          : `${edge.toNoteId}|${edge.fromNoteId}`
      if (seenPairs.has(key)) continue
      seenPairs.add(key)
      undirectedEdges.push(edge)
    }

    const edgeCount = new Map<string, number>()
    for (const edge of undirectedEdges) {
      edgeCount.set(edge.fromNoteId, (edgeCount.get(edge.fromNoteId) ?? 0) + 1)
      edgeCount.set(edge.toNoteId, (edgeCount.get(edge.toNoteId) ?? 0) + 1)
    }

    const nodes: KnowledgeGraphNodeData<Note, NoteGroup>[] = [
      ...notes.map((note) => {
        const connections = (edgeCount.get(note.id) ?? 0) + note.groupIds.length
        return {
          id: note.id,
          label: note.title,
          type: "item" as const,
          val: ITEM_VAL_BASE + connections * ITEM_VAL_PER_CONNECTION,
          color: note.class
            ? classColor(note.class, scheme)
            : classColor(note.siteName ?? note.title, scheme),
          biasable: true,
          item: note,
        }
      }),
      ...groups.map((group) => {
        const isRoot = !group.parentId
        const subtree = subtreeMemberCount.get(group.id) ?? 0
        const base = isRoot ? 14 : 5
        const perMember = isRoot ? 2.2 : 1.2
        return {
          id: `group:${group.id}`,
          label: group.name,
          type: "group" as const,
          val: base + subtree * perMember,
          color: group.color ?? classColor(group.name, scheme),
          biasable: !group.color,
          group,
        }
      }),
    ]

    const links: KnowledgeGraphLinkData[] = []

    for (const note of notes) {
      for (const groupId of note.groupIds) {
        if (groups.some((group) => group.id === groupId)) {
          links.push({
            source: note.id,
            target: `group:${groupId}`,
            type: "membership",
            strength: 1,
          })
        }
      }
    }

    for (const group of groups) {
      if (
        group.parentId &&
        groups.some((parent) => parent.id === group.parentId)
      ) {
        links.push({
          source: `group:${group.id}`,
          target: `group:${group.parentId}`,
          type: "membership",
          strength: 1,
        })
      }
    }

    for (const edge of undirectedEdges) {
      links.push({
        source: edge.fromNoteId,
        target: edge.toNoteId,
        type: "relation",
        strength: edge.strength,
      })
    }

    return { nodes, links }
  }, [notes, groups, edges, scheme])

  return (
    <KnowledgeGraph
      nodes={data.nodes}
      links={data.links}
      onSelectItem={onSelectNote}
      onSelectGroup={onSelectGroup}
      onRelationClick={(sourceId) => {
        const note = notes.find((candidate) => candidate.id === sourceId)
        if (note) onSelectNote(note)
      }}
    />
  )
}
