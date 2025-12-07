
import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  useEffect(() => {
      // Direct redirect to connect, bypassing login completely
      navigate('/connect');
  }, []);
  return null;
};

export default LoginPage;
