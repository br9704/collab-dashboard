import './UserList.css';

export default function UserList({ users, currentUserId }) {
  const getColor = (index) => {
    const colors = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#ffa502', '#a8e6cf'];
    return colors[index % colors.length];
  };

  return (
    <div className="user-list">
      <h3>Online ({users.length})</h3>
      {users.map((userId, i) => (
        <div key={userId} className="user-item">
          <span className="user-dot" style={{ background: getColor(i) }} />
          <span className="user-name">
            {userId.slice(0, 8)}
            {userId === currentUserId && <span className="you-badge">(you)</span>}
          </span>
        </div>
      ))}
    </div>
  );
}
