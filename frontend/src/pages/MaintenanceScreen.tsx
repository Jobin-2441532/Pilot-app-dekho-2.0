import React from 'react';

const MaintenanceScreen: React.FC = () => {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      height: '100vh',
      backgroundColor: '#f5efe6',
      color: '#1d1b18',
      textAlign: 'center',
      padding: '20px'
    }}>
      <h1 style={{ fontSize: '2rem', marginBottom: '16px' }}>🚧 Dekho is Under Maintenance</h1>
      <p style={{ fontSize: '1.125rem', marginBottom: '8px' }}>We're improving your financial experience.</p>
      <p style={{ fontSize: '1.125rem', marginBottom: '16px' }}>We'll be back shortly.</p>
      <p style={{ fontSize: '1rem', opacity: 0.8 }}>Thank you for your patience.</p>
    </div>
  );
};

export default MaintenanceScreen;
