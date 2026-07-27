export function reorderModelIds(
  modelIds: string[],
  draggedModelId: string,
  targetModelId: string,
): string[] {
  const fromIndex = modelIds.indexOf(draggedModelId);
  const toIndex = modelIds.indexOf(targetModelId);

  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return modelIds;

  const next = [...modelIds];
  next.splice(fromIndex, 1);
  next.splice(toIndex, 0, draggedModelId);
  return next;
}
