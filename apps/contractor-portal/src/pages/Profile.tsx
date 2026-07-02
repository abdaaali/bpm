import React, { useState, useEffect } from 'react';
import { Box, Typography, Card, CardContent, Grid, Chip, Divider, Alert, CircularProgress } from '@mui/material';
import { Person, Business, Email, Phone, CalendarToday } from '@mui/icons-material';
import { authApi } from '../api/client';
import { format } from 'date-fns';
import { useAuth } from '../auth/AuthContext';

export default function Profile() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    authApi.getProfile()
      .then(r => { setProfile(r.data); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, []);

  if (loading) return <Box display="flex" justifyContent="center" mt={4}><CircularProgress /></Box>;
  if (error) return <Alert severity="error">{error}</Alert>;

  return (
    <Box>
      <Typography variant="h4" fontWeight="bold" mb={3}>My Profile</Typography>
      <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" gap={1} mb={2}>
                <Person color="primary" /><Typography variant="h6">User Information</Typography>
              </Box>
              <Divider sx={{ mb: 2 }} />
              {[
                { label: 'Full Name', value: profile?.full_name },
                { label: 'Username', value: profile?.username },
                { label: 'Email', value: profile?.email },
                { label: 'Role', value: profile?.role },
              ].map(f => (
                <Box key={f.label} display="flex" justifyContent="space-between" mb={1.5}>
                  <Typography variant="body2" color="text.secondary">{f.label}</Typography>
                  <Typography variant="body2" fontWeight="medium">{f.value}</Typography>
                </Box>
              ))}
              <Box display="flex" justifyContent="space-between" mb={1.5}>
                <Typography variant="body2" color="text.secondary">MFA</Typography>
                <Chip label={profile?.mfa_enabled ? 'Enabled' : 'Disabled'} size="small" color={profile?.mfa_enabled ? 'success' : 'default'} />
              </Box>
              {profile?.last_login_at && (
                <Box display="flex" justifyContent="space-between" mb={1.5}>
                  <Typography variant="body2" color="text.secondary">Last Login</Typography>
                  <Typography variant="body2">{format(new Date(profile.last_login_at), 'MMM d, yyyy HH:mm')}</Typography>
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" gap={1} mb={2}>
                <Business color="primary" /><Typography variant="h6">Company Information</Typography>
              </Box>
              <Divider sx={{ mb: 2 }} />
              {[
                { label: 'Company Name', value: profile?.company_name },
                { label: 'Company Type', value: profile?.company_type },
                { label: 'Email', value: profile?.company_email },
                { label: 'Phone', value: profile?.company_phone },
              ].map(f => f.value ? (
                <Box key={f.label} display="flex" justifyContent="space-between" mb={1.5}>
                  <Typography variant="body2" color="text.secondary">{f.label}</Typography>
                  <Typography variant="body2" fontWeight="medium">{f.value}</Typography>
                </Box>
              ) : null)}
              <Box display="flex" justifyContent="space-between" mb={1.5}>
                <Typography variant="body2" color="text.secondary">Qualification</Typography>
                <Chip label={profile?.qualification_status} size="small" color={profile?.qualification_status === 'active' ? 'success' : 'warning'} />
              </Box>
              {profile?.region_scope?.length > 0 && (
                <Box mb={1.5}>
                  <Typography variant="body2" color="text.secondary" mb={0.5}>Regions</Typography>
                  <Box display="flex" flexWrap="wrap" gap={0.5}>
                    {profile.region_scope.map((r: string) => <Chip key={r} label={r} size="small" />)}
                  </Box>
                </Box>
              )}
              {profile?.capabilities?.length > 0 && (
                <Box>
                  <Typography variant="body2" color="text.secondary" mb={0.5}>Capabilities</Typography>
                  <Box display="flex" flexWrap="wrap" gap={0.5}>
                    {profile.capabilities.map((c: string) => <Chip key={c} label={c} size="small" variant="outlined" />)}
                  </Box>
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}
