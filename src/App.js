import { useState, useEffect } from 'react';
import Auth from './components/Auth';
import Chat from './components/Chat';
import YouTubeDownload from './components/YouTubeDownload';
import { getUserProfile } from './services/mongoApi';
import './App.css';

function App() {
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState('chat');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem('chatapp_user');
    if (stored) {
      getUserProfile(stored)
        .then((profile) => {
          setUser({ username: profile.username, firstName: profile.firstName, lastName: profile.lastName });
        })
        .catch(() => {
          setUser({ username: stored, firstName: '', lastName: '' });
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const handleLogin = (userObj) => {
    localStorage.setItem('chatapp_user', userObj.username);
    setUser(userObj);
  };

  const handleLogout = () => {
    localStorage.removeItem('chatapp_user');
    setUser(null);
    setActiveTab('chat');
  };

  if (loading) return null;

  if (user) {
    return (
      <div className="app-root">
        <div className="app-tabs">
          <button
            className={`app-tab${activeTab === 'chat' ? ' active' : ''}`}
            onClick={() => setActiveTab('chat')}
          >
            Chat
          </button>
          <button
            className={`app-tab${activeTab === 'youtube' ? ' active' : ''}`}
            onClick={() => setActiveTab('youtube')}
          >
            YouTube Channel Download
          </button>
        </div>
        {activeTab === 'chat' ? (
          <Chat user={user} onLogout={handleLogout} />
        ) : (
          <YouTubeDownload user={user} onLogout={handleLogout} />
        )}
      </div>
    );
  }
  return <Auth onLogin={handleLogin} />;
}

export default App;
