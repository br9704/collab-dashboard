import { useState, useRef, useCallback } from 'react';
import './VideoEmbedCanvas.css';

/**
 * VideoEmbedCanvas - Renders embedded videos as draggable HTML overlays
 *
 * Positioned absolutely over the canvas element so they participate in
 * the same coordinate space.  Camera transform (pan/zoom) is applied so
 * embeds move and scale with the rest of the canvas content.
 *
 * Supports:
 *  - YouTube / Vimeo iframes
 *  - Local video (<video> element)
 *  - Drag-to-reposition within canvas space
 *  - Remove button
 *
 * @component
 * @param {Object}   props
 * @param {Array}    props.videoEmbeds        - Array of embed objects
 * @param {Object}   props.camera             - { x, y, zoom }
 * @param {Function} props.onMove             - (id, canvasX, canvasY) => void
 * @param {Function} props.onRemove           - (id) => void
 * @param {boolean}  props.canEdit            - Whether embeds can be moved/removed
 * @returns {React.ReactElement|null}
 */
export default function VideoEmbedCanvas({ videoEmbeds, camera, onMove, onRemove, canEdit }) {
  if (!videoEmbeds || videoEmbeds.length === 0) return null;

  return (
    <div className="video-embed-canvas-layer" aria-label="Video embeds overlay">
      {videoEmbeds.map(embed => (
        <VideoEmbedItem
          key={embed.id}
          embed={embed}
          camera={camera}
          onMove={onMove}
          onRemove={onRemove}
          canEdit={canEdit}
        />
      ))}
    </div>
  );
}

/**
 * VideoEmbedItem - Individual draggable video embed
 *
 * @param {Object}   props
 * @param {Object}   props.embed    - Embed data object
 * @param {Object}   props.camera   - Camera transform { x, y, zoom }
 * @param {Function} props.onMove   - Position change callback
 * @param {Function} props.onRemove - Remove callback
 * @param {boolean}  props.canEdit  - Whether item can be interacted with
 */
function VideoEmbedItem({ embed, camera, onMove, onRemove, canEdit }) {
  const dragRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const [showControls, setShowControls] = useState(false);

  /**
   * Convert canvas-space coordinates to screen-space for positioning
   * @param {number} canvasX - X in canvas coordinate system
   * @param {number} canvasY - Y in canvas coordinate system
   * @returns {{ left: number, top: number }}
   */
  const toScreen = (canvasX, canvasY) => ({
    left: canvasX * camera.zoom + camera.x,
    top: canvasY * camera.zoom + camera.y,
  });

  const screenPos = toScreen(embed.x, embed.y);
  const scaledWidth = embed.width * camera.zoom;
  const scaledHeight = embed.height * camera.zoom;

  /**
   * Drag handlers — track pointer offset so the embed doesn't jump
   */
  const handleMouseDown = useCallback((e) => {
    if (!canEdit) return;
    if (e.button !== 0) return;
    e.stopPropagation();

    const startMouseX = e.clientX;
    const startMouseY = e.clientY;
    const startEmbedX = embed.x;
    const startEmbedY = embed.y;

    setIsDragging(true);

    const handleMouseMove = (me) => {
      const deltaX = (me.clientX - startMouseX) / camera.zoom;
      const deltaY = (me.clientY - startMouseY) / camera.zoom;
      const newX = startEmbedX + deltaX;
      const newY = startEmbedY + deltaY;
      onMove?.(embed.id, newX, newY);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }, [canEdit, embed.id, embed.x, embed.y, camera.zoom, onMove]);

  /**
   * Build the iframe src based on embed type
   * @returns {string} Iframe source URL
   */
  const getEmbedSrc = () => {
    if (embed.type === 'youtube' && embed.id) {
      return `https://www.youtube.com/embed/${embed.id}?rel=0`;
    }
    if (embed.type === 'vimeo' && embed.id) {
      return `https://player.vimeo.com/video/${embed.id}`;
    }
    return null;
  };

  const embedSrc = getEmbedSrc();
  const isLocal = embed.type === 'local';

  return (
    <div
      ref={dragRef}
      className={`video-embed-item ${isDragging ? 'dragging' : ''} ${!canEdit ? 'readonly' : ''}`}
      style={{
        position: 'absolute',
        left: `${screenPos.left}px`,
        top: `${screenPos.top}px`,
        width: `${scaledWidth}px`,
        height: `${scaledHeight}px`,
        cursor: canEdit ? (isDragging ? 'grabbing' : 'grab') : 'default',
        zIndex: isDragging ? 600 : 200,
      }}
      onMouseEnter={() => setShowControls(true)}
      onMouseLeave={() => setShowControls(false)}
      onMouseDown={handleMouseDown}
      role="region"
      aria-label={`Embedded video: ${embed.name || embed.type}`}
    >
      {/* Drag handle bar — only visible on hover */}
      {showControls && canEdit && (
        <div className="video-embed-drag-bar">
          <span className="drag-bar-title" title={embed.name || embed.url}>
            🎬 {embed.name || (embed.type === 'youtube' ? 'YouTube' : embed.type === 'vimeo' ? 'Vimeo' : 'Video')}
          </span>
          <button
            className="video-embed-remove-btn"
            onClick={(e) => { e.stopPropagation(); onRemove?.(embed.id); }}
            title="Remove video embed"
            aria-label="Remove video embed"
          >
            ×
          </button>
        </div>
      )}

      {/* Drag overlay prevents iframes capturing pointer events while dragging */}
      {isDragging && <div className="video-embed-drag-shield" />}

      {/* Actual video content */}
      {isLocal ? (
        <video
          className="video-embed-player"
          controls
          src={embed.data}
          style={{ width: '100%', height: showControls && canEdit ? 'calc(100% - 28px)' : '100%', marginTop: showControls && canEdit ? '28px' : '0' }}
        />
      ) : embedSrc ? (
        <iframe
          className="video-embed-iframe"
          src={embedSrc}
          frameBorder="0"
          allowFullScreen
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          title={`Embedded ${embed.type} video`}
          style={{ width: '100%', height: showControls && canEdit ? 'calc(100% - 28px)' : '100%', marginTop: showControls && canEdit ? '28px' : '0' }}
        />
      ) : (
        <div className="video-embed-error">
          ⚠️ Unable to render video
        </div>
      )}
    </div>
  );
}
