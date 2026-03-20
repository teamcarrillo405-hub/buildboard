/**
 * MediaGallery
 * Displays uploaded photos in a responsive grid and videos in a list.
 */

import React, { useState } from 'react';
import { Trash2, Film } from 'lucide-react';
import type { MediaRecord } from '../api/types';

interface MediaGalleryProps {
  media: MediaRecord[];
  onDelete?: (id: string) => void;
  editable?: boolean;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const MediaGallery: React.FC<MediaGalleryProps> = ({
  media,
  onDelete,
  editable = false,
}) => {
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const photos = media.filter((m) => m.type === 'photo');
  const videos = media.filter((m) => m.type === 'video');

  if (media.length === 0) {
    return (
      <p className="text-text-muted text-center py-8">No media uploaded yet</p>
    );
  }

  return (
    <div className="space-y-6">
      {/* Photos grid */}
      {photos.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {photos.map((photo) => (
            <div
              key={photo.id}
              className="aspect-square rounded-lg overflow-hidden relative group"
            >
              <img
                src={photo.url}
                alt={photo.filename}
                className="object-cover w-full h-full"
                loading="lazy"
              />
              {editable && onDelete && (
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  {deletingId === photo.id ? (
                    <div className="flex gap-2">
                      <button
                        onClick={() => { onDelete(photo.id); setDeletingId(null); }}
                        className="bg-red-500 text-white text-xs px-3 py-1.5 rounded font-bold"
                      >
                        Confirm
                      </button>
                      <button
                        onClick={() => setDeletingId(null)}
                        className="bg-white/20 text-white text-xs px-3 py-1.5 rounded"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setDeletingId(photo.id)}
                      className="bg-red-500/80 hover:bg-red-500 text-white p-2 rounded-full transition-colors"
                      aria-label={`Delete ${photo.filename}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Videos list */}
      {videos.length > 0 && (
        <div className="space-y-2">
          {videos.map((video) => (
            <div
              key={video.id}
              className="flex items-center gap-3 p-3 bg-background rounded border border-border"
            >
              <Film className="w-5 h-5 text-text-muted flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white truncate">{video.filename}</p>
                <p className="text-xs text-text-muted">{formatBytes(video.fileSize)}</p>
              </div>
              {editable && onDelete && (
                <button
                  onClick={() => onDelete(video.id)}
                  className="bg-red-500/80 hover:bg-red-500 text-white p-2 rounded-full transition-colors flex-shrink-0"
                  aria-label={`Delete ${video.filename}`}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default MediaGallery;
