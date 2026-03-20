/**
 * MediaUploader
 * Drag-and-drop file upload component that streams directly to R2 via presigned URL.
 */

import React, { useState, useRef, useCallback } from 'react';
import { Upload, Loader2, AlertCircle } from 'lucide-react';
import { ProfileAPI } from '../api/api';
import type { MediaRecord } from '../api/types';

interface MediaUploaderProps {
  companyId: string;
  type: 'photo' | 'video';
  onUpload: (media: MediaRecord) => void;
  maxSize: number; // bytes
  accept: string[]; // e.g. ['image/jpeg', 'image/png', 'image/webp']
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
}

const MediaUploader: React.FC<MediaUploaderProps> = ({
  companyId,
  type,
  onUpload,
  maxSize,
  accept,
}) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validateFile = useCallback(
    (file: File): string | null => {
      if (!accept.includes(file.type)) {
        return `Invalid file type. Accepted: ${accept.map(a => a.split('/')[1]).join(', ')}`;
      }
      if (file.size > maxSize) {
        return `File too large. Maximum size: ${formatBytes(maxSize)}`;
      }
      return null;
    },
    [accept, maxSize],
  );

  const processFile = useCallback(
    async (file: File) => {
      const validationError = validateFile(file);
      if (validationError) {
        setError(validationError);
        return;
      }

      setError(null);
      setUploading(true);

      try {
        const { uploadUrl, key } = await ProfileAPI.getUploadUrl(companyId, {
          filename: file.name,
          contentType: file.type,
          fileSize: file.size,
        });

        await ProfileAPI.uploadFile(uploadUrl, file);

        const mediaRecord = await ProfileAPI.registerMedia(companyId, {
          key,
          type,
          filename: file.name,
          fileSize: file.size,
        });

        onUpload(mediaRecord);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Upload failed. Please try again.');
      } finally {
        setUploading(false);
        // Reset the file input so the same file can be re-selected after an error
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }
    },
    [companyId, type, onUpload, validateFile],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) void processFile(file);
    },
    [processFile],
  );

  const handleClick = useCallback(() => {
    if (!uploading) fileInputRef.current?.click();
  }, [uploading]);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) void processFile(file);
    },
    [processFile],
  );

  const dropZoneClass = [
    'border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors',
    isDragOver
      ? 'border-brand-primary bg-brand-primary/5'
      : 'border-border hover:border-brand-primary',
    uploading ? 'pointer-events-none opacity-60' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div>
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept={accept.join(',')}
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Drop zone */}
      <div
        className={dropZoneClass}
        onClick={handleClick}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') handleClick();
        }}
        aria-label={`Upload ${type}`}
      >
        {uploading ? (
          <div className="flex flex-col items-center gap-3 text-text-muted">
            <Loader2 className="w-8 h-8 animate-spin text-brand-primary" />
            <p className="text-sm font-medium">Uploading...</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 text-text-muted">
            <Upload className="w-8 h-8" />
            <div>
              <p className="text-sm font-medium text-white">
                Drop {type === 'photo' ? 'a photo' : 'a video'} here or click to browse
              </p>
              <p className="text-xs mt-1">
                {accept.map(a => a.split('/')[1].toUpperCase()).join(', ')} — max{' '}
                {formatBytes(maxSize)}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Error message */}
      {error && (
        <div role="alert" className="flex items-center gap-2 mt-2 text-red-400 text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
};

export default MediaUploader;
