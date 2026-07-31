export function transcriptUrl(apiBase: string, containerId: string): string {
  return `${apiBase}/kernel/sessions/${encodeURIComponent(containerId)}/transcript`;
}

export function transcriptImageUrl(
  apiBase: string,
  containerId: string,
  imageId: string,
): string {
  return `${transcriptUrl(apiBase, containerId)}/images/${encodeURIComponent(imageId)}`;
}
