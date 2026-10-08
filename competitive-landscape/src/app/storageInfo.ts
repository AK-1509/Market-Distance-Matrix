import { useEffect, useState } from 'react';
import type { StorageKind } from '../storage/backends';
import { storageKind } from '../storage/repository';

export function useStorageKind(): StorageKind | null {
  const [kind, setKind] = useState<StorageKind | null>(null);
  useEffect(() => {
    let live = true;
    storageKind().then((k) => live && setKind(k), () => live && setKind('memory'));
    return () => {
      live = false;
    };
  }, []);
  return kind;
}

export function storageNote(kind: StorageKind | null): string {
  switch (kind) {
    case 'account':
      return 'Projects are saved to your Claude account in this artifact and are visible only to you. A JSON export is a portable backup you control.';
    case 'memory':
      return 'Projects cannot be saved in this view and will be lost when you close it. Export a JSON backup to keep your work.';
    case 'browser':
      return 'Projects are saved in this browser’s storage for this page only — another browser, profile or device will not see them, and clearing site data removes them. A JSON export is your portable backup.';
    default:
      return 'Checking where projects are saved…';
  }
}
