// Handing generated files to the viewer.

import { IS_ARTIFACT, useCapability } from '../app/env';

interface DownloadsCapability {
  save(request: { filename: string; data: string | Blob }): Promise<{ status: 'saved' | 'delivered' }>;
}

/** Whether this view can hand files to the viewer at all. */
export async function canSaveFiles(): Promise<boolean> {
  if (!IS_ARTIFACT) return true;
  return (await useCapability<DownloadsCapability>('downloads')) !== null;
}

function downloadMessage(e: unknown): string {
  const code = e && typeof e === 'object' ? (e as { code?: string }).code : undefined;
  switch (code) {
    case 'declined':
      return 'Save cancelled.';
    case 'rate_limited':
      return 'Another save is waiting for your answer. Finish it, then try again.';
    case 'too_large':
      return 'This file is too large to save here.';
    case 'rejected_extension':
    case 'extension_not_enabled':
      return 'This file type cannot be saved in this view.';
    default:
      return 'Saving files is not available in this view.';
  }
}

export type SaveStatus = 'saved' | 'delivered' | 'started';

/**
 * Offer a generated file to the viewer. In the artifact viewer this goes
 * through the `downloads` capability (the viewer confirms each save);
 * standalone, it is an ordinary browser download.
 */
export async function saveFile(data: Blob | string, filename: string, type: string): Promise<SaveStatus> {
  if (IS_ARTIFACT) {
    const downloads = await useCapability<DownloadsCapability>('downloads');
    if (!downloads) throw new Error('Saving files is not available in this view.');
    try {
      return (await downloads.save({ filename, data })).status;
    } catch (e) {
      throw new Error(downloadMessage(e));
    }
  }
  const blob = typeof data === 'string' ? new Blob([data], { type }) : data;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
  return 'started';
}
