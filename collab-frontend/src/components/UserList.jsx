import './UserList.css';

export default function UserList({ users, sessionMembers, currentUserId, userRole }) {
  const getColor = (index) => {
    const colors = ['#ff6b6b', '#4ecdc4', '#6b7280', '#ffa502', '#a8e6cf'];
    return colors[index % colors.length];
  };

  const getRoleIcon = (role) => {
    switch(role) {
      case 'creator': return '👑';
      case 'editor': return '✏️';
      case 'viewer': return '👁️';
      default: return '👤';
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
            <span className="user-dot" style={{ background: getColor(i) }} />
            <span className="user-name">
              {userId.slice(0, 8)}
              {userId === currentUserId && <span className="you-badge">(you)</span>}
            </span>
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
