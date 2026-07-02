import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Box, Card, CardContent, TextField, Button, Typography, Alert,
  CircularProgress, InputAdornment, IconButton,
} from '@mui/material';
import { HardwareOutlined, Email, Lock, Visibility, VisibilityOff } from '@mui/icons-material';
import { useAuth } from '../auth/AuthContext';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { login, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as any)?.from?.pathname || '/';

  if (isAuthenticated) { navigate(from, { replace: true }); return null; }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate(from, { replace: true });
    } catch (err: any) {
      setError(err.response?.data?.message || 'Invalid email or password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#e65100', display: 'flex', alignItems: 'center', justifyContent: 'center', p: 2 }}>
      <Card sx={{ maxWidth: 440, width: '100%', borderRadius: 3 }}>
        <CardContent sx={{ p: 4 }}>
          {/* Logo/Header */}
          <Box textAlign="center" mb={4}>
            <Box sx={{ width: 72, height: 72, borderRadius: '50%', bgcolor: 'primary.main', display: 'flex', alignItems: 'center', justifyContent: 'center', mx: 'auto', mb: 2 }}>
              <HardwareOutlined sx={{ fontSize: 36, color: 'white' }} />
            </Box>
            <Typography variant="h5" fontWeight="bold" gutterBottom>Contractor Portal</Typography>
            <Typography variant="body2" color="text.secondary">Field Operations & Work Order Management</Typography>
          </Box>

          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

          <form onSubmit={handleSubmit}>
            <TextField
              label="Email Address" type="email" fullWidth value={email}
              onChange={e => setEmail(e.target.value)} required sx={{ mb: 2 }}
              InputProps={{ startAdornment: <InputAdornment position="start"><Email color="action" /></InputAdornment> }}
            />
            <TextField
              label="Password" type={showPwd ? 'text' : 'password'} fullWidth value={password}
              onChange={e => setPassword(e.target.value)} required sx={{ mb: 3 }}
              InputProps={{
                startAdornment: <InputAdornment position="start"><Lock color="action" /></InputAdornment>,
                endAdornment: <InputAdornment position="end"><IconButton onClick={() => setShowPwd(!showPwd)} edge="end">{showPwd ? <VisibilityOff /> : <Visibility />}</IconButton></InputAdornment>,
              }}
            />
            <Button type="submit" fullWidth variant="contained" size="large" disabled={loading || !email || !password}>
              {loading ? <CircularProgress size={24} color="inherit" /> : 'Sign In'}
            </Button>
          </form>

          <Box mt={3} textAlign="center">
            <Typography variant="caption" color="text.secondary">
              Access is by invitation only. Contact your operator administrator for credentials.
            </Typography>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
}
