import { useState } from 'react';
import './TextFormattingToolbar.css';

/**
 * TextFormattingToolbar — floating toolbar for text styling.
 * Provides bold, italic, underline toggles and font size control.
 * Appears near the selected text box.
 *
 * @param {Object}   props
 * @param {boolean}  props.isVisible   - Whether the toolbar is shown
 * @param {boolean}  props.isBold      - Current bold state
 * @param {boolean}  props.isItalic    - Current italic state
 * @param {boolean}  props.isUnderline - Current underline state
 * @param {number}   props.fontSize    - Current font size
 * @param {Function} props.onBoldToggle      - Toggle bold
 * @param {Function} props.onItalicToggle    - Toggle italic
 * @param {Function} props.onUnderlineToggle - Toggle underline
 * @param {Function} props.onFontSizeChange  - Change font size
 */
export default function TextFormattingToolbar({ 
  isVisible, 
  selectedTextId, 
  onFormatChange,
  currentFormatting = {}
}) {
  const [fontSize, setFontSize] = useState(currentFormatting.fontSize || 16);
  const [bold, setBold] = useState(currentFormatting.bold || false);
  const [italic, setItalic] = useState(currentFormatting.italic || false);
  const [underline, setUnderline] = useState(currentFormatting.underline || false);
  const [strikethrough, setStrikethrough] = useState(currentFormatting.strikethrough || false);
  const [color, setColor] = useState(currentFormatting.color || '#000000');

  const handleBoldToggle = () => {
    const newBold = !bold;
    setBold(newBold);
    onFormatChange(selectedTextId, { ...currentFormatting, bold: newBold });
  };

  const handleItalicToggle = () => {
    const newItalic = !italic;
    setItalic(newItalic);
    onFormatChange(selectedTextId, { ...currentFormatting, italic: newItalic });
  };

  const handleUnderlineToggle = () => {
    const newUnderline = !underline;
    setUnderline(newUnderline);
    onFormatChange(selectedTextId, { ...currentFormatting, underline: newUnderline });
  };

  const handleStrikethroughToggle = () => {
    const newStrikethrough = !strikethrough;
    setStrikethrough(newStrikethrough);
    onFormatChange(selectedTextId, { ...currentFormatting, strikethrough: newStrikethrough });
  };

  const handleFontSizeChange = (e) => {
    const newSize = parseInt(e.target.value);
    setFontSize(newSize);
    onFormatChange(selectedTextId, { ...currentFormatting, fontSize: newSize });
  };

  const handleColorChange = (e) => {
    const newColor = e.target.value;
    setColor(newColor);
    onFormatChange(selectedTextId, { ...currentFormatting, color: newColor });
  };

  if (!isVisible || !selectedTextId) return null;

  return (
    <div className="text-formatting-toolbar">
      <div className="formatting-group">
        <button
          className={`format-button ${bold ? 'active' : ''}`}
          onClick={handleBoldToggle}
          title="Bold (Ctrl+B)"
        >
          <strong>B</strong>
        </button>
        <button
          className={`format-button ${italic ? 'active' : ''}`}
          onClick={handleItalicToggle}
          title="Italic (Ctrl+I)"
        >
          <em>I</em>
        </button>
        <button
          className={`format-button ${underline ? 'active' : ''}`}
          onClick={handleUnderlineToggle}
          title="Underline (Ctrl+U)"
        >
          <u>U</u>
        </button>
        <button
          className={`format-button ${strikethrough ? 'active' : ''}`}
          onClick={handleStrikethroughToggle}
          title="Strikethrough"
        >
          <s>S</s>
        </button>
      </div>

      <div className="formatting-group">
        <label className="font-size-label">
          Size:
          <select value={fontSize} onChange={handleFontSizeChange} className="font-size-select">
            <option value={12}>12px</option>
            <option value={14}>14px</option>
            <option value={16}>16px</option>
            <option value={18}>18px</option>
            <option value={20}>20px</option>
            <option value={24}>24px</option>
            <option value={28}>28px</option>
            <option value={32}>32px</option>
          </select>
        </label>
      </div>

      <div className="formatting-group">
        <input
          type="color"
          value={color}
          onChange={handleColorChange}
          className="color-input"
          title="Text color"
        />
      </div>
    </div>
  );
}
