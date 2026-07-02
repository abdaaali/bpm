import React, { useState, useEffect } from 'react';
import {
  Box, Typography, Card, CardContent, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Chip, Paper, CircularProgress, Alert, Grid,
} from '@mui/material';
import { companyApi } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { format } from 'date-fns';

export default function TeamView() {
  const { user } = useAuth();
  const [team, setTeam] = useState<any[]>([]);
  const [company, setCompany] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([companyApi.getMyCompany(), companyApi.getTeam()])
      .then(([c, t]) => { setCompany(c.data); setTeam(t.data); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (!['company_admin', 'supervisor'].includes(user?.role || '')) {
    return <Alert severity="warning">You don't have access to team management.</Alert>;
  }

  return (
    <Box>
      <Typography variant="h4" fontWeight="bold" mb={3}>Team Overview</Typography>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {company && (
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <Typography variant="h6" fontWeight="bold">{company.company_name}</Typography>
                <Typography variant="body2" color="text.secondary" textTransform="capitalize">{company.company_type}</Typography>
              </Grid>
              <Grid item xs={6} sm={3}>
                <Typography variant="caption" color="text.secondary">Qualification</Typography>
                <Chip label={company.qualification_status} size="small" color={company.qualification_status === 'active' ? 'success' : 'warning'} sx={{ display: 'block', mt: 0.5, width: 'fit-content' }} />
              </Grid>
              <Grid item xs={6} sm={3}>
                <Typography variant="caption" color="text.secondary">Team Members</Typography>
                <Typography variant="h5" fontWeight="bold">{team.length}</Typography>
              </Grid>
            </Grid>
          </CardContent>
        </Card>
      )}

      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead>
            <TableRow sx={{ bgcolor: 'grey.50' }}>
              {['Name', 'Role', 'Email', 'Active Assignments', 'Last Login', 'Status'].map(h => (
                <TableCell key={h}><b>{h}</b></TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={6} align="center"><CircularProgress size={24} /></TableCell></TableRow>
            ) : team.map(m => (
              <TableRow key={m.id} hover>
                <TableCell sx={{ fontWeight: 'medium' }}>{m.full_name}</TableCell>
                <TableCell><Chip label={m.role} size="small" variant="outlined" sx={{ textTransform: 'capitalize' }} /></TableCell>
                <TableCell sx={{ color: 'text.secondary', fontSize: 12 }}>{m.email}</TableCell>
                <TableCell align="center">
                  <Chip label={m.active_assignments || 0} size="small" color={m.active_assignments > 3 ? 'warning' : 'default'} />
                </TableCell>
                <TableCell sx={{ color: 'text.secondary', fontSize: 12 }}>
                  {m.last_login_at ? format(new Date(m.last_login_at), 'MMM d, HH:mm') : 'Never'}
                </TableCell>
                <TableCell><Chip label={m.active ? 'Active' : 'Inactive'} size="small" color={m.active ? 'success' : 'default'} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}
