
/**
 * UserList — displays connected users with color-coded avatars and role badges.
 * Highlights the current user with "(You)" label.
 *
 * @param {Object} props
 * @param {Array}  props.users          - Array of connected user objects
 * @param {Object} props.sessionMembers - Map of userId → { role }
 * @param {string} props.currentUserId  - Current user's socket ID
 * @param {string} props.userRole       - Current user's role
 */
const TOOL_GLYPH = {
  pencil: '/', line: '—', rectangle: '▢', circle: '○', text: 'T', select: '⌖',
};

export default function UserList({ users, sessionMembers, currentUserId, userRole, peerTools }) {
  // Same hash and the same shades as CursorPresence, so a person's dot in this list and
  // their cursor on the board are always the same colour.
  const getColor = (userId) => {
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
      hash = ((hash << 5) - hash) + userId.charCodeAt(i);
      hash |= 0;
    }
    const shades = ['#f0ece4', '#98928a', '#55504a', '#c9c3b8', '#7d776f'];
    return shades[Math.abs(hash) % shades.length];
  };

  const getRoleIcon = (role) => {
    switch(role) {
      case 'creator': return '*';
      case 'editor': return '+';
      case 'viewer': return '·';
      default: return '~';
    }
  };

  const getRoleColor = (role) => {
    switch(role) {
      case 'creator': return '#374151';
      case 'editor': return '#6b7280';
      case 'viewer': return '#9ca3af';
      default: return '#d1d5db';
    }
  };

  return (
    <div className="user-list">
      <h3>Online ({users.length})</h3>
      {users.map((userId, i) => {
        const role = sessionMembers?.[userId]?.role || 'viewer';
        
        return (
          <div key={userId} className="user-item">
            <span className="user-dot" style={{ background: getColor(userId) }} />
            <span className="user-name">
              {userId.slice(0, 8)}
              {userId === currentUserId && <span className="you-badge">(you)</span>}
            </span>
            {peerTools?.[userId] && userId !== currentUserId && (
              <span className="user-tool" title={`Using the ${peerTools[userId]} tool`}>
                {TOOL_GLYPH[peerTools[userId]] || peerTools[userId]}
              </span>
            )}
            <span 
              className="user-role"
              style={{ color: getRoleColor(role) }}
              title={`Role: ${role}`}
            >
              {getRoleIcon(role)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
