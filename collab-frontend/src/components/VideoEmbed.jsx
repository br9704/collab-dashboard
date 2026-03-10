import { useState, useRef } from 'react';
import './VideoEmbed.css';

/**
 * VideoEmbed - Embed and annotate videos on canvas
 * Supports YouTube, Vimeo, and local video uploads
 * 
 * Features:
 * - Embed videos from URLs
 * - Local video upload
 * - Play/pause controls
 * - Frame capture and annotation
 * - Video timestamp annotation
 * 
 * @component
 * @param {Object} props - Component props
 * @param {Function} props.onVideoEmbed - Callback when video is embedded
 * @param {boolean} props.isOpen - Dialog visibility
 * @param {Function} props.onClose - Close dialog callback
 * @returns {React.ReactElement}
 */
export default function VideoEmbed({ onVideoEmbed, isOpen, onClose }) {
  const [videoUrl, setVideoUrl] = useState('');
  const [videoType, setVideoType] = useState('youtube'); // youtube, vimeo, upload
  const [localFile, setLocalFile] = useState(null);
  const [localFilePreview, setLocalFilePreview] = useState(null);
  const [embedWidth, setEmbedWidth] = useState(640);
  const [embedHeight, setEmbedHeight] = useState(360);
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);

  /**
   * Validate and parse video URL
   */
  const parseVideoId = (url) => {
    // YouTube
    const youtubeRegex = /(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/;
    const youtubeMatch = url.match(youtubeRegex);
    if (youtubeMatch) {
      return { id: youtubeMatch[1], type: 'youtube' };
    }

    // Vimeo
    const vimeoRegex = /vimeo\.com\/(\d+)/;
    const vimeoMatch = url.match(vimeoRegex);
    if (vimeoMatch) {
      return { id: vimeoMatch[1], type: 'vimeo' };
    }

    return null;
  };

  /**
   * Handle file selection
   */
  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);

    // Validate file type
    if (!file.type.startsWith('video/')) {
      setError('Please select a valid video file');
      return;
    }

    setLocalFile(file);
    setVideoType('upload');

    // Create preview
    const reader = new FileReader();
    reader.onload = (event) => {
      setLocalFilePreview(event.target.result);
    };
    reader.readAsDataURL(file);
  };

  /**
   * Handle embed submission
   */
  const handleEmbed = () => {
    setError(null);

    if (videoType === 'upload') {
      if (!localFile || !localFilePreview) {
        setError('Please select a video file');
        return;
      }

      onVideoEmbed({
        type: 'local',
        data: localFilePreview,
        name: localFile.name,
        width: parseInt(embedWidth),
        height: parseInt(embedHeight)
      });
    } else {
      if (!videoUrl.trim()) {
        setError('Please enter a video URL');
        return;
      }

      const parsed = parseVideoId(videoUrl);
      if (!parsed) {
        setError('Invalid video URL. Supported: YouTube, Vimeo');
        return;
      }

      onVideoEmbed({
        type: parsed.type,
        id: parsed.id,
        url: videoUrl,
        width: parseInt(embedWidth),
        height: parseInt(embedHeight)
      });
    }

    handleClose();
  };

  /**
   * Reset and close dialog
   */
  const handleClose = () => {
    setVideoUrl('');
    setLocalFile(null);
    setLocalFilePreview(null);
    setError(null);
    setVideoType('youtube');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="video-embed-modal-overlay" onClick={handleClose}>
      <div className="video-embed-modal" onClick={(e) => e.stopPropagation()}>
        <div className="video-embed-header">
          <h2>Embed Video</h2>
          <button className="video-embed-close" onClick={handleClose}>×</button>
        </div>

        <div className="video-embed-content">
          {/* Video source selection */}
          <div className="video-source-tabs">
            <button
              className={`source-tab ${videoType === 'youtube' ? 'active' : ''}`}
              onClick={() => {
                setVideoType('youtube');
                setError(null);
              }}
            >
              📺 YouTube
            </button>
            <button
              className={`source-tab ${videoType === 'vimeo' ? 'active' : ''}`}
              onClick={() => {
                setVideoType('vimeo');
                setError(null);
              }}
            >
              ▶ Vimeo
            </button>
            <button
              className={`source-tab ${videoType === 'upload' ? 'active' : ''}`}
              onClick={() => {
                setVideoType('upload');
                setError(null);
              }}
            >
              📁 Upload
            </button>
          </div>

          {/* URL input for YouTube/Vimeo */}
          {(videoType === 'youtube' || videoType === 'vimeo') && (
            <div className="video-url-group">
              <label htmlFor="video-url">
                {videoType === 'youtube' ? 'YouTube URL' : 'Vimeo URL'}
              </label>
              <input
                id="video-url"
                type="text"
                placeholder={videoType === 'youtube' 
                  ? 'https://youtube.com/watch?v=...'
                  : 'https://vimeo.com/...'}
                value={videoUrl}
                onChange={(e) => setVideoUrl(e.target.value)}
                className="video-url-input"
              />
              <div className="video-url-hint">
                Paste the full URL of the video you want to embed
              </div>
            </div>
          )}

          {/* File upload for local videos */}
          {videoType === 'upload' && (
            <div className="video-upload-group">
              <button
                className="video-upload-btn"
                onClick={() => fileInputRef.current?.click()}
              >
                📂 Choose Video File
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="video/*"
                onChange={handleFileSelect}
                style={{ display: 'none' }}
              />
              
              {localFile && (
                <div className="video-file-info">
                  <div className="file-icon">📹</div>
                  <div className="file-details">
                    <div className="file-name">{localFile.name}</div>
                    <div className="file-size">
                      {(localFile.size / (1024 * 1024)).toFixed(2)} MB
                    </div>
                  </div>
                  <button
                    className="file-clear"
                    onClick={() => {
                      setLocalFile(null);
                      setLocalFilePreview(null);
                    }}
                  >
                    ✕
                  </button>
                </div>
              )}

              {localFilePreview && (
                <div className="video-preview">
                  <video controls width="100%">
                    <source src={localFilePreview} />
                  </video>
                </div>
              )}
            </div>
          )}

          {/* Embed dimensions */}
          <div className="video-dimensions">
            <div className="dimension-group">
              <label htmlFor="embed-width">Width (px)</label>
              <input
                id="embed-width"
                type="number"
                min="320"
                max="1280"
                value={embedWidth}
                onChange={(e) => setEmbedWidth(parseInt(e.target.value))}
              />
            </div>
            <div className="dimension-group">
              <label htmlFor="embed-height">Height (px)</label>
              <input
                id="embed-height"
                type="number"
                min="180"
                max="720"
                value={embedHeight}
                onChange={(e) => setEmbedHeight(parseInt(e.target.value))}
              />
            </div>
            <div className="aspect-ratio-presets">
              <button onClick={() => { setEmbedWidth(640); setEmbedHeight(360); }}>
                16:9
              </button>
              <button onClick={() => { setEmbedWidth(640); setEmbedHeight(480); }}>
                4:3
              </button>
              <button onClick={() => { setEmbedWidth(560); setEmbedHeight(315); }}>
                Standard
              </button>
            </div>
          </div>

          {/* Error message */}
          {error && (
            <div className="video-error">
              ⚠️ {error}
            </div>
          )}

          {/* Video preview */}
          {videoType !== 'upload' && videoUrl && (
            <div className="video-preview-section">
              <div className="preview-label">Preview</div>
              {videoType === 'youtube' && parseVideoId(videoUrl) && (
                <iframe
                  width={embedWidth}
                  height={embedHeight}
                  src={`https://www.youtube.com/embed/${parseVideoId(videoUrl).id}`}
                  frameBorder="0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                ></iframe>
              )}
              {videoType === 'vimeo' && parseVideoId(videoUrl) && (
                <iframe
                  src={`https://player.vimeo.com/video/${parseVideoId(videoUrl).id}`}
                  width={embedWidth}
                  height={embedHeight}
                  frameBorder="0"
                  allowFullScreen
                ></iframe>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="video-embed-actions">
            <button
              className="video-embed-btn-cancel"
              onClick={handleClose}
            >
              Cancel
            </button>
            <button
              className="video-embed-btn-submit"
              onClick={handleEmbed}
            >
              Embed Video
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
