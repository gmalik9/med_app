import React, { useState } from 'react';

interface HeaderProps {
  onNavigate: (step: 'search' | 'dashboard' | 'patients' | 'profile') => void;
  userEmail?: string;
  onLogout: () => void;
}

export default function Header({ onNavigate, userEmail, onLogout }: HeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = React.useState(typeof window !== 'undefined' && window.innerWidth <= 768);

  React.useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleMenuItemClick = (step: 'search' | 'dashboard' | 'patients' | 'profile') => {
    onNavigate(step);
    setMenuOpen(false);
  };

  const handleTitleClick = () => {
    onNavigate('search');
    setMenuOpen(false);
  };

  const handleLogout = () => {
    onLogout();
    setMenuOpen(false);
  };

  return (
    <>
      <header
        style={{
          backgroundColor: 'white',
          borderBottom: '1px solid #e0e0e0',
          padding: isMobile ? '12px 16px' : '16px 24px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          boxShadow: '0 2px 4px rgba(0, 0, 0, 0.05)',
          position: 'relative',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? '8px' : '24px', flex: 1 }}>
          <h1
            style={{
              margin: 0,
              fontSize: isMobile ? '20px' : '24px',
              color: '#333',
              cursor: 'pointer',
              padding: '8px 0',
              transition: 'opacity 0.2s',
            }}
            onClick={handleTitleClick}
            onMouseEnter={(e) => {
              e.currentTarget.style.opacity = '0.7';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.opacity = '1';
            }}
            title="Go to Medical Notes"
          >
            🏥 Medical Notes
          </h1>

          {!isMobile && (
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={() => onNavigate('dashboard')}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#0066cc',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '600',
                  whiteSpace: 'nowrap',
                }}
              >
                Dashboard
              </button>
              <button
                onClick={() => onNavigate('patients')}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#0066cc',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '600',
                  whiteSpace: 'nowrap',
                }}
              >
                View All Patients
              </button>
            </div>
          )}
        </div>

        {isMobile ? (
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            style={{
              backgroundColor: 'transparent',
              border: 'none',
              fontSize: '24px',
              cursor: 'pointer',
              padding: '8px',
            }}
            title={menuOpen ? 'Close menu' : 'Open menu'}
          >
            ☰
          </button>
        ) : (
          <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
            <span style={{ fontSize: '14px', color: '#666' }}>{userEmail}</span>
            <button
              onClick={() => onNavigate('profile')}
              style={{
                padding: '8px 16px',
                backgroundColor: '#0066cc',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '600',
              }}
            >
              👤 Profile
            </button>
            <button
              onClick={handleLogout}
              style={{
                padding: '8px 16px',
                backgroundColor: '#f0f0f0',
                border: '1px solid #ddd',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '14px',
              }}
            >
              Logout
            </button>
          </div>
        )}
      </header>

      {isMobile && menuOpen && (
        <nav
          style={{
            position: 'absolute',
            top: '56px',
            left: 0,
            right: 0,
            backgroundColor: 'white',
            borderBottom: '1px solid #e0e0e0',
            boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
            zIndex: 1000,
            display: 'flex',
            flexDirection: 'column',
            padding: '8px',
            gap: '8px',
          }}
        >
          <button
            style={{
              padding: '12px',
              backgroundColor: '#f5f5f5',
              border: '1px solid #ddd',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px',
              textAlign: 'left',
            }}
            onClick={() => handleMenuItemClick('search')}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#e8e8e8';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = '#f5f5f5';
            }}
          >
            📋 Medical Notes
          </button>
          <button
            style={{
              padding: '12px',
              backgroundColor: '#f5f5f5',
              border: '1px solid #ddd',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px',
              textAlign: 'left',
            }}
            onClick={() => handleMenuItemClick('dashboard')}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#e8e8e8';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = '#f5f5f5';
            }}
          >
            Dashboard
          </button>
          <button
            style={{
              padding: '12px',
              backgroundColor: '#f5f5f5',
              border: '1px solid #ddd',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px',
              textAlign: 'left',
            }}
            onClick={() => handleMenuItemClick('patients')}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#e8e8e8';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = '#f5f5f5';
            }}
          >
            View All Patients
          </button>
          <hr style={{ margin: '4px 0', borderColor: '#e0e0e0' }} />
          <button
            style={{
              padding: '12px',
              backgroundColor: '#f5f5f5',
              border: '1px solid #ddd',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px',
              textAlign: 'left',
              color: '#333',
            }}
            onClick={() => handleMenuItemClick('profile')}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#e8e8e8';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = '#f5f5f5';
            }}
          >
            👤 Profile
          </button>
          <button
            style={{
              padding: '12px',
              backgroundColor: '#f5f5f5',
              border: '1px solid #ddd',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px',
              textAlign: 'left',
            }}
            onClick={handleLogout}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#e8e8e8';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = '#f5f5f5';
            }}
          >
            Logout
          </button>
          <div style={{ fontSize: '12px', color: '#999', padding: '8px 12px', textAlign: 'center' }}>
            {userEmail}
          </div>
        </nav>
      )}
    </>
  );
}
